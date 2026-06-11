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
  Gavel as ArbitrationIcon,
  AccessTime as TimeIcon,
  Business as CompanyIcon,
  Person as SeekerIcon,
  FactCheck as ReviewIcon,
  CheckCircle as ResolveIcon,
  HourglassEmpty as PendingIcon,
  ManageSearch as ReviewingIcon,
  TaskAlt as ResolvedIcon,
  AssignmentTurnedIn as ResultIcon,
} from '@mui/icons-material';
import { useEffect, useState } from 'react';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';

const API_BASE = 'http://localhost:3000';

const statusConfig = {
  submitted: {
    label: 'Submitted',
    color: 'warning',
    icon: <PendingIcon />,
    borderColor: '#ff9800',
  },
  reviewing: {
    label: 'Reviewing',
    color: 'info',
    icon: <ReviewingIcon />,
    borderColor: '#2196f3',
  },
  resolved: {
    label: 'Resolved',
    color: 'success',
    icon: <ResolvedIcon />,
    borderColor: '#4caf50',
  },
};

const resultLabelMap = {
  pass: 'Pass',
  fail: 'Fail',
};

const arbitrationResultOptions = [
  { value: 'support_seeker', label: 'Support Seeker' },
  { value: 'support_company', label: 'Support Company' },
  { value: 'partial_support', label: 'Partial Support' },
  { value: 'unable_to_determine', label: 'Unable To Determine' },
];

const arbitrationResultLabelMap = {
  support_seeker: 'Support Seeker',
  support_company: 'Support Company',
  partial_support: 'Partial Support',
  unable_to_determine: 'Unable To Determine',
};

