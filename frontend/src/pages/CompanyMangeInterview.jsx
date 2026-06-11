import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Container,
  Stack,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Avatar,
  Divider,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  HistoryEdu as InterviewIcon,
  Person as UserIcon,
  WorkOutline as PositionIcon,
  EventAvailable as DateIcon,
  Place as LocationIcon,
  Description as NoteIcon,
  Balance as ArbitrationIcon,
  HourglassEmpty as PendingArbitrationIcon,
  ManageSearch as ReviewingArbitrationIcon,
  TaskAlt as ResolvedArbitrationIcon,
} from '@mui/icons-material';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';
import { p256 } from '@noble/curves/p256';
import { getBytes, toUtf8String } from 'ethers';
import { decryptWithMetaMask } from '../../utils/encryption';

const API_BASE = 'http://localhost:3000';

function CompanyManageInterview() {
  useAuthGuard('enterprise');

  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMap, setEditingMap] = useState({});
  const [formMap, setFormMap] = useState({});
  const [savingId, setSavingId] = useState(null);

  const address = sessionStorage.getItem('address');

  const arbitrationStatusConfig = {
    none: {
      label: 'No Dispute',
      color: 'default',
      icon: null,
    },
    submitted: {
      label: 'Dispute Submitted',
      color: 'warning',
      icon: <PendingArbitrationIcon />,
    },
    reviewing: {
      label: 'Under Government Review',
      color: 'info',
      icon: <ReviewingArbitrationIcon />,
    },
    resolved: {
      label: 'Arbitration Resolved',
      color: 'success',
      icon: <ResolvedArbitrationIcon />,
    },
  };

  const arbitrationResultLabelMap = {
    support_seeker: 'Support Seeker',
    support_company: 'Support Company',
    partial_support: 'Partial Support',
    unable_to_determine: 'Unable To Determine',
  };

  const stableStringify = (obj) => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  };

  const pemToDer = (pem) => {
    const b64 = pem
      .replace(/-----BEGIN [^-]+-----/g, "")
      .replace(/-----END [^-]+-----/g, "")
      .replace(/\s+/g, "");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  };

  const b64urlToBytes = (b64url) => {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const b64ToU8 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  const pkcs8PemToP256Scalar = async (pkcs8Pem) => {
    const keyData = pemToDer(pkcs8Pem);

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );

    const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
    if (!jwk?.d) throw new Error("exported JWK missing d");

    const dBytes = b64urlToBytes(jwk.d);

    if (dBytes.length === 32) return dBytes;
    const out = new Uint8Array(32);
    out.set(dBytes.slice(-32), 32 - Math.min(32, dBytes.length));
    return out;
  };

  const getAppKeyScalarOrThrow = async (address) => {
    const encryptedAppKey = sessionStorage.getItem("encryptedAppKey");
    if (!encryptedAppKey) {
      throw new Error("Can not find encryptedAppKey in sessionStorage. Please log in again.");
    }

    const decryptedRaw = (await decryptWithMetaMask(encryptedAppKey, address))?.trim?.() ?? "";

    const text = decryptedRaw.startsWith("0x")
      ? toUtf8String(getBytes(decryptedRaw)).trim()
      : decryptedRaw;

    if (!text.includes("BEGIN PRIVATE KEY")) {
      throw new Error("Decrypted AppKey is not in PKCS8 format (missing BEGIN PRIVATE KEY).");
    }

    return await pkcs8PemToP256Scalar(text);
  };

  const signBytesWithScalarToDerB64 = async (bytesU8, dBytes) => {
    const sig = p256.sign(bytesU8, dBytes, { prehash: true });

    if (typeof sig.toDERHex === "function") {
      const derHex = sig.toDERHex();
      const clean = derHex.replace(/^0x/, "");
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    }

    if (typeof sig.toDER === "function") {
      const der = sig.toDER();
      return btoa(String.fromCharCode(...der));
    }

    throw new Error("noble signature object has no DER encoder.");
  };

  const fetchInterviews = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/interview/company/${address}`);
      const list = res.data.interviews || [];
      setInterviews(list);

      const initialFormMap = {};
      list.forEach((item) => {
        initialFormMap[item._id] = {
          result: item.result || 'pending',
          comment: item.comment || '',
        };
      });
      setFormMap(initialFormMap);
    } catch (err) {
      console.error('❌ Failed to fetch interviews:', err);
      alert('Failed to fetch interview records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (address) {
      fetchInterviews();
    }
  }, [address]);

  const handleEdit = (id) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: true,
    }));
  };

  const handleCancelEdit = (id, original) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: false,
    }));

    setFormMap((prev) => ({
      ...prev,
      [id]: {
        result: original.result || 'pending',
        comment: original.comment || '',
      },
    }));
  };

  const handleChange = (id, field, value) => {
    setFormMap((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value,
      },
    }));
  };

  const handleSave = async (id) => {
    try {
      setSavingId(id);

      if (!window.ethereum) {
        throw new Error('MetaMask is not installed');
      }

      if (!address) {
        throw new Error('Wallet address not found in sessionStorage');
      }

      const lowerAddress = address.toLowerCase();
      const result = formMap[id]?.result || 'pending';
      const comment = formMap[id]?.comment || '';
      const ts = Date.now();

      const targetInterview = interviews.find((item) => item._id === id);
      if (!targetInterview) {
        throw new Error('Interview record not found');
      }

      const authPayload = {
        address: lowerAddress,
        interviewId: String(id),
        result: String(result),
        comment: String(comment),
        ts: Number(ts),
      };

      const message = `UpdateInterviewResult(start) ${stableStringify(authPayload)}`;

      const flatSignature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, lowerAddress],
      });

      let chainPayload;
      if (result === 'pass' || result === 'fail') {
        chainPayload = {
          position: String(targetInterview.invitationId?.position || ''),
          company: String(
            targetInterview.invitationId?.company ||
            targetInterview.invitationId?.companyId ||
            ''
          ),
          department: String(targetInterview.invitationId?.department || ''),
          seekerAddress: String(targetInterview.invitationId?.seekerId || '').toLowerCase(),
          result,
        };

        if (
          !chainPayload.position ||
          !chainPayload.company ||
          !chainPayload.department ||
          !chainPayload.seekerAddress
        ) {
          console.error('targetInterview =', targetInterview);
          throw new Error('chainPayload required fields are missing');
        }
      }

      // Step 1: start
      const startRes = await axios.patch(`${API_BASE}/interview/${id}/start`, {
        address: lowerAddress,
        result,
        comment,
        ts,
        signature: {
          flat: flatSignature,
          message,
        },
        chainPayload,
      });

      if (!startRes.data?.success) {
        throw new Error(startRes.data?.msg || 'Failed to start interview update');
      }

      // 先更新畫面上的 DB 結果
      setInterviews((prev) =>
        prev.map((item) =>
          item._id === id
            ? {
                ...item,
                result,
                comment,
              }
            : item
        )
      );

      // pending 不上鏈
      if (!startRes.data?.onchain) {
        setEditingMap((prev) => ({
          ...prev,
          [id]: false,
        }));
        alert('✅ Interview result updated successfully');
        return;
      }

      const { token, proposalBytesB64 } = startRes.data;
      if (!token || !proposalBytesB64) {
        throw new Error('Missing token or proposalBytesB64 from /start');
      }

      // Step 2: 用 AppKey 簽 proposal bytes
      const appKeyDBytes = await getAppKeyScalarOrThrow(lowerAddress);
      const proposalBytes = b64ToU8(proposalBytesB64);
      const endorsementSignatureDerB64 = await signBytesWithScalarToDerB64(
        proposalBytes,
        appKeyDBytes
      );

      const finishRes1 = await axios.patch(`${API_BASE}/interview/${id}/finish`, {
        address: lowerAddress,
        token,
        endorsementSignatureDerB64,
      });

      if (!finishRes1.data?.success) {
        throw new Error(finishRes1.data?.msg || 'finish(endorsement) failed');
      }

      const { commitBytesB64 } = finishRes1.data;
      if (!commitBytesB64) {
        throw new Error('Missing commitBytesB64 from finish(endorsement)');
      }

      // Step 3: 用 AppKey 簽 commit bytes
      const commitBytes = b64ToU8(commitBytesB64);
      const commitSignatureDerB64 = await signBytesWithScalarToDerB64(
        commitBytes,
        appKeyDBytes
      );

      const finishRes2 = await axios.patch(`${API_BASE}/interview/${id}/finish`, {
        address: lowerAddress,
        token,
        commitSignatureDerB64,
      });

      if (!finishRes2.data?.success) {
        throw new Error(finishRes2.data?.msg || 'finish(commit) failed');
      }

      setEditingMap((prev) => ({
        ...prev,
        [id]: false,
      }));

      alert('✅ Interview result updated and committed on-chain successfully');
    } catch (err) {
      console.error('❌ Failed to save interview result:', err);
      alert(err?.response?.data?.msg || err?.message || 'Failed to update interview');
    } finally {
      setSavingId(null);
    }
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
          Loading Interview Records...
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        pt: 10,
        pb: 8,
      }}
    >
      <Container maxWidth="md">
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
            <InterviewIcon fontSize="large" />
            Manage Interview Records
          </Typography>

          <Typography variant="body1" color="text.secondary">
            Review interview details, update the final result, and track arbitration status.
          </Typography>
        </Box>

        {interviews.length === 0 ? (
          <Paper
            sx={{
              p: 6,
              textAlign: 'center',
              borderRadius: 4,
              bgcolor: 'rgba(255,255,255,0.6)',
            }}
          >
            <Typography variant="h6" color="text.secondary">
              No interview records found.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={3}>
            {interviews.map((intv) => {
              const isEditing = editingMap[intv._id];
              const isSaving = savingId === intv._id;
              const locked = intv.result === 'pass' || intv.result === 'fail';

              const disputeStatus = intv.disputeStatus || 'none';
              const arbitrationResult = intv.arbitrationResult || null;
              const arbitrationCfg =
                arbitrationStatusConfig[disputeStatus] || arbitrationStatusConfig.none;

              return (
                <Paper
                  key={intv._id}
                  elevation={6}
                  sx={{
                    p: 4,
                    borderRadius: 5,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Stack spacing={2.2}>
                    <Box>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        SEEKER
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        fontWeight={700}
                      >
                        <UserIcon fontSize="inherit" />
                        {intv.invitationId?.seekerId || 'N/A'}
                      </Typography>
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                      <Box flex={1}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          POSITION
                        </Typography>
                        <Typography
                          variant="body1"
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                          fontWeight={600}
                        >
                          <PositionIcon fontSize="inherit" />
                          {intv.invitationId?.position || 'N/A'}
                        </Typography>
                      </Box>

                      <Box flex={1}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          DEPARTMENT
                        </Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {intv.invitationId?.department || 'N/A'}
                        </Typography>
                      </Box>
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                      <Box flex={1}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          INTERVIEW DATE
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <DateIcon fontSize="inherit" />
                          {intv.interviewTime
                            ? new Date(intv.interviewTime).toLocaleString()
                            : 'N/A'}
                        </Typography>
                      </Box>

                      <Box flex={1}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          LOCATION
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <LocationIcon fontSize="inherit" />
                          {intv.location || 'N/A'}
                        </Typography>
                      </Box>
                    </Stack>

                    {intv.note && (
                      <Box
                        sx={{
                          bgcolor: 'rgba(0,0,0,0.03)',
                          p: 1.8,
                          borderRadius: 2.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          color="text.secondary"
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}
                        >
                          <NoteIcon fontSize="inherit" />
                          NOTE
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.8 }}>
                          {intv.note}
                        </Typography>
                      </Box>
                    )}

                    <Box
                      sx={{
                        bgcolor: 'rgba(25, 118, 210, 0.04)',
                        p: 1.8,
                        borderRadius: 2.5,
                        border: '1px solid rgba(25, 118, 210, 0.12)',
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        color="primary.main"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.7,
                          letterSpacing: 1.1,
                        }}
                      >
                        <ArbitrationIcon fontSize="inherit" />
                        ARBITRATION STATUS
                      </Typography>

                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={1.5}
                        alignItems={{ xs: 'flex-start', sm: 'center' }}
                        sx={{ mt: 1 }}
                      >
                        <Chip
                          icon={arbitrationCfg.icon}
                          label={arbitrationCfg.label}
                          color={arbitrationCfg.color}
                          variant={disputeStatus === 'none' ? 'outlined' : 'filled'}
                          sx={{ fontWeight: 700 }}
                        />

                        {arbitrationResult && (
                          <Chip
                            label={
                              arbitrationResultLabelMap[arbitrationResult] ||
                              arbitrationResult
                            }
                            color="success"
                            variant="outlined"
                            sx={{ fontWeight: 700 }}
                          />
                        )}
                      </Stack>

                      {disputeStatus !== 'none' && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2 }}>
                          {disputeStatus === 'submitted' &&
                            'A dispute has been submitted by the seeker and is waiting for government processing.'}
                          {disputeStatus === 'reviewing' &&
                            'This interview result is currently under government arbitration review.'}
                          {disputeStatus === 'resolved' &&
                            'The government has completed the arbitration process for this interview result.'}
                        </Typography>
                      )}
                    </Box>

                    <Divider />

                    <Stack spacing={2}>
                      <TextField
                        select
                        fullWidth
                        label="Interview Result"
                        value={formMap[intv._id]?.result || 'pending'}
                        disabled={!isEditing || locked || isSaving}
                        onChange={(e) =>
                          handleChange(intv._id, 'result', e.target.value)
                        }
                      >
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="pass">Pass</MenuItem>
                        <MenuItem value="fail">Fail</MenuItem>
                      </TextField>

                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        label="Comment"
                        value={formMap[intv._id]?.comment || ''}
                        disabled={!isEditing || isSaving}
                        onChange={(e) =>
                          handleChange(intv._id, 'comment', e.target.value)
                        }
                      />
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pt: 1 }}>
                      {!isEditing ? (
                        <Button
                          fullWidth
                          variant="contained"
                          startIcon={<EditIcon />}
                          onClick={() => handleEdit(intv._id)}
                          disabled={locked}
                          sx={{
                            borderRadius: 3,
                            py: 1.4,
                            fontWeight: 700,
                            boxShadow: 4,
                          }}
                        >
                          {locked ? 'Result Locked' : 'Edit Result'}
                        </Button>
                      ) : (
                        <>
                          <Button
                            fullWidth
                            variant="contained"
                            startIcon={
                              isSaving ? (
                                <CircularProgress size={18} color="inherit" />
                              ) : (
                                <SaveIcon />
                              )
                            }
                            onClick={() => handleSave(intv._id)}
                            disabled={isSaving}
                            sx={{
                              borderRadius: 3,
                              py: 1.4,
                              fontWeight: 700,
                              boxShadow: 4,
                            }}
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </Button>

                          <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => handleCancelEdit(intv._id, intv)}
                            disabled={isSaving}
                            sx={{
                              borderRadius: 3,
                              py: 1.4,
                              fontWeight: 700,
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Container>
    </Box>
  );
}

export default CompanyManageInterview;