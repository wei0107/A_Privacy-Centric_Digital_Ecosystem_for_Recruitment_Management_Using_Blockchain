import {
  Box,
  Typography,
  TextField,
  Stack,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Divider,
  Container,
  InputAdornment,
  IconButton,
  Chip
} from '@mui/material';
import { 
  Search as SearchIcon, 
  LocationOn as LocationIcon, 
  Business as BusinessIcon, 
  Payments as SalaryIcon,
  Assignment as JobIcon,
  Description as NotesIcon,
  TaskAlt as RequirementIcon
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';
import { keccak256, toUtf8Bytes } from 'ethers';

function SeekerJobListPage() {
  useAuthGuard('jobseeker');

  const [searchTerm, setSearchTerm] = useState('');
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [open, setOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await axios.get('http://localhost:3000/seeker/getJobs');
        setJobs(res.data.jobs);
      } catch (err) {
        console.error('❌ 無法取得職缺資料', err);
      }
    };
    fetchJobs();
  }, []);

  const stableStringify = (obj) => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  };

  const handleApplyClick = (job) => {
    setSelectedJob(job);
    setOpen(true);
  };

  const handleConfirmApply = async () => {
    try {
      const address = sessionStorage.getItem('address');
      if (!address || !selectedJob) {
        alert('請先登入或選擇職缺');
        return;
      }
      if (!window.ethereum) throw new Error('MetaMask not installed');

      // 1) 拉 seeker request
      const res = await axios.get(`http://localhost:3000/seeker/getRequest?address=${address}`);
      const seekerRequest = res.data?.request;
      if (!seekerRequest) {
        alert('請先填寫並上傳求職資料');
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

      // 2) canonicalize + hash（要和後端一致）
      const applyForHash = {
        address: String(applyData.address || '').toLowerCase(),
        expectedSalary: Number(applyData.expectedSalary),
        skills: Array.isArray(applyData.skills) ? [...applyData.skills].sort() : [],
        availableFrom: applyData.availableFrom ? new Date(applyData.availableFrom).toISOString() : null,
        location: applyData.location ?? '',
        notes: applyData.notes ?? '',
        position: applyData.position ?? '',
      };

      const canonical = stableStringify(applyForHash);
      const applyHash = keccak256(toUtf8Bytes(canonical));

      // 3) anti-replay ts
      const ts = Date.now();

      // 4) message format 要和後端 expectedMessage 一樣
      const message = `ApplyJob for ${address.toLowerCase()} jobId=${selectedJob._id} applyHash=${applyHash} ts=${ts}`;

      // 5) MetaMask personal_sign
      const sig = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
      });

      // 6) 打後端（不送 CSR）
      await axios.post('http://localhost:3000/seeker/applyJob', {
        address: address.toLowerCase(),
        jobId: selectedJob._id,
        applyData,
        ts,
        signature: { flat: sig, message },
      });

      setOpen(false);
      setSelectedJob(null);
      setSnackbarOpen(true);
    } catch (err) {
      console.error('❌ 申請送出失敗：', err);
      alert(err?.response?.data?.msg || err?.message || '申請失敗，請稍後再試');
    }
  };

  const handleCancel = () => {
    setOpen(false);
    setSelectedJob(null);
  };

  const filteredJobs = jobs.filter((job) => {
    const term = searchTerm.toLowerCase();
    return (
      job.position.toLowerCase().includes(term) ||
      job.department.toLowerCase().includes(term) ||
      job.location.toLowerCase().includes(term) ||
      job.companyId.toLowerCase().includes(term)
    );
  });

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)', // ✅ 統一漸層背景
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pt: '100px',
        pb: '60px',
      }}
    >
      <Container maxWidth="md">
        {/* Header Section */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h3" fontWeight={900} color="text.primary" gutterBottom>
            Job Board
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Find your next opportunity secured by Blockchain.
          </Typography>
        </Box>

        {/* Search Bar */}
        <Paper
          elevation={4}
          sx={{
            p: 1,
            mb: 5,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <TextField
            fullWidth
            placeholder="Search by Position, Department or Location..."
            variant="standard"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              disableUnderline: true,
              startAdornment: (
                <InputAdornment position="start" sx={{ pl: 2 }}>
                  <SearchIcon color="primary" />
                </InputAdornment>
              ),
            }}
            sx={{ px: 2, py: 1 }}
          />
        </Paper>

        {/* Job List */}
        <Stack spacing={4}>
          {filteredJobs.length > 0 ? (
            filteredJobs.map((job) => (
              <Paper
                key={job._id}
                elevation={6}
                sx={{
                  padding: '30px',
                  borderRadius: 4,
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  transition: '0.3s',
                  '&:hover': {
                    transform: 'translateY(-5px)',
                    boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="h5" fontWeight={800} color="primary.main">
                      {job.position}
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={600} color="text.secondary">
                      {job.companyId}
                    </Typography>
                  </Box>
                  <Chip 
                    label={job.location} 
                    icon={<LocationIcon />} 
                    color="primary" 
                    variant="outlined" 
                    sx={{ fontWeight: 600 }}
                  />
                </Box>

                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Stack spacing={2}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <BusinessIcon color="action" />
                        <Typography variant="body1"><strong>Dept:</strong> {job.department}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <SalaryIcon color="action" />
                        <Typography variant="body1" fontWeight={700} color="success.main">
                          ${job.salaryRange.min.toLocaleString()} - ${job.salaryRange.max.toLocaleString()}
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <RequirementIcon fontSize="small" /> Requirements
                    </Typography>
                    <Box sx={{ pl: 1 }}>
                      {job.requirements.map((req, index) => (
                        <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>• {req}</Typography>
                      ))}
                    </Box>
                  </Grid>
                </Grid>

                {job.notes && (
                  <Box sx={{ mt: 3, p: 2, bgcolor: '#f8f9fa', borderRadius: 2, display: 'flex', gap: 1.5 }}>
                    <NotesIcon fontSize="small" color="disabled" />
                    <Typography variant="body2" color="text.secondary italic">
                      {job.notes}
                    </Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
                  <Button 
                    variant="contained" 
                    size="large"
                    onClick={() => handleApplyClick(job)}
                    sx={{ 
                      borderRadius: 3, 
                      px: 4, 
                      fontWeight: 700,
                      textTransform: 'none',
                      boxShadow: '0 4px 14px rgba(25, 118, 210, 0.3)'
                    }}
                  >
                    Apply Now
                  </Button>
                </Box>
              </Paper>
            ))
          ) : (
            <Typography variant="h6" textAlign="center" color="text.disabled" sx={{ mt: 5 }}>
              No matching jobs found.
            </Typography>
          )}
        </Stack>
      </Container>

      {/* Confirmation Dialog */}
      <Dialog 
        open={open} 
        onClose={handleCancel}
        PaperProps={{ sx: { borderRadius: 4, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Confirm Application</DialogTitle>
        <DialogContent>
          {selectedJob && (
            <Typography variant="body1">
              Are you sure you want to apply for the position of <strong>{selectedJob.position}</strong> at <strong>{selectedJob.companyId}</strong>?
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCancel} color="inherit" sx={{ fontWeight: 600 }}>Cancel</Button>
          <Button onClick={handleConfirmApply} variant="contained" color="primary" sx={{ borderRadius: 2, fontWeight: 700 }}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%', borderRadius: 3 }}>
          Application Submitted Successfully!
        </Alert>
      </Snackbar>
    </Box>
  );
}

// 需要引入 Grid 元件
import { Grid } from '@mui/material';

export default SeekerJobListPage;