function GovernmentManageArbitration() {
  useAuthGuard('government');

  const [arbitrations, setArbitrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [currentArbitration, setCurrentArbitration] = useState(null);
  const [arbitrationResult, setArbitrationResult] = useState('support_seeker');
  const [arbitrationSummary, setArbitrationSummary] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);

  const governmentAddress = sessionStorage.getItem('address')?.toLowerCase();

  const signMessage = async (message) => {
    if (!governmentAddress) {
      throw new Error('Missing government address. Please login again.');
    }

    const sigFlat = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, governmentAddress],
    });

    return sigFlat;
  };

  const fetchArbitrations = async () => {
    try {
      setLoading(true);

      const message = 'GetAllArbitrations';
      const signatureFlat = await signMessage(message);

      const res = await axios.get(`${API_BASE}/arbitration/getArbitrations`, {
        params: {
          address: governmentAddress,
          signatureFlat,
        },
      });

      setArbitrations(res.data.disputes || []);
    } catch (err) {
      console.error('❌ Failed to fetch arbitrations:', err);
      alert(err?.response?.data?.msg || err?.message || 'Failed to fetch arbitrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (governmentAddress) {
      fetchArbitrations();
    } else {
      setLoading(false);
    }
  }, [governmentAddress]);

  const handleStartReview = async (item) => {
    const disputeId = item?._id;
    if (!disputeId) return;

    try {
      setBusyId(disputeId);

      const message = `StartReviewArbitration:${disputeId}`;
      const sigFlat = await signMessage(message);

      const res = await axios.patch(
        `${API_BASE}/arbitration/update/${disputeId}/review`,
        {
          address: governmentAddress,
          signature: { flat: sigFlat },
        }
      );

      if (!res.data?.success) {
        throw new Error(res.data?.msg || 'Failed to start review');
      }

      alert('✅ Arbitration is now under review');

      setArbitrations((prev) =>
        prev.map((a) =>
          a._id === disputeId
            ? {
                ...a,
                status: 'reviewing',
                reviewedBy: governmentAddress,
              }
            : a
        )
      );
    } catch (err) {
      console.error('❌ Failed to start review:', err);
      alert(err?.response?.data?.msg || err?.message || 'Failed to start review');
    } finally {
      setBusyId(null);
    }
  };

  const openResolveDialog = (item) => {
    setCurrentArbitration(item);
    setArbitrationResult('support_seeker');
    setArbitrationSummary('');
    setResolveDialogOpen(true);
  };

  const closeResolveDialog = () => {
    if (submittingResolve) return;
    setResolveDialogOpen(false);
    setCurrentArbitration(null);
    setArbitrationResult('support_seeker');
    setArbitrationSummary('');
  };

  const handleResolve = async () => {
    try {
      if (!currentArbitration?._id) {
        throw new Error('Missing arbitration record');
      }

      setSubmittingResolve(true);

      const disputeId = currentArbitration._id;
      const summaryText = arbitrationSummary || '';
      const message = `ResolveArbitration:${disputeId}:${arbitrationResult}:${summaryText}`;
      const sigFlat = await signMessage(message);

      const res = await axios.patch(
        `${API_BASE}/arbitration/update/${disputeId}/resolve`,
        {
          address: governmentAddress,
          signature: { flat: sigFlat },
          arbitrationResult,
          arbitrationSummary: summaryText,
        }
      );

      if (!res.data?.success) {
        throw new Error(res.data?.msg || 'Failed to resolve arbitration');
      }

      alert('✅ Arbitration resolved successfully');

      setArbitrations((prev) =>
        prev.map((a) =>
          a._id === disputeId
            ? {
                ...a,
                status: 'resolved',
                arbitrationResult,
                arbitrationSummary: summaryText,
                reviewedBy: governmentAddress,
                resolvedAt: new Date().toISOString(),
              }
            : a
        )
      );

      closeResolveDialog();
    } catch (err) {
      console.error('❌ Failed to resolve arbitration:', err);
      alert(err?.response?.data?.msg || err?.message || 'Failed to resolve arbitration');
    } finally {
      setSubmittingResolve(false);
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
          Loading Arbitrations...
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
              <ArbitrationIcon fontSize="large" />
              Manage Arbitrations
            </Typography>

            <Typography variant="body1" color="text.secondary">
              Review and resolve all interview dispute cases submitted to the government authority.
            </Typography>
          </Box>

          {arbitrations.length === 0 ? (
            <Paper
              sx={{
                p: 6,
                textAlign: 'center',
                borderRadius: 4,
                bgcolor: 'rgba(255,255,255,0.6)',
              }}
            >
              <Typography variant="h6" color="text.secondary">
                No arbitration cases found.
              </Typography>
            </Paper>
          ) : (
            <Stack spacing={3}>
              {arbitrations.map((item) => {
                const cfg = statusConfig[item.status] || statusConfig.submitted;
                const isBusy = busyId === item._id;
                const interview = item.interviewId || {};

                return (
                  <Paper
                    key={item._id}
                    elevation={6}
                    sx={{
                      p: 4,
                      borderRadius: 5,
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(10px)',
                      borderLeft: `8px solid ${cfg.borderColor}`,
                    }}
                  >
                    <Stack spacing={2.5}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            DISPUTE ID
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {item._id}
                          </Typography>
                        </Box>

                        <Chip
                          icon={cfg.icon}
                          label={cfg.label}
                          color={cfg.color}
                          variant="filled"
                        />
                      </Box>

                      <Divider />

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                        <Box flex={1}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            COMPANY ADDRESS
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, wordBreak: 'break-all' }}
                          >
                            <CompanyIcon fontSize="inherit" />
                            {item.companyAddress || 'N/A'}
                          </Typography>
                        </Box>

                        <Box flex={1}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            SEEKER ADDRESS
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, wordBreak: 'break-all' }}
                          >
                            <SeekerIcon fontSize="inherit" />
                            {item.seekerAddress || 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                        <Box flex={1}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            ORIGINAL RESULT
                          </Typography>
                          <Typography variant="body1" fontWeight={700}>
                            {resultLabelMap[item.originalResult] || item.originalResult || 'N/A'}
                          </Typography>
                        </Box>

                        <Box flex={1}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            CREATED AT
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                          >
                            <TimeIcon fontSize="inherit" />
                            {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>

                      <Box>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          DISPUTE REASON
                        </Typography>
                        <Typography variant="body1" fontWeight={600}>
                          {item.reason || 'N/A'}
                        </Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          DESCRIPTION
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.description || 'No description provided.'}
                        </Typography>
                      </Box>

                      {!!item.arbitrationResult && (
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            ARBITRATION RESULT
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                            <Chip
                              label={
                                arbitrationResultLabelMap[item.arbitrationResult] ||
                                item.arbitrationResult
                              }
                              color="success"
                              variant="outlined"
                            />
                          </Stack>
                        </Box>
                      )}

                      {!!item.arbitrationSummary && (
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            ARBITRATION SUMMARY
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.arbitrationSummary}
                          </Typography>
                        </Box>
                      )}

                      {!!interview?.interviewTime && (
                        <Box>
                          <Typography variant="caption" fontWeight={700} color="text.secondary">
                            INTERVIEW TIME
                          </Typography>
                          <Typography variant="body2">
                            {new Date(interview.interviewTime).toLocaleString()}
                          </Typography>
                        </Box>
                      )}

                      <Box sx={{ pt: 1 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="large"
                            startIcon={
                              isBusy && item.status !== 'resolved'
                                ? <CircularProgress size={18} color="inherit" />
                                : <ReviewIcon />
                            }
                            disabled={isBusy || item.status === 'resolved' || item.status === 'reviewing'}
                            onClick={() => handleStartReview(item)}
                            sx={{
                              borderRadius: 3,
                              py: 1.5,
                              fontWeight: 700,
                            }}
                          >
                            {item.status === 'reviewing'
                              ? 'Already Reviewing'
                              : item.status === 'resolved'
                              ? 'Review Completed'
                              : isBusy
                              ? 'Starting Review...'
                              : 'Start Review'}
                          </Button>

                          <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            startIcon={<ResolveIcon />}
                            disabled={isBusy || item.status === 'resolved'}
                            onClick={() => openResolveDialog(item)}
                            sx={{
                              borderRadius: 3,
                              py: 1.5,
                              fontWeight: 700,
                              boxShadow: 4,
                            }}
                          >
                            {item.status === 'resolved' ? 'Already Resolved' : 'Resolve'}
                          </Button>
                        </Stack>
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
        open={resolveDialogOpen}
        onClose={closeResolveDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          Resolve Arbitration
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                DISPUTE ID
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {currentArbitration?._id || 'N/A'}
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Box flex={1}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  ORIGINAL RESULT
                </Typography>
                <Typography variant="body2">
                  {resultLabelMap[currentArbitration?.originalResult] ||
                    currentArbitration?.originalResult ||
                    'N/A'}
                </Typography>
              </Box>

              <Box flex={1}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  REASON
                </Typography>
                <Typography variant="body2">
                  {currentArbitration?.reason || 'N/A'}
                </Typography>
              </Box>
            </Stack>

            <TextField
              select
              fullWidth
              label="Arbitration Result"
              value={arbitrationResult}
              onChange={(e) => setArbitrationResult(e.target.value)}
            >
              {arbitrationResultOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth
              multiline
              minRows={4}
              label="Arbitration Summary"
              placeholder="Please provide a summary of the final government decision."
              value={arbitrationSummary}
              onChange={(e) => setArbitrationSummary(e.target.value)}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeResolveDialog} disabled={submittingResolve}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleResolve}
            disabled={submittingResolve}
            startIcon={
              submittingResolve ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <ResultIcon />
              )
            }
          >
            {submittingResolve ? 'Submitting...' : 'Confirm Resolve'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default GovernmentManageArbitration;