import {
  Box,
  Typography,
  Stack,
  Paper,
  CircularProgress,
  Button,
  Container,
  Divider,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from '@mui/material';
import {
  AssignmentTurnedIn as ResultIcon,
  AccessTime as TimeIcon,
  CloudUpload as OnchainIcon,
  CheckCircle as PassIcon,
  Cancel as FailIcon,
  HourglassEmpty as PendingIcon,
  Gavel as DisputeIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import useAuthGuard from '../hooks/useAuthGuard';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { getBytes, toUtf8String } from 'ethers';
import { p256 } from '@noble/curves/p256';
import { decryptWithMetaMask } from '../../utils/encryption';

const API_BASE = 'http://localhost:3000';

/* === Cryptographic Helpers (Logic Unchanged) === */
const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

const b64ToU8 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const pemToDer = (pem) => {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const b64urlToBytes = (b64url) => {
  const b64 =
    b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const pkcs8PemToP256Scalar = async (pkcs8Pem) => {
  const keyData = pemToDer(pkcs8Pem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  );
  const jwk = await crypto.subtle.exportKey('jwk', cryptoKey);
  const dBytes = b64urlToBytes(jwk.d);
  if (dBytes.length === 32) return dBytes;
  const out = new Uint8Array(32);
  out.set(dBytes.slice(-32), 32 - Math.min(32, dBytes.length));
  return out;
};

const getAppKeyScalarOrThrow = async (addressLower) => {
  const encryptedAppKey = sessionStorage.getItem('encryptedAppKey');
  if (!encryptedAppKey) throw new Error('Missing encryptedAppKey. Please login again.');
  const decryptedRaw =
    (await decryptWithMetaMask(encryptedAppKey, addressLower))?.trim?.() ?? '';
  const text = decryptedRaw.startsWith('0x')
    ? toUtf8String(getBytes(decryptedRaw)).trim()
    : decryptedRaw;
  return await pkcs8PemToP256Scalar(text);
};

const signBytesWithScalarToDerB64 = async (bytesU8, dBytes) => {
  const sig = p256.sign(bytesU8, dBytes, { prehash: true });
  if (typeof sig.toDERHex === 'function') {
    const derHex = sig.toDERHex();
    const clean = derHex.replace(/^0x/, '');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return btoa(String.fromCharCode(...bytes));
  }
  throw new Error('Signature object has no DER encoder.');
};

/* === UI Helpers === */
const disputeStatusConfig = {
  none: { label: 'No Dispute', color: 'default' },
  submitted: { label: 'Dispute Submitted', color: 'warning' },
  reviewing: { label: 'Under Review', color: 'info' },
  resolved: { label: 'Resolved', color: 'success' },
};

const arbitrationResultLabel = {
  support_seeker: 'Support Seeker',
  support_company: 'Support Company',
  partial_support: 'Partial Support',
  unable_to_determine: 'Unable To Determine',
};

const disputeReasonOptions = [
  { value: 'result_mismatch', label: 'Result Mismatch' },
  { value: 'unfair_decision', label: 'Unfair Decision' },
  { value: 'incorrect_record', label: 'Incorrect Record' },
  { value: 'other', label: 'Other' },
];

function SeekerInterviewResultsPage() {
  useAuthGuard('jobseeker');

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [currentDisputeInterview, setCurrentDisputeInterview] = useState(null);
  const [disputeReason, setDisputeReason] = useState('result_mismatch');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const address = sessionStorage.getItem('address')?.toLowerCase();

  const fetchResults = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/interview/seeker/${address}`);
      setResults(res.data.interviews || []);
    } catch (err) {
      console.error('❌ Failed to fetch results:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (address) fetchResults();
  }, [address]);

  const handleConfirmOnchain = async (itv) => {
    const interviewId = itv?._id;
    try {
      setBusyId(interviewId);
      const seekerAddress = sessionStorage.getItem('address')?.toLowerCase();
      const ts = Date.now();
      const authPayload = {
        address: seekerAddress,
        interviewId: String(interviewId),
        result: String(itv.result),
        ts: Number(ts),
      };
      const authCanonical = stableStringify(authPayload);
      const message = `ConfirmInterviewOnchain(start) ${authCanonical}`;
      const sigFlat = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, seekerAddress],
      });

      const chainPayload = {
        position: String(itv.invitationId?.position || ''),
        company: String(itv.invitationId?.companyId || ''),
        department: String(itv.invitationId?.department || ''),
        companyAddress: String(itv.companyAddress || ''),
        result: String(itv.result),
      };

      const startResp = await axios.patch(
        `${API_BASE}/interview/${interviewId}/seeker/start`,
        {
          address: seekerAddress,
          ts,
          signature: { flat: sigFlat, message },
          chainPayload,
        }
      );

      if (!startResp.data?.success) {
        throw new Error(startResp.data?.msg || 'start failed');
      }

      const { token, proposalBytesB64 } = startResp.data;
      const dBytes = await getAppKeyScalarOrThrow(seekerAddress);
      const endorsementSignatureDerB64 = await signBytesWithScalarToDerB64(
        b64ToU8(proposalBytesB64),
        dBytes
      );

      const finish1 = await axios.patch(
        `${API_BASE}/interview/${interviewId}/seeker/finish`,
        {
          address: seekerAddress,
          token,
          endorsementSignatureDerB64,
        }
      );

      const { commitBytesB64 } = finish1.data;
      const commitSignatureDerB64 = await signBytesWithScalarToDerB64(
        b64ToU8(commitBytesB64),
        dBytes
      );

      await axios.patch(`${API_BASE}/interview/${interviewId}/seeker/finish`, {
        address: seekerAddress,
        token,
        endorsementSignatureDerB64,
        commitSignatureDerB64,
      });

      alert('✅ Result successfully committed to your personal profile blockchain');
      setResults(prev =>
        prev.map(r =>
          r._id === interviewId
            ? { ...r, onchainStatus: 'confirmed' }
            : r
        )
      );
    } catch (err) {
      alert(err?.response?.data?.msg || err?.message || 'On-chain confirmation failed');
    } finally {
      setBusyId(null);
    }
  };

  const openDisputeDialog = (itv) => {
    setCurrentDisputeInterview(itv);
    setDisputeReason('result_mismatch');
    setDisputeDescription('');
    setDisputeDialogOpen(true);
  };

  const closeDisputeDialog = () => {
    if (submittingDispute) return;
    setDisputeDialogOpen(false);
    setCurrentDisputeInterview(null);
    setDisputeReason('result_mismatch');
    setDisputeDescription('');
  };

  const handleSubmitDispute = async () => {
    try {
      if (!currentDisputeInterview?._id) {
        throw new Error('Missing interview record');
      }

      if (!disputeReason) {
        throw new Error('Please select a dispute reason');
      }

      setSubmittingDispute(true);

      const seekerAddress = sessionStorage.getItem('address')?.toLowerCase();
      const ts = Date.now();

      const payload = {
        address: seekerAddress,
        interviewId: String(currentDisputeInterview._id),
        reason: String(disputeReason),
        description: disputeDescription || '',
        ts: Number(ts),
      };

      const canonical = stableStringify(payload);
      const message = `CreateInterviewDispute ${canonical}`;

      const sigFlat = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, seekerAddress],
      });

      const res = await axios.post(`${API_BASE}/interview/createArbitration`, {
        ...payload,
        signature: {
          flat: sigFlat,
          message,
        },
      });

      if (!res.data?.success) {
        throw new Error(res.data?.msg || 'Failed to create dispute');
      }

      alert('✅ Dispute submitted successfully');
      closeDisputeDialog();
      await fetchResults();
    } catch (err) {
      alert(err?.response?.data?.msg || err?.message || 'Failed to submit dispute');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const renderDisputeActionButton = (itv) => {
    const resultReady = ['pass', 'fail'].includes(itv.result);
    const disputeStatus = itv.disputeStatus || 'none';

    if (!resultReady) {
      return null;
    }

    if (disputeStatus === 'none') {
      return (
        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<DisputeIcon />}
          onClick={() => openDisputeDialog(itv)}
          sx={{
            borderRadius: 3,
            py: 1.5,
            fontWeight: 700,
          }}
        >
          File Dispute
        </Button>
      );
    }

    if (disputeStatus === 'submitted') {
      return (
        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<ViewIcon />}
          disabled
          sx={{
            borderRadius: 3,
            py: 1.5,
            fontWeight: 700,
          }}
        >
          Dispute Submitted
        </Button>
      );
    }

    if (disputeStatus === 'reviewing') {
      return (
        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<ViewIcon />}
          disabled
          sx={{
            borderRadius: 3,
            py: 1.5,
            fontWeight: 700,
          }}
        >
          Under Review
        </Button>
      );
    }

    if (disputeStatus === 'resolved') {
      return (
        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<ViewIcon />}
          disabled
          sx={{
            borderRadius: 3,
            py: 1.5,
            fontWeight: 700,
          }}
        >
          Arbitration Resolved
        </Button>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <Box
        sx={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        }}
      >
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>
          Loading Results...
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          width: '100vw',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          pt: 10,
          pb: 8,
        }}
      >
        <Container maxWidth="sm">
          <Box sx={{ textAlign: 'center', mb: 5 }}>
            <Typography
              variant="h3"
              fontWeight={900}
              color="primary.main"
              gutterBottom
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <ResultIcon fontSize="large" /> Interview Results
            </Typography>
            <Typography variant="body1" color="text.secondary">
              View your performance and commit verified outcomes to your chain.
            </Typography>
          </Box>

          {results.length === 0 ? (
            <Paper
              sx={{
                p: 6,
                textAlign: 'center',
                borderRadius: 4,
                bgcolor: 'rgba(255,255,255,0.6)',
              }}
            >
              <Typography variant="h6" color="text.secondary">
                No interview results found.
              </Typography>
            </Paper>
          ) : (
            <Stack spacing={3}>
              {results.map((itv) => {
                const canConfirm = ['pass', 'fail'].includes(itv.result);
                const isBusy = busyId === itv._id;
                const onchainStatus = itv.onchainStatus || 'unconfirmed';
                const disputeStatus = itv.disputeStatus || 'none';
                const disputeChipConfig =
                  disputeStatusConfig[disputeStatus] || disputeStatusConfig.none;

                const statusConfig = {
                  pass: {
                    color: '#4caf50',
                    label: 'Accepted / Pass',
                    icon: <PassIcon />,
                  },
                  fail: {
                    color: '#f44336',
                    label: 'Rejected / Fail',
                    icon: <FailIcon />,
                  },
                  pending: {
                    color: '#ff9800',
                    label: 'Awaiting Result',
                    icon: <PendingIcon />,
                  },
                };

                const currentStatus = statusConfig[itv.result] || statusConfig.pending;

                return (
                  <Paper
                    key={itv._id}
                    elevation={6}
                    sx={{
                      p: 4,
                      borderRadius: 5,
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(10px)',
                      borderLeft: `8px solid ${currentStatus.color}`,
                    }}
                  >
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          COMPANY
                        </Typography>
                        <Typography variant="h6" fontWeight={800}>
                          {itv.invitationId?.companyId || 'N/A'}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={3}>
                        <Box flex={1}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            POSITION
                          </Typography>
                          <Typography variant="body1" fontWeight={600}>
                            {itv.invitationId?.position || 'N/A'}
                          </Typography>
                        </Box>
                        <Box flex={1}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            DEPARTMENT
                          </Typography>
                          <Typography variant="body1">
                            {itv.invitationId?.department || 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>

                      <Box>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          INTERVIEW DATE
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <TimeIcon fontSize="inherit" />
                          {new Date(itv.interviewTime).toLocaleString()}
                        </Typography>
                      </Box>

                      <Divider sx={{ my: 1 }} />

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                        <Avatar sx={{ bgcolor: currentStatus.color }}>
                          {currentStatus.icon}
                        </Avatar>
                        <Typography
                          variant="h6"
                          fontWeight={900}
                          sx={{ color: currentStatus.color }}
                        >
                          {currentStatus.label}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={disputeChipConfig.label}
                          color={disputeChipConfig.color}
                          variant={disputeStatus === 'none' ? 'outlined' : 'filled'}
                        />
                        {disputeStatus === 'resolved' && itv.arbitrationResult && (
                          <Chip
                            label={
                              arbitrationResultLabel[itv.arbitrationResult] ||
                              itv.arbitrationResult
                            }
                            color="success"
                            variant="outlined"
                          />
                        )}
                      </Stack>

                      <Box sx={{ pt: 1 }}>
                        <Stack direction="row" spacing={2}>
                          <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            startIcon={isBusy ? <CircularProgress size={20} color="inherit" /> : <OnchainIcon />}
                            disabled={!canConfirm || isBusy || onchainStatus === 'confirmed'}
                            onClick={() => handleConfirmOnchain(itv)}
                          >
                            {onchainStatus === 'confirmed'
                              ? 'ALREADY CONFIRMED'
                              : isBusy
                              ? 'COMMITTING...'
                              : 'Confirm & Commit On-chain'}
                          </Button>

                          {renderDisputeActionButton(itv)}
                        </Stack>

                        {!canConfirm && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              mt: 1,
                              textAlign: 'center',
                              fontStyle: 'italic',
                            }}
                          >
                            Waiting for employer to finalize the result.
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Container>
      </Box>

      <Dialog
        open={disputeDialogOpen}
        onClose={closeDisputeDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 800 }}>File Interview Dispute</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                COMPANY
              </Typography>
              <Typography variant="body1" fontWeight={700}>
                {currentDisputeInterview?.invitationId?.companyId || 'N/A'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={2}>
              <Box flex={1}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  POSITION
                </Typography>
                <Typography variant="body2">
                  {currentDisputeInterview?.invitationId?.position || 'N/A'}
                </Typography>
              </Box>
              <Box flex={1}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  RESULT
                </Typography>
                <Typography variant="body2">
                  {currentDisputeInterview?.result || 'N/A'}
                </Typography>
              </Box>
            </Stack>

            <TextField
              select
              fullWidth
              label="Dispute Reason"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            >
              {disputeReasonOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth
              multiline
              minRows={4}
              label="Description"
              placeholder="Please describe why you want to dispute this interview result."
              value={disputeDescription}
              onChange={(e) => setDisputeDescription(e.target.value)}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeDisputeDialog} disabled={submittingDispute}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitDispute}
            disabled={submittingDispute}
            startIcon={
              submittingDispute ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <DisputeIcon />
              )
            }
          >
            {submittingDispute ? 'Submitting...' : 'Submit Dispute'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default SeekerInterviewResultsPage;