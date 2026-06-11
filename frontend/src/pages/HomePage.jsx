import { useNavigate } from 'react-router-dom';
import { 
  Box, Button, Typography, Stack, Paper, 
  Container, Divider, Avatar 
} from '@mui/material';
import { 
  VpnKey as LoginIcon, 
  Fingerprint as DidIcon, 
  Hub as AppChainIcon,
  Security as SecurityIcon
} from '@mui/icons-material';

function HomePage() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        // ✅ 延續一致的 Web3 漸層背景
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        p: 2,
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
          {/* Logo & Title */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
            <Avatar 
              sx={{ 
                width: 70, height: 70, 
                bgcolor: 'primary.main', mb: 2, 
                boxShadow: '0 8px 16px rgba(25, 118, 210, 0.2)' 
              }}
            >
              <SecurityIcon sx={{ fontSize: 40 }} />
            </Avatar>
            <Typography variant="h4" fontWeight={900} color="text.primary" gutterBottom>
              HR Blockchain
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
              Secure. Decentralized. Trustless Recruitment.
            </Typography>
          </Box>

          <Divider sx={{ my: 4 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase' }}>
              Access Portal
            </Typography>
          </Divider>

          <Stack spacing={2.5}>
            {/* Login - 主要行動按鈕 */}
            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={<LoginIcon />}
              onClick={() => navigate('/login')}
              sx={{
                py: 2,
                fontSize: '1.1rem',
                fontWeight: 700,
                borderRadius: 2.5,
                textTransform: 'none',
                boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                '&:hover': { transform: 'translateY(-2px)' }
              }}
            >
              System Login
            </Button>

            {/* Register DID */}
            <Button
              fullWidth
              variant="outlined"
              size="large"
              startIcon={<DidIcon />}
              onClick={() => navigate('/register-DID')}
              sx={{
                py: 1.8,
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: 2.5,
                textTransform: 'none',
                borderWidth: 2,
                '&:hover': { borderWidth: 2, transform: 'translateY(-2px)' }
              }}
            >
              Register DID
            </Button>

            {/* Register APP-chain */}
            <Button
              fullWidth
              variant="outlined"
              size="large"
              startIcon={<AppChainIcon />}
              onClick={() => navigate('/register-app')}
              sx={{
                py: 1.8,
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: 2.5,
                textTransform: 'none',
                borderWidth: 2,
                '&:hover': { borderWidth: 2, transform: 'translateY(-2px)' }
              }}
            >
              Register APP-chain
            </Button>
          </Stack>

          <Box sx={{ mt: 5 }}>
            <Typography variant="caption" color="text.disabled">
              © 2026 HR-blockchain. A research project conducted at NYCU DCS Lab.
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default HomePage;