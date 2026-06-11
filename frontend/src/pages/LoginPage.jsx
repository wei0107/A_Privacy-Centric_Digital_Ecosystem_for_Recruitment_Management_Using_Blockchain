import { useState, useEffect } from 'react';
import { 
  Box, Button, Typography, Paper, FormControl, 
  InputLabel, Select, MenuItem, Stack, Container, 
  Avatar, Divider, CircularProgress, Chip 
} from '@mui/material';
import { 
  AccountBalanceWallet as WalletIcon, 
  Login as LoginIcon,
  VerifiedUser as VerifiedIcon 
} from '@mui/icons-material';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function LoginPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [loginType, setLoginType] = useState('');
  const [loading, setLoading] = useState(false);

  // ✅ 地址縮寫函數
  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]);
      } catch (error) {
        console.error('User denied wallet connection:', error);
      }
    } else {
      alert('Please install MetaMask extension first!');
    }
  };

  const handleLogin = async () => {
    if (!account || !loginType) {
      alert('Please connect wallet and select account type');
      return;
    }

    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const loginMessage = `Login request for ${account}`;
      const loginSignatureFlat = await signer.signMessage(loginMessage);
      const loginSignature = ethers.Signature.from(loginSignatureFlat);
      const loginHash = ethers.hashMessage(loginMessage);

      const signaturePayload = {
        messageHash: loginHash,
        v: loginSignature.v,
        r: loginSignature.r,
        s: loginSignature.s
      };

      const loginRes = await axios.post('http://localhost:3000/auth/login', {
        address: account,
        signature: { flat: loginSignatureFlat },
        type: loginType
      }, { withCredentials: true });

      if (!loginRes.data.success) {
        alert('Login failed, please check wallet or identity');
        setLoading(false);
        return;
      }

      const role = loginRes.data.role;

      sessionStorage.setItem('address', account);
      sessionStorage.setItem('loginType', role);
      sessionStorage.setItem('userId', account);

      if (role !== 'government') {
        const csrRes = await axios.post('http://localhost:3000/auth/getEncryptedCSR', {
          address: account,
          signature: signaturePayload
        });

        const appKeyRes = await axios.post('http://localhost:3000/auth/getEncryptedAppKey', {
          address: account,
          signature: signaturePayload
        });

        sessionStorage.setItem('encryptedCSR', csrRes.data.encryptedCSR);
        sessionStorage.setItem('encryptedAppKey', appKeyRes.data.encryptedAppKey);
      }

      if (role === 'government') {
        navigate('/government/home');
      } else if (role === 'jobseeker') {
        navigate('/seeker/home');
      } else if (role === 'enterprise') {
        navigate('/company/home');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      alert('Login process failed, please try again later');
    } finally {
      setLoading(false);
    }
  };

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
      <Container maxWidth="xs">
        <Paper
          elevation={10}
          sx={{
            p: { xs: 4, md: 5 },
            borderRadius: 5,
            textAlign: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Header Section */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
            <Avatar 
              sx={{ 
                width: 60, height: 60, 
                bgcolor: account ? 'success.main' : 'primary.main', 
                mb: 2, 
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
              }}
            >
              {account ? <VerifiedIcon sx={{ fontSize: 35 }} /> : <WalletIcon sx={{ fontSize: 35 }} />}
            </Avatar>
            <Typography variant="h4" fontWeight={900} color="text.primary">
              Portal Login
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Secure Authentication via Blockchain
            </Typography>
          </Box>

          <Divider sx={{ mb: 4 }} />

          {!account ? (
            /* 第一階段：連接錢包 */
            <Stack spacing={3}>
              <Typography variant="body1" color="text.secondary">
                Please connect your MetaMask wallet to proceed with authentication.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<WalletIcon />}
                onClick={connectWallet}
                sx={{
                  py: 1.8,
                  borderRadius: 3,
                  fontSize: '1rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                }}
              >
                Connect To Wallet
              </Button>
            </Stack>
          ) : (
            /* 第二階段：選擇類型並登入 */
            <Stack spacing={3}>
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', fontWeight: 700 }}>
                  Connected Wallet
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Chip 
                    label={formatAddress(account)} 
                    color="success" 
                    variant="outlined" 
                    onDelete={() => setAccount(null)}
                    sx={{ fontWeight: 600, fontFamily: 'monospace' }}
                  />
                </Box>
              </Box>

              <FormControl fullWidth variant="outlined">
                <InputLabel id="login-type-label">Select Identity Type</InputLabel>
                <Select
                  labelId="login-type-label"
                  value={loginType}
                  label="Select Identity Type"
                  onChange={(e) => setLoginType(e.target.value)}
                  sx={{ borderRadius: 2 }}
                >
                  <MenuItem value="jobseeker">Jobseeker</MenuItem>
                  <MenuItem value="enterprise">Enterprise</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <LoginIcon />}
                onClick={handleLogin}
                disabled={loading || !loginType}
                sx={{
                  py: 1.8,
                  borderRadius: 3,
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                }}
              >
                {loading ? 'Authenticating...' : 'Sign In Now'}
              </Button>
              
              <Button 
                variant="text" 
                color="inherit" 
                size="small"
                onClick={() => navigate('/')}
                disabled={loading}
                sx={{ textTransform: 'none', color: 'text.disabled' }}
              >
                Back to Home
              </Button>
            </Stack>
          )}
        </Paper>
      </Container>
    </Box>
  );
}

export default LoginPage;