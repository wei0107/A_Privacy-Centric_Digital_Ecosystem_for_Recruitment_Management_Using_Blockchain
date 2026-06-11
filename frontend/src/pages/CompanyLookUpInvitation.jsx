import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Divider,
  Chip,
  CircularProgress,
  Button,
  ButtonBase,
  Container,
} from '@mui/material';
import {
  AssignmentTurnedIn as InviteIcon,
  Business as JobIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  AccountBalanceWallet as WalletIcon,
  NavigateBefore,
  NavigateNext,
  CalendarToday as DateIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';

const INVITES_PER_PAGE = 4;
const STORAGE_KEY = 'selectedInvitation';

function CompanyLookupInvitationPage() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---------- Fetch Data (Logic Unchanged) ---------- */
  useEffect(() => {
    (async () => {
      try {
        const address = sessionStorage.getItem('address');
        const { data: { requests } } = await axios.get(
          'http://localhost:3000/company/get-requests',
          { params: { address } },
        );

        const jobsWithInv = await Promise.all(
          requests.map(async (job) => {
            const { data } = await axios.get(
              'http://localhost:3000/company/get-invitations',
              { params: { 
                companyId: job.companyId,
                position : job.position,
                department: job.department 
              }}
            );
            return {
              ...job,
              invitations: data.invitations ?? [],
              page: 1,
            };
          })
        );

        setJobs(jobsWithInv);
      } catch (err) {
        console.error('❌ Failed to fetch invitations:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- Pagination (Logic Unchanged) ---------- */
  const changePage = (jobIdx, delta) => {
    setJobs(prev =>
      prev.map((job, idx) =>
        idx === jobIdx
          ? { ...job,
              page: Math.max(
                      1,
                      Math.min(
                        Math.ceil(job.invitations.length / INVITES_PER_PAGE),
                        job.page + delta
                      )
                    )
            }
          : job
      )
    );
  };

  /* ---------- Navigation (Logic Unchanged) ---------- */
  const handleInviteClick = (invitation) => {
    if (invitation.status !== 'accepted') return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(invitation));
    navigate(`/company/invitation-detail?seekerId=${invitation.seekerId}`);
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
        height: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' 
      }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>Loading Invitation History...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      width: '100vw', minHeight: '100vh',
      background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      pt: 10, pb: 8, px: 2
    }}>
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h3" fontWeight={900} color="primary.main" gutterBottom sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <InviteIcon fontSize="large" /> Invitation Outbox
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track and manage all interview requests sent to decentralized talents.
          </Typography>
        </Box>

        <Stack spacing={4}>
          {jobs.map((job, jobIdx) => {
            const start = (job.page - 1) * INVITES_PER_PAGE;
            const invites = job.invitations.slice(start, start + INVITES_PER_PAGE);
            const totalPages = Math.ceil(job.invitations.length / INVITES_PER_PAGE);

            return (
              <Paper key={job._id} elevation={10} sx={{ 
                p: { xs: 3, md: 4 }, borderRadius: 5, 
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(10px)'
              }}>

                {/* ---- Job Info Section ---- */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h5" fontWeight={800} color="text.primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <JobIcon color="primary" /> {job.position} ({job.department})
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ color: 'text.secondary', mb: 2 }}>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <LocationIcon fontSize="small" /> {job.location}
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main', fontWeight: 600 }}>
                      <SalaryIcon fontSize="small" /> ${job.salaryRange.min.toLocaleString()} - ${job.salaryRange.max.toLocaleString()}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
                    {job.requirements.map((req, idx) => (
                      <Chip key={idx} label={req} size="small" variant="outlined" sx={{ fontWeight: 600, bgcolor: 'rgba(0,0,0,0.03)' }} />
                    ))}
                  </Stack>
                </Box>

                <Divider sx={{ my: 3 }}>
                  <Chip label="SENT INVITATIONS" size="small" sx={{ fontWeight: 800, px: 2 }} />
                </Divider>

                {/* ---- Invitation List ---- */}
                {job.invitations.length === 0
                  ? <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4, fontStyle: 'italic' }}>
                      (No invitations sent for this vacancy yet)
                    </Typography>
                  : <>
                      <Stack spacing={2}>
                        {invites.map(inv => {
                          const statusInfo = {
                            accepted: { label: 'Accepted', color: '#2e7d32', bg: '#edf7ed' },
                            rejected: { label: 'Declined', color: '#c62828', bg: '#fdeded' },
                            pending: { label: 'Pending', color: '#f9a825', bg: '#fffde7' }
                          }[inv.status] || { label: inv.status, color: '#666', bg: '#f5f5f5' };

                          return (
                            <ButtonBase
                              key={inv._id}
                              sx={{ width:'100%', textAlign:'left', borderRadius: 3, overflow: 'hidden' }}
                              onClick={() => handleInviteClick(inv)}
                              disabled={inv.status !== 'accepted'}
                            >
                              <Paper variant="outlined" sx={{
                                p: 2.5, width: '100%',
                                transition: 'all 0.2s',
                                cursor: inv.status === 'accepted' ? 'pointer' : 'default',
                                borderLeft: `6px solid ${statusInfo.color}`,
                                '&:hover': inv.status === 'accepted' ? { 
                                  backgroundColor: '#fff',
                                  boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                                  transform: 'scale(1.01)'
                                } : {}
                              }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                  <Stack spacing={0.5}>
                                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.dark' }}>
                                      <WalletIcon fontSize="inherit" /> {inv.seekerId.slice(0, 10)}...{inv.seekerId.slice(-8)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <DateIcon fontSize="inherit" /> Sent on: {new Date(inv.invitedAt).toLocaleDateString()}
                                    </Typography>
                                  </Stack>
                                  <Chip
                                    label={statusInfo.label.toUpperCase()}
                                    sx={{ 
                                      fontWeight: 800, fontSize: '0.65rem',
                                      color: statusInfo.color, 
                                      bgcolor: statusInfo.bg,
                                      border: `1px solid ${statusInfo.color}`
                                    }}
                                    size="small"
                                  />
                                </Stack>
                              </Paper>
                            </ButtonBase>
                          );
                        })}
                      </Stack>

                      {/* ---- Pagination Control ---- */}
                      {totalPages > 1 && (
                        <Stack direction="row" justifyContent="center" alignItems="center" spacing={3} mt={4}>
                          <Button size="small" startIcon={<NavigateBefore />}
                            disabled={job.page === 1}
                            onClick={() => changePage(jobIdx, -1)}
                            sx={{ fontWeight: 700 }}>
                            Prev
                          </Button>
                          <Typography variant="body2" fontWeight={800} color="text.secondary">
                            Page {job.page} of {totalPages}
                          </Typography>
                          <Button size="small" endIcon={<NavigateNext />}
                            disabled={job.page >= totalPages}
                            onClick={() => changePage(jobIdx, 1)}
                            sx={{ fontWeight: 700 }}>
                            Next
                          </Button>
                        </Stack>
                      )}
                    </>
                }
              </Paper>
            );
          })}
        </Stack>
      </Container>
    </Box>
  );
}

export default CompanyLookupInvitationPage;