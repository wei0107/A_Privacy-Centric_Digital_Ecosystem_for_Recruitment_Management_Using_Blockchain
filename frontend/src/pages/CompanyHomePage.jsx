import { useState, useEffect } from 'react';
import { 
  Box, Typography, Button, Paper, 
  Container, Grid, Divider, Avatar 
} from '@mui/material';
import { 
  Business as BusinessIcon,
  WorkOutline as JobIcon,
  GroupAdd as MatchIcon,
  PersonSearch as SearchIcon,
  CalendarMonth as InvitationIcon,
  ChecklistRtl as ManagementIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';

function CompanyHomePage() {
  useAuthGuard('enterprise');
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');

  useEffect(() => {
    // 取得企業用戶 ID 或名稱
    const storedUserId = sessionStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  const handleLogout = async () => {
    const confirmLogout = window.confirm('Are you sure you want to logout?');
    if (!confirmLogout) return;
  
    try {
      await axios.post('http://localhost:3000/auth/logout', {}, { withCredentials: true });
    } catch (err) {
      console.error('Logout failed:', err);
    }
  
    sessionStorage.clear();
    navigate('/');
  };

  // 企業端功能配置
  const menuItems = [
    { label: 'Manage Jobs', icon: <JobIcon />, path: '/company/manage-jobs' },
    { label: 'Match Results', icon: <MatchIcon />, path: '/company/match-result' },
    { label: 'Talent Search', icon: <SearchIcon />, path: '/company/seeker-list' },
    { label: 'Interview Invitations', icon: <InvitationIcon />, path: '/company/invitations' },
    { label: 'Interview Management', icon: <ManagementIcon />, path: '/company/manage-interview' },
  ];

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        p: 2,
      }}
    >
      <Container maxWidth="md">
        <Paper
          elevation={6}
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 4,
            textAlign: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Header Section */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
            <Avatar 
              sx={{ 
                width: 80, height: 80, 
                bgcolor: 'secondary.main', mb: 2, 
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)' 
              }}
            >
              <BusinessIcon sx={{ fontSize: 50 }} />
            </Avatar>
            <Typography variant="h4" fontWeight={800} color="text.primary">
              Enterprise Portal
            </Typography>
            <Typography 
              variant="body1" 
              sx={{ color: 'text.secondary', mt: 1, fontWeight: 500 }}
            >
              Welcome back, {userId || 'Company Admin'}
            </Typography>
          </Box>

          <Divider sx={{ mb: 4 }} />

          {/* Navigation Grid */}
          <Grid 
            container 
            spacing={2} 
            justifyContent="center" 
            alignItems="stretch"
          >
            {menuItems.map((item) => (
              <Grid item xs={12} sm={6} key={item.label}>
                <Button
                  fullWidth
                  variant="outlined"
                  size="large"
                  startIcon={item.icon}
                  onClick={() => navigate(item.path)}
                  sx={{
                    height: '100%',
                    py: 2,
                    px: 3,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontWeight: 600,
                    borderWidth: 2,
                    '&:hover': {
                      borderWidth: 2,
                      backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      transform: 'translateY(-2px)',
                      transition: '0.2s',
                    },
                    '& .MuiButton-startIcon': {
                      mx: 1,
                    },
                  }}
                >
                  {item.label}
                </Button>
              </Grid>
            ))}

            {/* Logout Button */}
            <Grid item xs={12} sm={6}>
              <Button
                fullWidth
                variant="contained"
                color="error"
                size="large"
                startIcon={<LogoutIcon />}
                onClick={handleLogout}
                sx={{
                  mt: 1,
                  py: 1.8,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(211, 47, 47, 0.2)',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 15px rgba(211, 47, 47, 0.3)',
                  }
                }}
              >
                Sign Out
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
}

export default CompanyHomePage;