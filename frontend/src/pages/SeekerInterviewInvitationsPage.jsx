import {
  Box,
  Typography,
  Stack,
  Card,
  CardHeader,
  CardContent,
  CardActions,
  Chip,
  Divider,
  Button,
  CircularProgress,
  Container,
  Paper,
} from '@mui/material';
import {
  EmailOutlined as InviteIcon,
  Business as BusinessIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  AccessTime as TimeIcon,
  ChatBubbleOutline as MessageIcon,
  Notes as NoteIcon,
  CheckCircle as AcceptIcon,
  Cancel as RejectIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useState, useEffect } from 'react';
import useAuthGuard from '../hooks/useAuthGuard';
import { decryptWithMetaMask } from '../../utils/encryption';

const API_BASE = 'http://localhost:3000';

function SeekerInterviewInvitationsPage() {
  useAuthGuard('jobseeker');

  const seekerId = (sessionStorage.getItem('address') || '').toLowerCase();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);

  /* =========================
   * Helpers (Logic Unchanged)
   * ========================= */
  const encryptForMetaMask = async (companyEncPubKeyBase64, plaintext) => {
    const { encrypt } = await import('@metamask/eth-sig-util');
    const encObj = encrypt({
      publicKey: companyEncPubKeyBase64,
      data: plaintext,
      version: 'x25519-xsalsa20-poly1305',
    });
    const json = JSON.stringify(encObj);
    const bytes = new TextEncoder().encode(json);
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return '0x' + hex;
  };

  const stableStringify = (obj) => {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  };

  const signInviteDecision = async ({ seekerId, invitationId, newStatus, ts }) => {
    if (!window.ethereum) throw new Error('MetaMask not found');
    const payload = {
      seekerId: String(seekerId || '').toLowerCase(),
      invitationId: String(invitationId || ''),
      newStatus: String(newStatus || ''),
      ts: Number(ts),
    };
    const canonical = stableStringify(payload);
    const message = `UpdateInvitationStatus ${canonical}`;
    const sig = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, seekerId],
    });
    return { flat: sig, message };
  };

  /* =========================
   * Load invitations (Logic Unchanged)
   * ========================= */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`${API_BASE}/seeker/getInvitations`, {
          params: { seekerId },
        });
        setInvitations(data.invitations ?? []);
      } catch (err) {
        console.error('❌ Failed to fetch invitations:', err);
        setInvitations([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [seekerId]);

  /* =========================
   * Update status (Logic Unchanged)
   * ========================= */
  const updateStatus = async (id, newStatus) => {
    try {
      const address = sessionStorage.getItem('address');
      if (!address) throw new Error('Please login first');
      const seekerIdLower = address.toLowerCase();
      const inv = invitations.find((x) => x._id === id);
      if (!inv) throw new Error('Invitation not found');

      let encryptedProfile = null;
      if (newStatus === 'accepted') {
        const companyEncPubKey = inv.companyEncPubKey || inv.companyEncPubKeyBase64 || inv.companyPublicKey;
        if (!companyEncPubKey) throw new Error('Company encryption key missing');
        const res = await axios.get(`${API_BASE}/seeker/getProfile`, {
          params: { address: seekerIdLower },
          withCredentials: true,
        });
        if (!res?.data || res.data.success === false) throw new Error('Failed to fetch profile');
        const ciphertextStr = (res.data?.ciphertext || '').trim();
        const decrypted = await decryptWithMetaMask(ciphertextStr, address);
        let profilePlaintext = decrypted;
        try {
          const obj = JSON.parse(decrypted);
          profilePlaintext = JSON.stringify(obj);
        } catch (_) {
          profilePlaintext = String(decrypted);
        }
        encryptedProfile = await encryptForMetaMask(companyEncPubKey, profilePlaintext);
      }

      const ts = Date.now();
      const signature = await signInviteDecision({ seekerId: seekerIdLower, invitationId: id, newStatus, ts });
      await axios.post(`${API_BASE}/seeker/updateInvitationStatus`, {
        seekerId: seekerIdLower,
        invitationId: id,
        newStatus,
        encryptedProfile,
        ts,
        signature,
      });

      setInvitations((prev) =>
        prev.map((x) => (x._id === id ? { ...x, status: newStatus, encryptedProfile } : x))
      );
    } catch (err) {
      console.error('❌ Update failed:', err);
      alert(err?.message || 'Update failed, please try again.');
    }
  };

  if (loading) {
    return (
      <Box sx={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>Fetching Invitations...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100vw', minHeight: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)', pt: 10, pb: 8 }}>
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h3" fontWeight={900} color="primary.main" gutterBottom sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <InviteIcon fontSize="large" /> Interview Invitations
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your incoming interview requests and share your profile securely.
          </Typography>
        </Box>

        {invitations.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 4, bgcolor: 'rgba(255,255,255,0.6)' }}>
            <Typography variant="h6" color="text.secondary">No invitations at the moment.</Typography>
          </Paper>
        ) : (
          <Stack spacing={3}>
            {invitations.map((inv) => {
              const { _id, companyId, position, department, salaryRange, requirements = [], location, notes, message, invitedAt, interviewTime, status } = inv;

              const statusConfig = {
                pending: { color: '#ff9800', label: 'Pending', icon: <TimeIcon fontSize="small" /> },
                accepted: { color: '#4caf50', label: 'Accepted', icon: <AcceptIcon fontSize="small" /> },
                rejected: { color: '#f44336', label: 'Declined', icon: <RejectIcon fontSize="small" /> },
              };

              const config = statusConfig[status] || statusConfig.pending;

              return (
                <Card key={_id} elevation={6} sx={{ borderRadius: 4, overflow: 'hidden', transition: '0.3s', '&:hover': { transform: 'translateY(-4px)', boxShadow: 10 } }}>
                  <Box sx={{ height: 6, bgcolor: config.color }} />
                  <CardHeader
                    avatar={<BusinessIcon color="action" />}
                    title={<Typography variant="h6" fontWeight={800}>{position || 'Unknown Position'}</Typography>}
                    subheader={<Typography variant="caption" sx={{ wordBreak: 'break-all' }}>Company: {companyId}</Typography>}
                    action={<Chip icon={config.icon} label={config.label} sx={{ bgcolor: `${config.color}22`, color: config.color, fontWeight: 700, border: `1px solid ${config.color}` }} />}
                  />
                  
                  <Divider />

                  <CardContent sx={{ px: 3, pt: 2 }}>
                    <Stack spacing={2}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <SalaryIcon fontSize="small" color="success" /> <strong>Salary:</strong> ${salaryRange?.min?.toLocaleString()} - ${salaryRange?.max?.toLocaleString()}
                        </Typography>
                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LocationIcon fontSize="small" color="primary" /> <strong>Location:</strong> {location || 'Remote'}
                        </Typography>
                      </Stack>

                      {requirements?.length > 0 && (
                        <Box>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
                            {requirements.map((req, idx) => (
                              <Chip key={idx} label={req} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                            ))}
                          </Stack>
                        </Box>
                      )}

                      <Stack spacing={1} sx={{ bgcolor: 'rgba(0,0,0,0.02)', p: 2, borderRadius: 2 }}>
                        {notes && (
                          <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <NoteIcon fontSize="inherit" sx={{ mt: 0.5 }} /> Note: {notes}
                          </Typography>
                        )}
                        {message && (
                          <Typography variant="body2" color="text.primary" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, fontWeight: 500 }}>
                            <MessageIcon fontSize="inherit" sx={{ mt: 0.5 }} /> Message: "{message}"
                          </Typography>
                        )}
                      </Stack>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">Sent: {invitedAt ? new Date(invitedAt).toLocaleDateString() : '—'}</Typography>
                        <Typography variant="body2" fontWeight={700} color="primary.main">
                          Interview: {interviewTime ? new Date(interviewTime).toLocaleString() : 'TBD'}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>

                  {status === 'pending' && (
                    <CardActions sx={{ px: 3, pb: 3, gap: 2 }}>
                      <Button fullWidth variant="contained" color="success" onClick={() => updateStatus(_id, 'accepted')} sx={{ borderRadius: 2, fontWeight: 700, py: 1 }}>
                        Accept & Share Profile
                      </Button>
                      <Button fullWidth variant="outlined" color="error" onClick={() => updateStatus(_id, 'rejected')} sx={{ borderRadius: 2, fontWeight: 700, py: 1 }}>
                        Decline
                      </Button>
                    </CardActions>
                  )}
                </Card>
              );
            })}
          </Stack>
        )}
      </Container>
    </Box>
  );
}

export default SeekerInterviewInvitationsPage;