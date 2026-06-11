import {
  Box, Typography, Button, Stack, Paper, Divider, Chip,
  Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, Container
} from '@mui/material';
import {
  Add as AddIcon,
  Home as HomeIcon,
  DeleteOutline as DeleteIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  WorkOutline as JobIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  Security as SecurityIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';

const API_BASE = 'http://localhost:3000';

const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

function ManageJobsPage() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, []);

  const getAddressOrThrow = () => {
    const address = sessionStorage.getItem('address');
    if (!address) throw new Error('Address not found, please login again.');
    return address;
  };

  const fetchJobs = async () => {
    try {
      const address = getAddressOrThrow();
      const res = await axios.get(`${API_BASE}/company/get-requests?address=${address}`, { withCredentials: true });
      setJobs(res.data.requests || []);
    } catch (err) {
      console.error('❌ Failed to fetch jobs:', err);
    }
  };

  const personalSign = async (address, message) => {
    if (!window.ethereum) throw new Error('MetaMask not installed');
    const sig = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    });
    return { flat: sig, message };
  };

  const signDeleteJob = async (address, jobId, ts) => {
    const message = `DeleteJob for ${address} jobId=${jobId} ts=${ts}`;
    return await personalSign(address, message);
  };

  const openDeleteDialog = (jobId) => {
    setDeleteTargetId(jobId);
    setDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDialogOpen(false);
    setDeleteTargetId(null);
  };

  const confirmDelete = async () => {
    try {
      const address = getAddressOrThrow();
      if (!deleteTargetId) throw new Error('Missing jobId');

      const ts = Date.now();
      const signature = await signDeleteJob(address, deleteTargetId, ts);

      await axios.delete(`${API_BASE}/company/delete-request`, {
        data: {
          address,
          id: deleteTargetId,
          signature,
          ts,
        },
        withCredentials: true,
      });

      setSnackbarOpen(true);
      closeDeleteDialog();
      fetchJobs();
    } catch (err) {
      console.error('❌ Delete failed:', err);
      alert(err?.message || 'Delete failed, please confirm MetaMask signature.');
    }
  };

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pt: '100px',
        pb: '60px',
        p: 2
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h3" fontWeight={900} color="primary.main" gutterBottom>
            Manage Jobs
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your on-chain job vacancies and view applicant matches.
          </Typography>
        </Box>

        <Stack spacing={3} sx={{ mb: 4 }}>
          {jobs.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.6)' }}>
              <Typography color="text.secondary">No active job vacancies found.</Typography>
            </Paper>
          ) : (
            jobs.map((job) => (
              <Paper 
                key={job._id} 
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
                <Box sx={{ textAlign: 'left', mb: 2 }}>
                  <Typography variant="h6" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <JobIcon color="primary" /> {job.position}
                  </Typography>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ ml: 4 }}>
                    {job.department}
                  </Typography>
                </Box>

                <Stack spacing={1} sx={{ mb: 2 }}>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocationIcon fontSize="small" color="action" /> <strong>Location:</strong> {job.location}
                  </Typography>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SalaryIcon fontSize="small" color="success" /> 
                    <strong>Salary:</strong> ${job.salaryRange?.min.toLocaleString()} - ${job.salaryRange?.max.toLocaleString()}
                  </Typography>
                </Stack>

                <Box sx={{ textAlign: 'left', mb: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    REQUIREMENTS:
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 0.5 }}>
                    {(job.requirements || []).map((req, idx) => (
                      <Chip key={idx} label={req} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                    ))}
                  </Stack>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Stack direction="row" spacing={1.5}>
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<ViewIcon />}
                    onClick={() => navigate(`/company/job-apply/${job._id}`)}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                  >
                    Applicants
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => navigate(`/company/edit-job/${job._id}`)}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                  >
                    Edit
                  </Button>

                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => openDeleteDialog(job._id)}
                    sx={{ borderRadius: 2, minWidth: 'fit-content' }}
                  >
                    <DeleteIcon />
                  </Button>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>

        <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
          <Button 
            fullWidth 
            variant="contained" 
            size="large"
            startIcon={<AddIcon />}
            onClick={() => navigate('/company/post-job')}
            sx={{ borderRadius: 3, py: 1.5, fontWeight: 700, textTransform: 'none', boxShadow: 4 }}
          >
            Post New Job
          </Button>
          <Button 
            fullWidth 
            variant="outlined" 
            size="large"
            startIcon={<HomeIcon />}
            onClick={() => navigate('/company/home')}
            sx={{ borderRadius: 3, py: 1.5, fontWeight: 700, textTransform: 'none', bgcolor: 'white' }}
          >
            Back Home
          </Button>
        </Stack>
      </Container>

      {/* Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%', borderRadius: 2 }}>
          Operation Successful!
        </Alert>
      </Snackbar>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={closeDeleteDialog}
        PaperProps={{ sx: { borderRadius: 4, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon color="error" /> Confirm Deletion
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mt: 1 }}>
            This action requires a <strong>MetaMask signature</strong> to verify your ownership of this company profile on-chain.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDeleteDialog} color="inherit" sx={{ fontWeight: 600 }}>Cancel</Button>
          <Button onClick={confirmDelete} variant="contained" color="error" sx={{ borderRadius: 2, fontWeight: 700 }}>
            Sign & Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ManageJobsPage;