import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Stack,
  CircularProgress,
  Divider,
  Chip,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  TextField,
  Container,
  Avatar
} from '@mui/material';
import {
  ErrorOutline as ErrorIcon,
  AccountCircle as UserIcon,
  WorkOutline as ExperienceIcon,
  SchoolOutlined as EducationIcon,
  Code as ProjectIcon,
  Send as SendIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  Psychology as SkillIcon,
  NavigateBefore as BackIcon
} from '@mui/icons-material';
import axios from 'axios';
import { keccak256, toUtf8Bytes } from 'ethers';

// --- Helpers (Logic Unchanged) ---
const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

const SectionTitle = ({ icon: Icon, children }) => (
  <Typography variant="h6" fontWeight={800} color="primary.main" sx={{ mt: 4, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
    <Icon fontSize="small" /> {children}
  </Typography>
);

const getMetaMaskEncryptionPubKey = async (address) => {
  if (!window.ethereum) throw new Error('MetaMask not installed');
  return await window.ethereum.request({
    method: 'eth_getEncryptionPublicKey',
    params: [address],
  });
};

function ResumeDetailPage() {
  const { address } = useParams();
  const navigate = useNavigate();

  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [companyRequests, setCompanyRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [customMessage, setCustomMessage] = useState('We are impressed by your profile and would love to schedule an interview!');

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`http://localhost:3000/company/get-resume?address=${address}`);
        setResume(res.data.resume);
      } catch (err) {
        console.error('❌ Failed to fetch resume:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [address]);

  useEffect(() => {
    if (!loading && resume === null) {
      const timer = setTimeout(() => navigate(-1), 3000);
      return () => clearTimeout(timer);
    }
  }, [loading, resume, navigate]);

  const handleOpenDialog = async () => {
    try {
      setLoadingRequests(true);
      const companyAddress = sessionStorage.getItem('address');
      if (!companyAddress) {
        alert('Please login with your company wallet first.');
        return;
      }
      const res = await axios.get(`http://localhost:3000/company/get-requests?address=${companyAddress}`);
      setCompanyRequests(res.data.requests || []);
      setOpenDialog(true);
    } catch (err) {
      console.error('❌ Failed to fetch requests:', err);
      alert('Unable to load job vacancies.');
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!selectedRequest) return;
    const companyAddress = sessionStorage.getItem('address');
    if (!companyAddress || !window.ethereum) return;

    try {
      const companyEncPubKey = await getMetaMaskEncryptionPubKey(companyAddress);
      const invitation = {
        seekerId: address,
        jobId: selectedRequest._id,
        companyId: selectedRequest.companyId,
        position: selectedRequest.position,
        department: selectedRequest.department,
        salaryRange: { min: Number(selectedRequest.salaryRange?.min), max: Number(selectedRequest.salaryRange?.max) },
        requirements: Array.isArray(selectedRequest.requirements) ? [...selectedRequest.requirements] : [],
        location: selectedRequest.location ?? '',
        notes: selectedRequest.notes ?? '',
        message: customMessage,
        companyEncPubKey,
      };

      const ts = Date.now();
      const invitationForHash = {
        seekerId: String(invitation.seekerId || '').toLowerCase(),
        jobId: String(invitation.jobId || ''),
        companyId: invitation.companyId ?? '',
        position: invitation.position ?? '',
        department: invitation.department ?? '',
        salaryRange: invitation.salaryRange,
        requirements: Array.isArray(invitation.requirements) ? [...invitation.requirements].sort() : [],
        location: invitation.location,
        notes: invitation.notes,
        message: invitation.message,
        companyEncPubKey: invitation.companyEncPubKey,
      };

      const invitationHash = keccak256(toUtf8Bytes(stableStringify(invitationForHash)));
      const message = `SendInvite company=${companyAddress} seeker=${address} invitationHash=${invitationHash} ts=${ts}`;

      const signatureFlat = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, companyAddress],
      });

      await axios.post('http://localhost:3000/company/send-invite', {
        address: companyAddress, ts, message, signatureFlat, invitation,
      });

      setOpenDialog(false);
      navigate(-1);
    } catch (err) {
      console.error('❌ Failed to send invite:', err);
      alert(err?.message || 'Failed to send invitation.');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>Retrieving On-chain Resume...</Typography>
      </Box>
    );
  }

  if (resume === null) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Paper elevation={10} sx={{ p: 5, borderRadius: 5, textAlign: 'center' }}>
          <ErrorIcon color="error" sx={{ fontSize: 60, mb: 2 }} />
          <Typography variant="h5" fontWeight={800}>Resume Not Found</Typography>
          <Typography color="text.secondary">This professional hasn't published a resume yet. Redirecting...</Typography>
        </Paper>
      </Box>
    );
  }

  const { summary, skills, experience, education, projects } = resume;

  return (
    <Box sx={{ width: '100vw', minHeight: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)', pt: 10, pb: 8, p: 2 }}>
      <Container maxWidth="md">
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2, fontWeight: 700, color: 'text.secondary' }}>Back</Button>
        
        <Paper elevation={10} sx={{ p: { xs: 3, md: 6 }, borderRadius: 5, backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)' }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2, bgcolor: 'primary.main' }}><UserIcon sx={{ fontSize: 50 }} /></Avatar>
            <Typography variant="h4" fontWeight={900} color="primary.main">Professional Profile</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>{address}</Typography>
          </Box>

          <Divider />

          {/* About */}
          <SectionTitle icon={UserIcon}>About Me</SectionTitle>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-line', bgcolor: 'rgba(0,0,0,0.02)', p: 2, borderRadius: 3 }}>
            {summary || 'No summary provided.'}
          </Typography>

          {/* Skills */}
          <SectionTitle icon={SkillIcon}>Core Competencies</SectionTitle>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
            {skills?.length ? skills.map((s, idx) => (
              <Chip key={idx} label={s} color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
            )) : <Typography variant="body2" color="text.secondary">Private or not specified.</Typography>}
          </Stack>

          {/* Experience */}
          <SectionTitle icon={ExperienceIcon}>Professional Experience</SectionTitle>
          <Stack spacing={2}>
            {experience?.length ? experience.map((exp, idx) => (
              <Card key={idx} variant="outlined" sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.1)' }}>
                <CardContent>
                  <Typography fontWeight={800} variant="subtitle1">{exp.position || 'N/A'} @ {exp.company || 'N/A'}</Typography>
                  <Typography variant="caption" color="primary" fontWeight={700}>{exp.start || '—'} ~ {exp.end || 'Present'}</Typography>
                  <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-line' }}>{exp.description}</Typography>
                </CardContent>
              </Card>
            )) : <Typography variant="body2" color="text.secondary">Private or not specified.</Typography>}
          </Stack>

          {/* Education */}
          <SectionTitle icon={EducationIcon}>Education</SectionTitle>
          <Stack spacing={2}>
            {education?.length ? education.map((edu, idx) => (
              <Card key={idx} variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography fontWeight={800}>{edu.school || 'N/A'}</Typography>
                  <Typography variant="body2" color="text.secondary">{edu.degree} ({edu.start} - {edu.end})</Typography>
                </CardContent>
              </Card>
            )) : <Typography variant="body2" color="text.secondary">Private or not specified.</Typography>}
          </Stack>

          {/* Projects */}
          <SectionTitle icon={ProjectIcon}>Key Projects</SectionTitle>
          <Stack spacing={2}>
            {projects?.length ? projects.map((proj, idx) => (
              <Card key={idx} variant="outlined" sx={{ borderRadius: 3 }}>
                <CardContent>
                  <Typography fontWeight={800}>{proj.title || 'Untitled Project'}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>Role: {proj.role} | {proj.start} - {proj.end}</Typography>
                  <Typography variant="body2">{proj.description}</Typography>
                </CardContent>
              </Card>
            )) : <Typography variant="body2" color="text.secondary">Private or not specified.</Typography>}
          </Stack>

          <Box sx={{ mt: 6, textAlign: 'center' }}>
            <Button variant="contained" size="large" startIcon={<SendIcon />} onClick={handleOpenDialog} sx={{ px: 6, py: 1.5, borderRadius: 3, fontWeight: 700, fontSize: '1.1rem' }}>
              Send Interview Invitation
            </Button>
          </Box>
        </Paper>
      </Container>

      {/* Invitation Dialog */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); setSelectedRequest(null); }} fullWidth PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Select Vacancy for Invitation</DialogTitle>
        <DialogContent dividers>
          {loadingRequests ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box> : 
            companyRequests.length === 0 ? <Typography textAlign="center" py={2}>No active vacancies found.</Typography> : 
            companyRequests.map((req) => (
              <Card key={req._id} variant="outlined" onClick={() => setSelectedRequest(req)} sx={{ mb: 2, cursor: 'pointer', transition: '0.2s', border: selectedRequest?._id === req._id ? '2px solid #1976d2' : '1px solid #ddd', bgcolor: selectedRequest?._id === req._id ? 'rgba(25, 118, 210, 0.05)' : 'white' }}>
                <CardContent>
                  <Typography fontWeight={800}>{req.position} - {req.department}</Typography>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}><SalaryIcon fontSize="small" color="success"/> ${req.salaryRange?.min} - ${req.salaryRange?.max}</Typography>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><LocationIcon fontSize="small" color="action"/> {req.location}</Typography>
                </CardContent>
              </Card>
            ))
          }
          <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 3, mb: 1 }}>Custom Message:</Typography>
          <TextField fullWidth multiline minRows={3} value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Enter a personalized message..." />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setOpenDialog(false)} color="inherit">Cancel</Button>
          <Button onClick={handleSendInvitation} variant="contained" disabled={!selectedRequest} startIcon={<SendIcon />}>Confirm & Sign</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ResumeDetailPage;