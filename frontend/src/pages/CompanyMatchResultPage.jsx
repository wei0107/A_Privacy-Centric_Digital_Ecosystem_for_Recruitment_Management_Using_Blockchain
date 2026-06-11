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
  Avatar
} from '@mui/material';
import {
  WorkOutline as JobIcon,
  PeopleAlt as MatchIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  NavigateBefore,
  NavigateNext,
  WorkspacePremium as ScoreIcon
} from '@mui/icons-material';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function CompanyMatchResultPage() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const MATCHES_PER_PAGE = 3;

  /* ---------------- 取得配對資料 (Logic Unchanged) ---------------- */
  useEffect(() => {
    const fetchMatchData = async () => {
      try {
        const address = sessionStorage.getItem('address');
        const { data: { requests } } = await axios.get(
          `http://localhost:3000/company/get-requests?address=${address}`
        );

        const withMatches = await Promise.all(
          requests.map(async (job) => {
            const { data } = await axios.get('http://localhost:3000/match/company', {
              params: { jobId: job._id }
            });

            return { ...job, matches: data.matches ?? [], page: 1 };
          })
        );

        setJobs(withMatches);
      } catch (err) {
        console.error('❌ Failed to fetch matches:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMatchData();
  }, []);

  /* ---------------- 分頁切換 (Logic Unchanged) ---------------- */
  const handlePageChange = (jobIdx, delta) => {
    setJobs(prev =>
      prev.map((job, idx) =>
        idx === jobIdx
          ? {
              ...job,
              page: Math.max(
                1,
                Math.min(Math.ceil(job.matches.length / MATCHES_PER_PAGE), job.page + delta)
              )
            }
          : job
      )
    );
  };

  const handleSeekerClick = (seekerAddress) => {
    navigate(`/company/resume/${seekerAddress}`);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' }}>
        <CircularProgress size={60} thickness={4} />
        <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>Scanning the Talent Pool...</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        pt: 10,
        pb: 8,
        p: 2
      }}
    >
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h3" fontWeight={900} color="primary.main" gutterBottom>
            Matching Results
          </Typography>
          <Typography variant="body1" color="text.secondary">
            AI-powered talent matching based on your on-chain job requirements.
          </Typography>
        </Box>

        <Stack spacing={5} sx={{ width: '100%' }}>
          {jobs.map((job, jobIdx) => {
            const start = (job.page - 1) * MATCHES_PER_PAGE;
            const matches = job.matches.slice(start, start + MATCHES_PER_PAGE);
            const totalPages = Math.ceil(job.matches.length / MATCHES_PER_PAGE);

            return (
              <Paper 
                key={job._id} 
                elevation={10} 
                sx={{ 
                  p: { xs: 3, md: 4 }, 
                  borderRadius: 5, 
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}
              >
                {/* ---- Job Header ---- */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h5" fontWeight={800} color="text.primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <JobIcon color="primary" /> {job.position}
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                      <LocationIcon fontSize="small" /> {job.location}
                    </Typography>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main', fontWeight: 600 }}>
                      <SalaryIcon fontSize="small" /> ${job.salaryRange.min.toLocaleString()} - ${job.salaryRange.max.toLocaleString()}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
                    {job.requirements.map((req, idx) => (
                      <Chip key={idx} label={req} size="small" variant="outlined" sx={{ fontWeight: 600, bgcolor: 'rgba(25, 118, 210, 0.05)' }} />
                    ))}
                  </Stack>
                </Box>

                <Divider sx={{ my: 3 }}>
                  <Chip label="MATCHED TALENTS" size="small" sx={{ fontWeight: 800, px: 2 }} />
                </Divider>

                {/* ---- Match List ---- */}
                {job.matches.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4, fontStyle: 'italic' }}>
                    No matching candidates found yet. Try broadening your requirements.
                  </Typography>
                ) : (
                  <>
                    <Stack spacing={2}>
                      {matches.map((seeker, idx) => (
                        <ButtonBase
                          key={`${seeker.seekerAddress}_${idx}`}
                          onClick={() => handleSeekerClick(seeker.seekerAddress)}
                          sx={{ width: '100%', textAlign: 'left', borderRadius: 3, overflow: 'hidden' }}
                        >
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 2.5,
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'all 0.2s',
                              borderRadius: 3,
                              '&:hover': { 
                                backgroundColor: 'white', 
                                borderColor: 'primary.main',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                transform: 'scale(1.01)'
                              }
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Avatar sx={{ bgcolor: 'primary.light' }}>
                                <MatchIcon />
                              </Avatar>
                              <Box>
                                <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'primary.dark' }}>
                                  {seeker.seekerAddress.slice(0, 8)}...{seeker.seekerAddress.slice(-6)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Decentralized Identity Verified
                                </Typography>
                              </Box>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography variant="h6" fontWeight={900} color="primary.main" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                <ScoreIcon fontSize="small" /> {seeker.score}
                              </Typography>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                                MATCH SCORE
                              </Typography>
                            </Box>
                          </Paper>
                        </ButtonBase>
                      ))}
                    </Stack>

                    {/* ---- Pagination Control ---- */}
                    {totalPages > 1 && (
                      <Stack direction="row" justifyContent="center" alignItems="center" spacing={3} mt={4}>
                        <Button
                          size="small"
                          startIcon={<NavigateBefore />}
                          disabled={job.page === 1}
                          onClick={() => handlePageChange(jobIdx, -1)}
                          sx={{ fontWeight: 700 }}
                        >
                          Prev
                        </Button>
                        <Typography variant="body2" fontWeight={800} color="text.secondary">
                          Page {job.page} of {totalPages}
                        </Typography>
                        <Button
                          size="small"
                          endIcon={<NavigateNext />}
                          disabled={job.page >= totalPages}
                          onClick={() => handlePageChange(jobIdx, 1)}
                          sx={{ fontWeight: 700 }}
                        >
                          Next
                        </Button>
                      </Stack>
                    )}
                  </>
                )}
              </Paper>
            );
          })}
        </Stack>
      </Container>
    </Box>
  );
}

export default CompanyMatchResultPage;