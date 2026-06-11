import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Divider,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Container,
  Avatar,
} from '@mui/material';
import {
  InfoOutlined as InfoIcon,
  LockOutlined as LockIcon,
  LockOpenOutlined as UnlockIcon,
  EventNote as InterviewIcon,
  AccountCircle as UserIcon,
  EmailOutlined as EmailIcon,
  PhoneIphone as PhoneIcon,
  ChatBubbleOutline as MessageIcon,
  NavigateBefore as BackIcon,
  AccessTime as TimeIcon,
} from '@mui/icons-material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';

const STORAGE_KEY = 'selectedInvitation';

export default function CompanyLookUpInvitationDetail() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();

  /* ---------- State (Logic Unchanged) ---------- */
  const [inv, setInv] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [decLoading, setDecLoading] = useState(false);

  const [openDlg, setOpenDlg] = useState(false);
  const [intTime, setIntTime] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  /* ---------- Helpers (Logic Unchanged) ---------- */
  const hexToUtf8 = (hexString) => {
    const hex = String(hexString || '').replace(/^0x/, '');
    if (!hex) return '';
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes);
  };

  const stableStringify = (obj) => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  };

  const decryptWithMetaMaskInline = async (ciphertext, address) => {
    if (!window.ethereum) throw new Error('MetaMask not installed');
    const plain = await window.ethereum.request({
      method: 'eth_decrypt',
      params: [ciphertext, address],
    });
    if (typeof plain === 'string' && plain.startsWith('0x')) return hexToUtf8(plain);
    return plain;
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) { navigate(-1); return; }
    try { setInv(JSON.parse(raw)); } catch (e) { navigate(-1); }
    finally { setLoading(false); }
  }, [navigate]);

  const handleDecrypt = async () => {
    if (!inv?.encryptedProfile) return;
    try {
      setDecLoading(true);
      const address = sessionStorage.getItem('address');
      const decrypted = await decryptWithMetaMaskInline(inv.encryptedProfile, address);
      const plain = (decrypted?.trim?.() ?? '');
      setProfile(JSON.parse(plain));
    } catch (err) {
      alert(err?.message || 'Decryption failed. Please check your wallet connection.');
    } finally { setDecLoading(false); }
  };

  const startInterview = async () => {
    try {
      setSubmitLoading(true);
      const companyAddress = sessionStorage.getItem('address');
      const ts = Date.now();
      const interviewIso = new Date(intTime).toISOString();
      const payloadForSign = {
        companyAddress: companyAddress.toLowerCase(),
        invitationId: String(inv._id),
        interviewTime: interviewIso,
        location: String(place),
        note: String(note || ''),
        ts,
      };
      const message = `CreateInterview ${stableStringify(payloadForSign)}`;
      const sig = await window.ethereum.request({ method: 'personal_sign', params: [message, companyAddress] });
      await axios.post('http://localhost:3000/interview', { ...payloadForSign, signature: { flat: sig, message } });
      alert('✅ Interview schedule created successfully');
      navigate(-1);
    } catch (err) {
      alert(err?.response?.data?.msg || err?.message || 'Submission failed');
    } finally { setSubmitLoading(false); }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>Loading Details...</Typography>
      </Box>
    );
  }

  const statusColor = inv.status === 'accepted' ? 'success' : inv.status === 'rejected' ? 'error' : 'warning';
  const statusLabel = inv.status.charAt(0).toUpperCase() + inv.status.slice(1);

  return (
    <Box sx={{ width: '100vw', minHeight: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)', pt: 10, pb: 8, p: 2 }}>
      <Container maxWidth="md">
        <Button startIcon={<BackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2, fontWeight: 700, color: 'text.secondary' }}>Back to Invitations</Button>

        <Paper elevation={10} sx={{ p: { xs: 3, md: 5 }, borderRadius: 5, backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h4" fontWeight={900} color="primary.main">Invitation Details</Typography>
            <Chip label={statusLabel} color={statusColor} sx={{ fontWeight: 800, px: 1 }} />
          </Stack>
          
          <Divider sx={{ mb: 4 }} />

          {/* ===== Basic Information ===== */}
          <Stack spacing={2} mb={4}>
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">RECIPIENT (SEEKER ID)</Typography>
              <Typography variant="body1" fontWeight={600} sx={{ wordBreak: 'break-all' }}>{inv.seekerId}</Typography>
            </Box>
            
            <Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary">TARGET POSITION</Typography>
              <Typography variant="h6" fontWeight={800}>{inv.position} ({inv.department})</Typography>
            </Box>

            <Stack direction="row" spacing={4}>
              <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary">SENT AT</Typography>
                <Typography variant="body2">{inv.invitedAt ? new Date(inv.invitedAt).toLocaleString() : '—'}</Typography>
              </Box>
            </Stack>

            {inv.message && (
              <Box sx={{ bgcolor: 'rgba(0,0,0,0.02)', p: 2, borderRadius: 3, borderLeft: '4px solid #1976d2' }}>
                <Typography variant="caption" fontWeight={700} color="primary">YOUR MESSAGE</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>{inv.message}</Typography>
              </Box>
            )}
          </Stack>

          <Divider sx={{ my: 4 }} />

          {/* ===== Decrypted Professional Data ===== */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" fontWeight={800} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <UnlockIcon color="primary" /> Professional Contact Info
            </Typography>

            {inv.status !== 'accepted' ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 3, bgcolor: 'rgba(0,0,0,0.02)' }}>
                <LockIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">Personal data is locked until the applicant accepts the invitation.</Typography>
              </Paper>
            ) : !inv.encryptedProfile ? (
              <Typography color="text.secondary">No profile data provided by the applicant.</Typography>
            ) : profile ? (
              <Stack spacing={2} sx={{ bgcolor: 'primary.main', color: 'white', p: 3, borderRadius: 4, boxShadow: 4 }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Avatar sx={{ bgcolor: 'white', color: 'primary.main' }}><UserIcon /></Avatar>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}>FULL NAME</Typography>
                    <Typography variant="h6" fontWeight={800}>{profile.name}</Typography>
                  </Box>
                </Stack>
                <Divider sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
                <Stack direction="row" spacing={3}>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}><PhoneIcon fontSize="inherit" /> PHONE</Typography>
                    <Typography variant="body1" fontWeight={600}>{profile.phone}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ opacity: 0.8 }}><EmailIcon fontSize="inherit" /> E-MAIL</Typography>
                    <Typography variant="body1" fontWeight={600}>{profile.email}</Typography>
                  </Box>
                </Stack>
              </Stack>
            ) : (
              <Button fullWidth variant="contained" size="large" onClick={handleDecrypt} disabled={decLoading} startIcon={decLoading ? <CircularProgress size={20} /> : <UnlockIcon />} sx={{ py: 2, borderRadius: 3, fontWeight: 700 }}>
                {decLoading ? 'Decrypting via MetaMask...' : 'Decrypt Applicant Profile'}
              </Button>
            )}
          </Box>

          {/* ===== Action Section ===== */}
          {inv.status === 'accepted' && (
            <Box sx={{ mt: 6, p: 3, borderRadius: 4, border: '2px dashed #1976d2', textAlign: 'center' }}>
              <Typography variant="subtitle1" fontWeight={800} mb={2}>Ready to proceed?</Typography>
              <Button variant="contained" size="large" onClick={() => setOpenDlg(true)} startIcon={<InterviewIcon />} sx={{ px: 4, py: 1.5, borderRadius: 3, fontWeight: 700 }}>
                Set Interview Schedule
              </Button>
            </Box>
          )}
        </Paper>
      </Container>

      {/* ::::: Interview Schedule Dialog ::::: */}
      <Dialog open={openDlg} onClose={() => setOpenDlg(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Schedule Interview</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} mt={1}>
            <TextField label="Interview Time" type="datetime-local" InputLabelProps={{ shrink: true }} value={intTime} onChange={(e) => setIntTime(e.target.value)} fullWidth />
            <TextField label="Location / Meeting Link" placeholder="Office address or Zoom/Google Meet link" value={place} onChange={(e) => setPlace(e.target.value)} fullWidth />
            <TextField label="Additional Notes" multiline minRows={3} placeholder="Provide instructions for the candidate..." value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenDlg(false)} color="inherit">Cancel</Button>
          <Button onClick={startInterview} variant="contained" disabled={!intTime || !place || submitLoading} sx={{ px: 4, borderRadius: 2 }}>
            {submitLoading ? 'Signing...' : 'Confirm & Sign'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}