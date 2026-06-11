import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Paper,
  Snackbar,
  Alert,
  Chip,
  IconButton,
  Container,
  Divider,
  InputAdornment
} from '@mui/material';
import { 
  Add as AddIcon, 
  Work as PositionIcon,
  AttachMoney as SalaryIcon,
  EventAvailable as DateIcon,
  LocationOn as LocationIcon,
  NoteAlt as NoteIcon,
  Psychology as SkillIcon,
  DeleteOutline as DeleteIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function SeekerEditRequestPage() {
  useAuthGuard('jobseeker');
  const navigate = useNavigate();

  const [position, setPosition] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const address = sessionStorage.getItem('address');

  useEffect(() => {
    if (address) {
      axios
        .get(`http://localhost:3000/seeker/getRequest?address=${address}`)
        .then((res) => {
          const data = res.data.request || {};
          setPosition(data.position || '');
          setExpectedSalary(
            data.expectedSalary !== undefined && data.expectedSalary !== null
              ? String(data.expectedSalary)
              : ''
          );
          setSkills(Array.isArray(data.skills) ? data.skills : []);
          setAvailableFrom(data.availableFrom ? String(data.availableFrom).split('T')[0] : '');
          setLocation(data.location || '');
          setNotes(data.notes || '');
        })
        .catch(() => {});
    }
  }, [address]);

  const handleAddSkill = () => {
    const newSkill = skillInput.trim();
    if (newSkill && !skills.includes(newSkill)) {
      setSkills([...skills, newSkill]);
    }
    setSkillInput('');
  };

  const handleDeleteSkill = (skillToDelete) => {
    setSkills(skills.filter((skill) => skill !== skillToDelete));
  };

  const stableStringify = (obj) => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(',')}}`;
  };

  const keccak256Hex = async (str) => {
    const { ethers } = await import('ethers');
    return ethers.keccak256(ethers.toUtf8Bytes(str));
  };

  const signWithMetaMask = async (message) => {
    const { ethers } = await import('ethers');
    if (!window.ethereum) throw new Error('MetaMask not found (window.ethereum)');
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const flat = await signer.signMessage(message);
    return { flat, message };
  };

  const buildUpsertPayload = async () => {
    if (!address) throw new Error('Address not found, please login again');
    const ts = Date.now();
    const skillsSorted = [...skills].sort((a, b) => a.localeCompare(b));
    const request = {
      address,
      position,
      expectedSalary: Number(expectedSalary),
      skills: skillsSorted,
      availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
      location,
      notes
    };
    const requestCanonical = stableStringify(request);
    const requestHash = await keccak256Hex(requestCanonical);
    const message = `UpsertRequest for ${address} requestHash=${requestHash} ts=${ts}`;
    const signature = await signWithMetaMask(message);
    return { request, signature, ts };
  };

  const buildDeletePayload = async () => {
    if (!address) throw new Error('Address not found, please login again');
    const ts = Date.now();
    const message = `DeleteRequest for ${address} ts=${ts}`;
    const signature = await signWithMetaMask(message);
    return { address, signature, ts };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!address) return;
    try {
      const payload = await buildUpsertPayload();
      await axios.post('http://localhost:3000/seeker/upsertRequest', payload);
      setSnackbarOpen(true);
      setTimeout(() => navigate('/seeker/home'), 1500);
    } catch (err) {
      alert(err?.message || 'Save failed');
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!address) return;
    if (!window.confirm('Are you sure you want to delete this job preference?')) return;
    try {
      const payload = await buildDeletePayload();
      await axios.delete('http://localhost:3000/seeker/deleteRequest', { data: payload });
      setPosition('');
      setExpectedSalary('');
      setSkills([]);
      setAvailableFrom('');
      setLocation('');
      setNotes('');
      setSnackbarOpen(true);
      setTimeout(() => navigate('/seeker/home'), 1500);
    } catch (err) {
      alert(err?.message || 'Delete failed');
      console.error(err);
    }
  };

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pt: '100px',
        pb: '60px',
        p: 2
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={10}
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 5,
            textAlign: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Typography variant="h4" fontWeight={900} color="text.primary" gutterBottom>
            Job Preferences
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Update your career expectations.
          </Typography>

          <Divider sx={{ mb: 4 }} />

          <Stack spacing={3} component="form" onSubmit={handleSubmit}>
            <TextField
              label="Desired Position"
              placeholder="e.g. Senior Software Engineer"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              fullWidth
              required
              InputProps={{
                startAdornment: <InputAdornment position="start"><PositionIcon color="primary" /></InputAdornment>,
              }}
            />

            <TextField
              label="Expected Salary (USD / Annual)"
              type="number"
              value={expectedSalary}
              onChange={(e) => setExpectedSalary(e.target.value)}
              fullWidth
              required
              InputProps={{
                startAdornment: <InputAdornment position="start"><SalaryIcon color="primary" /></InputAdornment>,
              }}
            />

            <Box sx={{ textAlign: 'left', p: 2, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SkillIcon fontSize="small" /> Skill Tags
              </Typography>

              <Stack direction="row" spacing={1} marginBottom={2} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
                {skills.map((skill, index) => (
                  <Chip
                    key={index}
                    label={skill}
                    onDelete={() => handleDeleteSkill(skill)}
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
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                />
                <IconButton onClick={handleAddSkill} color="primary" sx={{ bgcolor: 'rgba(25, 118, 210, 0.1)' }}>
                  <AddIcon />
                </IconButton>
              </Stack>
            </Box>

            <TextField
              label="Available From"
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><DateIcon color="primary" /></InputAdornment>,
              }}
            />

            <TextField
              label="Desired Location"
              placeholder="e.g. Remote / Taipei, Taiwan"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><LocationIcon color="primary" /></InputAdornment>,
              }}
            />

            <TextField
              label="Additional Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Share more details about your work style..."
              InputProps={{
                startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}><NoteIcon color="primary" /></InputAdornment>,
              }}
            />

            <Stack spacing={2} sx={{ mt: 2 }}>
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
                Save Preferences
              </Button>

              <Button 
                variant="text" 
                color="error" 
                onClick={handleDelete}
                startIcon={<DeleteIcon />}
                sx={{ fontWeight: 600, textTransform: 'none' }}
              >
                Delete Job Preference
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Container>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%', borderRadius: 3 }}>
          Preferences updated successfully!
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SeekerEditRequestPage;