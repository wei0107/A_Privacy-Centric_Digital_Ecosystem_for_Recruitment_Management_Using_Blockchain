import { useState } from 'react';
import { 
  Box, Button, Typography, Paper, TextField, MenuItem, 
  Container, Avatar, Divider, Stack, IconButton, CircularProgress, 
  Chip 
} from '@mui/material';
import { 
  Fingerprint as DidIcon, 
  Wallet as WalletIcon, 
  CloudUpload as UploadIcon,
  CheckCircle as CheckIcon 
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import axios from 'axios';
import { encryptForMetaMask } from '../../utils/encryption';

function RegisterDIDPage() {
  const [account, setAccount] = useState(null);
  const [id, setId] = useState('');
  const [type, setType] = useState('jobseeker');
  const [csrFile, setCsrFile] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        console.error('User rejected wallet connection:', error);
      }
    } else {
      alert('Please install MetaMask!');
    }
  };

  const handleRegister = async () => {
    if (!account || !id || !csrFile || !keyFile) {
      alert('Please fill in all details and select both CSR and Private Key files.');
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const message = `Register DID for ${account}`;
      const messageHash = ethers.hashMessage(message);
      const signatureFlat = await signer.signMessage(message);
      const sigSplit = ethers.Signature.from(signatureFlat);
      const { v, r, s } = sigSplit;

      const encryptionPublicKey = await window.ethereum.request({
        method: 'eth_getEncryptionPublicKey',
        params: [account],
      });

      const csrText = await csrFile.text();
      const keyText = await keyFile.text();

      const encryptedCSRObj = await encryptForMetaMask(encryptionPublicKey, csrText);
      const encryptedKEYObj = await encryptForMetaMask(encryptionPublicKey, keyText);

      const res = await axios.post('http://localhost:3000/auth/registerDID', {
        id,
        address: account,
        type,
        signature: { messageHash, v, r, s },
        encrypted_CSR: JSON.stringify(encryptedCSRObj),
        encrypted_KEY: JSON.stringify(encryptedKEYObj),
      });

      alert('DID Registration Successful!');
      navigate('/');
    } catch (err) {
      console.error('❌ Registration failed:', err);
      alert('Registration failed! Please check console.');
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
          {/* Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Avatar 
              sx={{ 
                width: 60, height: 60, 
                bgcolor: account ? 'success.main' : 'primary.main', 
                mb: 2, 
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
              }}
            >
              <DidIcon sx={{ fontSize: 35 }} />
            </Avatar>
            <Typography variant="h4" fontWeight={900} color="text.primary">
              Register DID
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Secure Identity for Blockchain Verification
            </Typography>
          </Box>

          <Divider sx={{ mb: 4 }} />

          {!account ? (
            <Stack spacing={3}>
              <Typography variant="body2" color="text.secondary">
                Please connect your wallet to start the registration.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<WalletIcon />}
                onClick={connectWallet}
                sx={{
                  py: 1.8,
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: 'none',
                }}
              >
                Connect To Wallet
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Connected Wallet
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Chip 
                    label={formatAddress(account)} 
                    color="success" 
                    variant="outlined" 
                    sx={{ fontWeight: 600, fontFamily: 'monospace' }}
                  />
                </Box>
              </Box>

              <TextField
                fullWidth
                label="User ID"
                placeholder="Enter unique ID"
                value={id}
                onChange={(e) => setId(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              />

              <TextField
                fullWidth
                select
                label="Account Type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
              >
                <MenuItem value="jobseeker">Jobseeker</MenuItem>
                <MenuItem value="enterprise">Enterprise</MenuItem>
              </TextField>

              {/* ✅ 優化的檔案上傳區域 */}
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, ml: 1 }}>
                  CRYPTO ASSETS (CSR & KEY)
                </Typography>
                
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {/* CSR Button */}
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={csrFile ? <CheckIcon /> : <UploadIcon />}
                    color={csrFile ? "success" : "primary"}
                    sx={{ borderRadius: 2, textTransform: 'none', justifyContent: 'flex-start' }}
                  >
                    {csrFile ? csrFile.name : "Upload CSR File"}
                    <input type="file" hidden accept=".csr,.pem,.txt" onChange={(e) => setCsrFile(e.target.files?.[0] ?? null)} />
                  </Button>

                  {/* Private Key Button */}
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={keyFile ? <CheckIcon /> : <UploadIcon />}
                    color={keyFile ? "success" : "primary"}
                    sx={{ borderRadius: 2, textTransform: 'none', justifyContent: 'flex-start' }}
                  >
                    {keyFile ? keyFile.name : "Upload Private Key"}
                    <input type="file" hidden accept=".pem,.key,.txt" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} />
                  </Button>
                </Stack>
              </Box>

              <Button
                variant="contained"
                size="large"
                onClick={handleRegister}
                disabled={loading}
                sx={{
                  py: 1.8,
                  mt: 1,
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Complete Registration'}
              </Button>

              <Button 
                variant="text" 
                color="inherit" 
                onClick={() => navigate('/')}
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

export default RegisterDIDPage;