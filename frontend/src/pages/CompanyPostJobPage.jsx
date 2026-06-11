import {
  Box, Typography, TextField, Button, Stack, Paper, Snackbar, Alert,
  Chip, IconButton, Container, Divider, InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Work as WorkIcon,
  Business as DeptIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  Psychology as SkillIcon,
  NoteAlt as NoteIcon,
  Send as SendIcon
} from '@mui/icons-material';
import { useState } from 'react';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { keccak256, toUtf8Bytes } from "ethers";

// --- Helpers (Logic Unchanged) ---
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

async function personalSign(message, address) {
  if (!window.ethereum) throw new Error("MetaMask not installed");
  const flat = await window.ethereum.request({
    method: "personal_sign",
    params: [message, address],
  });
  return flat;
}

function CompanyPostJobPage() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();

  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [requirements, setRequirements] = useState([]);
  const [newRequirement, setNewRequirement] = useState('');
  const [notes, setNotes] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleAddRequirement = () => {
    const req = newRequirement.trim();
    if (req && !requirements.includes(req)) {
      setRequirements([...requirements, req]);
      setNewRequirement('');
    }
  };

  const handleDeleteRequirement = (reqToDelete) => {
    setRequirements(requirements.filter((req) => req !== reqToDelete));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const addressRaw = sessionStorage.getItem('address');
      const userId = sessionStorage.getItem('userId');
      if (!addressRaw) throw new Error("No address found, please login again.");
      const address = addressRaw.toLowerCase();
      const ts = Date.now();

      const reqForHash = {
        _id: null,
        address,
        companyId: userId ?? '',
        position: position ?? '',
        department: department ?? '',
        salaryRange: { min: Number(salaryMin), max: Number(salaryMax) },
        requirements: Array.isArray(requirements) ? [...requirements].sort() : [],
        location: location ?? '',
        notes: notes ?? '',
      };

      const canonical = stableStringify(reqForHash);
      const jobHash = keccak256(toUtf8Bytes(canonical));

      const message = `UpsertJob for ${address} jobHash=${jobHash} ts=${ts}`;
      const flat = await personalSign(message, address);

      const payload = {
        request: {
          address,
          companyId: userId,
          position,
          department,
          salaryRange: { min: Number(salaryMin), max: Number(salaryMax) },
          requirements,
          location,
          notes,
        },
        signature: { flat, message },
        ts,
      };

      await axios.post('http://localhost:3000/company/upsert-request', payload, { withCredentials: true });

      // ✅ Show success snackbar
      setSnackbarOpen(true);

      // ✅ Pause for 1.5 seconds before navigating
      setTimeout(() => {
        navigate('/company/manage-jobs');
      }, 1500);

    } catch (err) {
      console.error('❌ Failed to post job:', err);
      alert(err?.message || 'Post failed, please check MetaMask connection');
    }
  };

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        pt: '100px',
        pb: '80px',
        p: 2
      }}
    >
      <Container maxWidth="sm">
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
              Post New Vacancy
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Fill in the job details. You will need to sign this transaction with your wallet.
            </Typography>
          </Box>

          <Stack spacing={3} component="form" onSubmit={handleSubmit}>
            <TextField
              label="Job Position"
              placeholder="e.g. Full Stack Developer"
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
              placeholder="e.g. IT Department"
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
              placeholder="e.g. New York (Remote)"
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
                <SkillIcon fontSize="small" /> Required Skills & Experience
              </Typography>
              
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1, mb: 2 }}>
                {requirements.map((req, idx) => (
                  <Chip
                    key={idx}
                    label={req}
                    onDelete={() => handleDeleteRequirement(req)}
                    color="primary"
                    sx={{ fontWeight: 600, borderRadius: 1.5 }}
                  />
                ))}
              </Stack>

              <Stack direction="row" spacing={1}>
                <TextField
                  label="Add Skill/Requirement"
                  size="small"
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                  fullWidth
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRequirement(); } }}
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
              placeholder="Tell applicants more about this role..."
              InputProps={{
                startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}><NoteIcon color="primary" /></InputAdornment>,
              }}
            />

            <Button
              variant="contained"
              type="submit"
              size="large"
              startIcon={<SendIcon />}
              sx={{
                py: 1.5,
                borderRadius: 3,
                fontWeight: 700,
                fontSize: '1.1rem',
                textTransform: 'none',
                boxShadow: '0 4px 14px rgba(25, 118, 210, 0.3)'
              }}
            >
              Post Vacancy & Sign
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
          Job Vacancy Posted Successfully!
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default CompanyPostJobPage;