import { useState, useEffect } from 'react';
import { 
  Box, Typography, Button, Stack, Paper, 
  Container, Grid, Divider, Avatar 
} from '@mui/material';
import { 
  AccountCircle as AccountIcon,
  Assignment as RequestIcon,
  Description as ResumeIcon,
  Work as JobIcon,
  CompareArrows as MatchIcon,
  Email as InvitationIcon,
  Assessment as ResultIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';

function SeekerHomePage() {
  useAuthGuard('jobseeker');
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');

  useEffect(() => {
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

  // 定義按鈕配置，方便維護與渲染
  const menuItems = [
    { label: 'Edit Profile', icon: <AccountIcon />, path: '/seeker/edit-profile', color: 'primary' },
    { label: 'Job Preferences', icon: <RequestIcon />, path: '/seeker/edit-request', color: 'primary' },
    { label: 'Manage Resume', icon: <ResumeIcon />, path: '/seeker/edit-resume', color: 'primary' },
    { label: 'Browse Jobs', icon: <JobIcon />, path: '/seeker/job-list', color: 'primary' },
    { label: 'Match Results', icon: <MatchIcon />, path: '/seeker/match-result', color: 'secondary' },
    { label: 'Interview Invitations', icon: <InvitationIcon />, path: '/seeker/interview-invitations', color: 'secondary' },
    { label: 'Application Status', icon: <ResultIcon />, path: '/seeker/interview-results', color: 'secondary' },
  ];

  // ... 前面邏輯保持不變 ...

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
              sx={{ width: 80, height: 80, bgcolor: 'primary.main', mb: 2, boxShadow: 3 }}
            >
              <AccountIcon sx={{ fontSize: 40 }} />
            </Avatar>
            <Typography variant="h5" fontWeight={800} color="text.primary">
              Welcome Back
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.secondary', 
                fontWeight: 500, 
                mb: 1, 
                wordBreak: 'break-all',
                maxWidth: '80%' // 限制寬度讓地址自動換行，不撐開版面
              }}
            >
              {userId || 'Seeker Address'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Manage your career and blockchain-secured profile here.
            </Typography>
          </Box>

          <Divider sx={{ mb: 4 }} />

          {/* Navigation Grid */}
          <Grid 
            container 
            spacing={2} 
            justifyContent="center" // ✅ 確保 Grid 項目在水平方向置中
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
                    justifyContent: 'center', // ✅ 關鍵：將內容（圖示+文字）置中
                    alignItems: 'center',
                    textAlign: 'center',
                    borderRadius: 2,
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontWeight: 600,
                    borderWidth: 2,
                    // 讓圖示與文字垂直居中對齊
                    '& .MuiButton-startIcon': {
                      mx: 1, // 調整左右間距
                    },
                    '&:hover': {
                      borderWidth: 2,
                      backgroundColor: 'rgba(25, 118, 210, 0.04)',
                      transform: 'translateY(-2px)',
                      transition: '0.2s',
                    },
                  }}
                >
                  {item.label}
                </Button>
              </Grid>
            ))}

            {/* Sign Out 按鈕也同樣保持中央對齊 */}
            <Grid item xs={12} sm={6}> {/* ✅ 如果想讓登出按鈕也變小並置中，可以改 sm={6} */}
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

export default SeekerHomePage;