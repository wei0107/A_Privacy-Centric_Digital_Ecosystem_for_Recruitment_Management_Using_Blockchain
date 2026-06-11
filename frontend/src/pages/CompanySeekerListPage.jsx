import {
  Box,
  Typography,
  TextField,
  Stack,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Divider,
  Container,
  InputAdornment,
  Avatar
} from '@mui/material';
import {
  Search as SearchIcon,
  PeopleAlt as TalentIcon,
  LocationOn as LocationIcon,
  AttachMoney as SalaryIcon,
  Psychology as SkillIcon,
  Description as NoteIcon,
  Visibility as ViewIcon,
  AccountCircle as UserIcon
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import useAuthGuard from '../hooks/useAuthGuard';

function CompanySeekerListPage() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();

  /* ---------------- state (Logic Unchanged) ---------------- */
  const [searchTerm, setSearchTerm] = useState('');
  const [seekers, setSeekers] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---------------- fetch data (Logic Unchanged) ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('http://localhost:3000/company/get-all-seekers');
        setSeekers(res.data.seekers || []);
      } catch (err) {
        console.error('❌ Failed to fetch seekers:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------------- filter (Logic Unchanged) ---------------- */
  const term = searchTerm.toLowerCase();
  const filtered = seekers.filter((s) =>
    (s.position || '').toLowerCase().includes(term) ||
    (s.location || '').toLowerCase().includes(term) ||
    (s.skills.join(' ') || '').toLowerCase().includes(term)
  );

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
        {/* Header Section */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h3" fontWeight={900} color="primary.main" gutterBottom sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <TalentIcon fontSize="large" /> Talent Pool
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Explore verified professionals from the decentralized talent network.
          </Typography>
        </Box>

        {/* Search Bar */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 6 }}>
          <TextField
            placeholder="Search by position, skills, or location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            variant="outlined"
            sx={{ 
              width: '100%', 
              maxWidth: 500,
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="primary" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {loading ? (
          <Box sx={{ textAlign: 'center', mt: 10 }}>
            <CircularProgress size={60} thickness={4} />
            <Typography sx={{ mt: 2, fontWeight: 600, color: 'primary.main' }}>Loading Professionals...</Typography>
          </Box>
        ) : (
          <Stack spacing={3} sx={{ width: '100%' }}>
            {filtered.map((s) => (
              <Paper
                key={s._id}
                elevation={6}
                sx={{
                  p: { xs: 3, md: 4 },
                  borderRadius: 5,
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(10px)',
                  transition: '0.3s',
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: 10 }
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                  <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.light' }}>
                    <UserIcon sx={{ fontSize: 40 }} />
                  </Avatar>
                  
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h5" fontWeight={800} color="text.primary">
                      {s.position || 'Untitled Position'}
                    </Typography>
                    
                    <Stack direction="row" spacing={2} sx={{ mt: 1, color: 'text.secondary' }}>
                      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LocationIcon fontSize="small" /> {s.location || 'N/A'}
                      </Typography>
                      <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main', fontWeight: 600 }}>
                        <SalaryIcon fontSize="small" /> Expected: ${s.expectedSalary?.toLocaleString() ?? '--'}
                      </Typography>
                    </Stack>
                  </Box>

                  <Button
                    variant="contained"
                    startIcon={<ViewIcon />}
                    onClick={() => navigate(`/company/resume/${s.address}`)}
                    sx={{ 
                      borderRadius: 2, 
                      textTransform: 'none', 
                      fontWeight: 700,
                      minWidth: '140px'
                    }}
                  >
                    View Resume
                  </Button>
                </Stack>

                <Divider sx={{ my: 3 }} />

                {/* Skills Section */}
                <Box>
                  <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'primary.dark' }}>
                    <SkillIcon fontSize="small" /> Core Competencies:
                  </Typography>
                  {s.skills.length ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
                      {s.skills.map((skill, i) => (
                        <Chip 
                          key={i} 
                          label={skill} 
                          size="small" 
                          variant="outlined" 
                          sx={{ fontWeight: 600, bgcolor: 'rgba(25, 118, 210, 0.05)' }} 
                        />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No specific skills listed.</Typography>
                  )}
                </Box>

                {/* Notes Section */}
                {s.notes && (
                  <Box mt={3} sx={{ bgcolor: 'rgba(0,0,0,0.02)', p: 2, borderRadius: 3 }}>
                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <NoteIcon fontSize="small" color="action" /> Note from Professional:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{s.notes}</Typography>
                  </Box>
                )}
              </Paper>
            ))}

            {filtered.length === 0 && (
              <Paper sx={{ p: 10, textAlign: 'center', borderRadius: 5, bgcolor: 'rgba(255,255,255,0.6)' }}>
                <Typography color="text.secondary" variant="h6">
                  No professionals match your search criteria.
                </Typography>
              </Paper>
            )}
          </Stack>
        )}
      </Container>
    </Box>
  );
}

export default CompanySeekerListPage;