import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Paper,
  Divider,
  Chip,
  CircularProgress,
  ButtonBase,
  Container,
  Avatar
} from '@mui/material';
import {
  WorkOutline as JobIcon,
  PeopleAlt as ApplicantIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  Psychology as SkillIcon,
  AssignmentInd as ResumeIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';

function CompanyViewJobApply() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();
  const { jobId } = useParams();

  const [jobInfo, setJobInfo] = useState(null);
  const [applies, setApplies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobAndApplications = async () => {
      try {
        const { data: jobRes } = await axios.get(`http://localhost:3000/company/get-request?id=${jobId}`);
        setJobInfo(jobRes.request);

        const { data: applyRes } = await axios.get(`http://localhost:3000/company/applies?jobId=${jobId}`);
        setApplies(applyRes.applies || []);
      } catch (err) {
        console.error('❌ Failed to fetch application data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchJobAndApplications();
  }, [jobId]);

  const handleSeekerClick = (seekerId) => {
    navigate(`/company/resume/${seekerId}`);
  };

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)' 
      }}>
        <CircularProgress size={60} thickness={4} />
        <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>Loading Applicants...</Typography>
      </Box>
    );
  }

  if (!jobInfo) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <Typography variant="h6" color="error">
          Error: Unable to retrieve job data.
        </Typography>
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
            Job Applicants
          </Typography>
          <Typography variant="body1" color="text.secondary">
            View and manage applications received for this vacancy.
          </Typography>
        </Box>

        <Paper 
          elevation={10} 
          sx={{ 
            p: { xs: 3, md: 4 }, 
            borderRadius: 5, 
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
            mb: 4
          }}
        >
          {/* ---- Job Header Information ---- */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <JobIcon color="primary" /> {jobInfo.position}
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
              {jobInfo.department}
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ ml: 4, mb: 2 }}>
              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationIcon fontSize="small" color="action" /> <strong>Location:</strong> {jobInfo.location}
              </Typography>
              <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <SalaryIcon fontSize="small" color="success" /> <strong>Range:</strong> ${jobInfo.salaryRange.min.toLocaleString()} - ${jobInfo.salaryRange.max.toLocaleString()}
              </Typography>
            </Stack>

            <Box sx={{ ml: 4 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                REQUISITE SKILLS:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
                {jobInfo.requirements.map((req, idx) => (
                  <Chip key={idx} label={req} size="small" variant="outlined" sx={{ fontWeight: 600, bgcolor: 'rgba(0,0,0,0.03)' }} />
                ))}
              </Stack>
            </Box>
          </Box>

          <Divider sx={{ my: 4 }}>
            <Chip label="APPLICANT LIST" size="small" sx={{ fontWeight: 800, px: 2 }} />
          </Divider>

          {/* ---- Applicants List ---- */}
          {applies.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <ApplicantIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography variant="body1" color="text.secondary">
                No applications received for this position yet.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {applies.map((apply, idx) => (
                <ButtonBase
                  key={`${apply.seekerAddress}_${idx}`}
                  onClick={() => handleSeekerClick(apply.seekerAddress)}
                  sx={{ width: '100%', textAlign: 'left', borderRadius: 3, overflow: 'hidden' }}
                >
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2.5,
                      width: '100%',
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      gap: 2,
                      transition: 'all 0.2s',
                      borderRadius: 3,
                      '&:hover': { 
                        backgroundColor: 'white', 
                        borderColor: 'primary.main',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                        transform: 'scale(1.01)'
                      }
                    }}
                  >
                    <Avatar sx={{ bgcolor: 'primary.light', width: 48, height: 48 }}>
                      <ResumeIcon />
                    </Avatar>
                    
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                        {apply.seekerAddress.slice(0, 8)}...{apply.seekerAddress.slice(-6)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <SkillIcon fontSize="inherit" /> Skills: {apply.skills.join(', ')}
                      </Typography>
                    </Box>

                    <Box sx={{ textAlign: { xs: 'left', sm: 'right' }, minWidth: '120px' }}>
                      <Typography variant="h6" fontWeight={800} color="success.main">
                        ${apply.expectedSalary.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                        EXPECTED SALARY
                      </Typography>
                    </Box>
                  </Paper>
                </ButtonBase>
              ))}
            </Stack>
          )}
        </Paper>
      </Container>
    </Box>
  );
}

export default CompanyViewJobApply;