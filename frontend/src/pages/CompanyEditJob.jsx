import {
  Box, Typography, TextField, Button, Stack, Paper, Chip, Snackbar, Alert,
  IconButton, Container, Divider, InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Work as WorkIcon,
  Business as DeptIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  Psychology as SkillIcon,
  NoteAlt as NoteIcon,
  Save as SaveIcon,
  ArrowBack as BackIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';
import { keccak256, toUtf8Bytes } from "ethers";

const API_BASE = 'http://localhost:3000';

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function EditJobPage() {
  useAuthGuard('enterprise');
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [position, setPosition] = useState('');
  const [location, setLocation] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [department, setDepartment] = useState('');
  const [requirements, setRequirements] = useState([]);
  const [notes, setNotes] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  useEffect(() => {
    if (jobId) fetchJob();
  }, [jobId]);

  const fetchJob = async () => {
    try {
      const res = await axios.get(`${API_BASE}/company/get-request`, { params: { id: jobId } });
      const data = res.data.request;
      setPosition(data.position || '');
      setDepartment(data.department || '');
      setLocation(data.location || '');
      setSalaryMin(data.salaryRange?.min ?? '');
      setSalaryMax(data.salaryRange?.max ?? '');
      setRequirements(data.requirements || []);
      setNotes(data.notes || '');
    } catch (err) {
      console.error('❌ Failed to load job:', err);
      alert('Unable to retrieve job data. Returning to management page.');
      navigate('/company/manage-jobs');
    }
  };

  const signUpsertJobWithMetaMask = async (address, jobForHash) => {
    if (!window.ethereum) throw new Error('MetaMask not installed');
    const ts = Date.now();
    const jobHash = keccak256(toUtf8Bytes(stableStringify(jobForHash)));
    const message = `UpsertJob for ${address} jobHash=${jobHash} ts=${ts}`;
    const sig = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    });
    return { signature: { flat: sig, message }, ts };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const address = sessionStorage.getItem('address');
      const companyId = sessionStorage.getItem('userId');
      if (!address) throw new Error('Wallet address not found');

      const jobForHash = {
        _id: jobId,
        address: address.toLowerCase(),
        companyId: companyId ?? '',
        position: position ?? '',
        department: department ?? '',
        salaryRange: { min: Number(salaryMin), max: Number(salaryMax) },
        requirements: Array.isArray(requirements) ? [...requirements].sort() : [],
        location: location ?? '',
        notes: notes ?? '',
      };

      const { signature, ts } = await signUpsertJobWithMetaMask(address, jobForHash);
      const payload = { request: jobForHash, signature, ts };

      await axios.post(`${API_BASE}/company/upsert-request`, payload);

      // ✅ 顯示成功提示
      setSnackbarOpen(true);

      // ✅ 停頓 1.5 秒後跳轉
      setTimeout(() => {
        navigate('/company/manage-jobs');
      }, 1500);

    } catch (err) {
      console.error('❌ Update failed:', err);
      alert(err?.message || 'Update failed, please check MetaMask connection');
    }
  };

  const handleAddRequirement = () => {
    const skill = skillInput.trim();
    if (skill && !requirements.includes(skill)) setRequirements([...requirements, skill]);
    setSkillInput('');
  };

  const handleDeleteRequirement = (target) => {
    setRequirements(requirements.filter((s) => s !== target));
  };

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)', // 企業端稍微偏藍的專業漸層
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        pt: '100px',
        pb: '80px',
        p: 2
      }}
    >
      <Container maxWidth="sm">
        <Button 
          startIcon={<BackIcon />} 
          onClick={() => navigate('/company/manage-jobs')}
          sx={{ mb: 2, color: 'text.secondary', fontWeight: 600, textTransform: 'none' }}
        >
          Back to Dashboard
        </Button>

        <Paper
          elevation={10}
          sx={{
            p: { xs: 3, md: 5 },
            borderRadius: 5,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" fontWeight={900} color="primary.main">
              Edit Job Vacancy
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Update the job details and sign with your wallet to secure changes.
            </Typography>
          </Box>

          <Stack spacing={3} component="form" onSubmit={handleSubmit}>
            <TextField
              label="Job Position"
              placeholder="e.g. Senior Frontend Developer"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              required
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><WorkIcon color="primary" /></InputAdornment>,
              }}
            />

            <TextField
              label="Department"
              placeholder="e.g. Engineering Team"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><DeptIcon color="primary" /></InputAdornment>,
              }}
            />

            <TextField
              label="Location"
              placeholder="e.g. Taipei (Hybrid)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><LocationIcon color="primary" /></InputAdornment>,
              }}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Min Salary"
                type="number"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                required
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SalaryIcon color="success" /></InputAdornment>,
                }}
              />
              <TextField
                label="Max Salary"
                type="number"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                required
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SalaryIcon color="success" /></InputAdornment>,
                }}
              />
            </Stack>

            <Divider />

            <Box sx={{ bgcolor: 'rgba(0,0,0,0.02)', p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SkillIcon fontSize="small" /> Required Skills & Requirements
              </Typography>
              
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1, mb: 2 }}>
                {requirements.map((s, i) => (
                  <Chip 
                    key={i} 
                    label={s} 
                    onDelete={() => handleDeleteRequirement(s)} 
                    color="primary" 
                    sx={{ fontWeight: 600, borderRadius: 1.5 }}
                  />
                ))}
              </Stack>

              <Stack direction="row" spacing={1}>
                <TextField
                  label="Add Skill"
                  size="small"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  fullWidth
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddRequirement(); }
                  }}
                />
                <IconButton onClick={handleAddRequirement} color="primary" sx={{ bgcolor: 'rgba(25, 118, 210, 0.1)' }}>
                  <AddIcon />
                </IconButton>
              </Stack>
            </Box>

            <TextField
              label="Additional Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Detailed job description or benefits..."
              InputProps={{
                startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}><NoteIcon color="primary" /></InputAdornment>,
              }}
            />

            <Button
              variant="contained"
              type="submit"
              size="large"
              startIcon={<SaveIcon />}
              sx={{
                py: 1.5,
                borderRadius: 3,
                fontWeight: 700,
                fontSize: '1.1rem',
                textTransform: 'none',
                boxShadow: '0 4px 14px rgba(25, 118, 210, 0.3)'
              }}
            >
              Sign & Update Vacancy
            </Button>
          </Stack>
        </Paper>
      </Container>

      <Snackbar 
        open={snackbarOpen} 
        autoHideDuration={3000} 
        onClose={() => setSnackbarOpen(false)} 
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%', borderRadius: 2 }}>
          Job Updated Successfully!
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default EditJobPage;