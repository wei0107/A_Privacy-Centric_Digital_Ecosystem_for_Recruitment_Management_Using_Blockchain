import {
  Box, Typography, Stack, Paper, Button,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, CircularProgress, Container, 
  Divider, Chip, Avatar
} from '@mui/material';
import { 
  AutoAwesome as MatchIcon,
  Business as CompanyIcon,
  WorkOutline as PositionIcon,
  Star as ScoreIcon,
  Description as NoteIcon,
  CheckCircleOutline as ApplyIcon
} from '@mui/icons-material';
import { useEffect, useState } from 'react';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';

function SeekerMatchResultPage() {
  useAuthGuard('jobseeker');

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const seekerId = sessionStorage.getItem('address');
        if (!seekerId) throw new Error('❌ Wallet address not found');

        const res = await axios.get('http://localhost:3000/match/seeker', { params: { seekerId }});
        const matchList = res.data.matches ?? [];
        setMatches(matchList);
      } catch (err) {
        console.error('❌ Failed to fetch matches:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, []);

  const stableStringify = (obj) => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  };

  const handleApplyClick = (match) => {
    setSelectedMatch(match);
    setOpenDialog(true);
  };

  const handleConfirmApply = async () => {
    try {
      const address = sessionStorage.getItem('address');
      if (!address || !selectedMatch) {
        alert('Please login or select a job first.');
        return;
      }
      if (!window.ethereum) throw new Error('MetaMask not installed');

      const res = await axios.get(`http://localhost:3000/seeker/getRequest?address=${address}`);
      const seekerRequest = res.data?.request;
      if (!seekerRequest) {
        alert('Please complete and upload your seeker profile first.');
        return;
      }

      const applyData = {
        address: address.toLowerCase(),
        expectedSalary: seekerRequest.expectedSalary,
        skills: seekerRequest.skills,
        availableFrom: seekerRequest.availableFrom,
        location: seekerRequest.location,
        notes: seekerRequest.notes || '',
        position: seekerRequest.position,
      };

      // ✅ 1) canonicalize + hash（要和後端一致）
      const applyForHash = {
        address: String(applyData.address).toLowerCase(),
        expectedSalary: Number(applyData.expectedSalary),
        skills: Array.isArray(applyData.skills) ? [...applyData.skills].sort() : [],
        availableFrom: applyData.availableFrom ? new Date(applyData.availableFrom).toISOString() : null,
        location: applyData.location ?? '',
        notes: applyData.notes ?? '',
        position: applyData.position ?? '',
      };

      const applyCanonical = stableStringify(applyForHash);

      // 用 ethers 算 keccak256（你專案已經有 ethers）
      const { keccak256, toUtf8Bytes } = await import('ethers');
      const applyHash = keccak256(toUtf8Bytes(applyCanonical));

      const ts = Date.now();
      const message = `ApplyJob for ${address.toLowerCase()} jobId=${selectedMatch.jobId} applyHash=${applyHash} ts=${ts}`;

      // ✅ 2) MetaMask personal_sign
      const sig = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      // ✅ 3) 打後端
      await axios.post('http://localhost:3000/seeker/applyJob', {
        address: address.toLowerCase(),
        jobId: selectedMatch.jobId,
        applyData,
        ts,
        signature: { flat: sig, message },
      });

      setOpenDialog(false);
      setSelectedMatch(null);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('❌ Application failed:', err);
      alert(err?.response?.data?.msg || err?.message || 'Application failed, please try again later.');
    }
  };

  const handleCancel = () => {
    setOpenDialog(false);
    setSelectedMatch(null);
  };

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pt: '100px',
        pb: '60px',
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Avatar sx={{ bgcolor: 'primary.main', mx: 'auto', mb: 2, width: 56, height: 56 }}>
            <MatchIcon fontSize="large" />
          </Avatar>
          <Typography variant="h4" fontWeight={900} gutterBottom color="black">
            Match Results
          </Typography>
          <Typography variant="body1" color="text.secondary">
            AI-driven job matching based on your blockchain profile.
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress />
          </Box>
        ) : matches.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.6)' }}>
            <Typography color="text.secondary">No match results found at the moment.</Typography>
          </Paper>
        ) : (
          <Stack spacing={3}>
            {matches.map((match, idx) => (
              <Paper 
                key={idx} 
                elevation={6} 
                sx={{ 
                  p: 3, 
                  borderRadius: 4, 
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(10px)',
                  transition: '0.3s',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 8 }
                }} 
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="h6" fontWeight={800} color="primary.main" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PositionIcon fontSize="small" /> {match.position}
                    </Typography>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <CompanyIcon fontSize="small" /> {match.companyId}
                    </Typography>
                  </Box>
                  <Chip 
                    icon={<ScoreIcon sx={{ fontSize: '1rem !important' }} />}
                    label={`Score: ${match.score}`} 
                    color="secondary" 
                    variant="contained" 
                    sx={{ fontWeight: 800, borderRadius: 2 }}
                  />
                </Box>

                <Divider sx={{ my: 2 }} />

                <Stack spacing={1}>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <strong>Department:</strong> {match.department || 'N/A'}
                  </Typography>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <NoteIcon fontSize="inherit" sx={{ mt: 0.5 }} />
                    <strong>Note:</strong> {match.notes || 'No extra notes provided.'}
                  </Typography>
                </Stack>

                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<ApplyIcon />}
                  sx={{ 
                    mt: 3, 
                    borderRadius: 2, 
                    fontWeight: 700,
                    textTransform: 'none',
                    py: 1
                  }}
                  onClick={() => handleApplyClick(match)}
                >
                  Apply Now
                </Button>
              </Paper>
            ))}
          </Stack>
        )}
      </Container>

      {/* Confirmation Dialog */}
      <Dialog 
        open={openDialog} 
        onClose={handleCancel}
        PaperProps={{ sx: { borderRadius: 4, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Confirm Application</DialogTitle>
        <DialogContent>
          {selectedMatch && (
            <Typography>
              Are you sure you want to apply for <strong>{selectedMatch.position}</strong>?
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCancel} color="inherit">Cancel</Button>
          <Button onClick={handleConfirmApply} variant="contained" sx={{ borderRadius: 2 }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%', borderRadius: 2 }}>
          Application submitted successfully!
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SeekerMatchResultPage;