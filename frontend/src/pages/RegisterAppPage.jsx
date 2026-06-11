import { useState, useEffect } from 'react';
import { 
  Box, Button, Typography, Paper, FormControl, InputLabel, 
  Select, MenuItem, Container, Avatar, Divider, Stack, 
  CircularProgress, Chip 
} from '@mui/material';
import { 
  Hub as AppChainIcon, 
  Wallet as WalletIcon, 
  FactCheck as VerifyIcon 
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import axios from 'axios';
import { decryptWithMetaMask } from '../../utils/encryption';
import { encrypt } from '@metamask/eth-sig-util';

// 讀取政府 x25519 public key (base64)
let orgX25519PubKeyBase64 = '';

async function loadOrgX25519PubKey() {
  const res = await fetch('/org_x25519_pubkey.json');
  const json = await res.json();
  if (!json?.x25519_pubkey_base64) {
    throw new Error('Missing x25519_pubkey_base64 in /org_x25519_pubkey.json');
  }
  return json.x25519_pubkey_base64;
}

function encryptWithOrgX25519PublicKey(pubKeyBase64, plaintext) {
  const encryptedObj = encrypt({
    publicKey: pubKeyBase64,
    data: plaintext,
    version: 'x25519-xsalsa20-poly1305',
  });
  return JSON.stringify(encryptedObj);
}

function RegisterAppPage() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userType, setUserType] = useState('1'); 
  const navigate = useNavigate();

  // ✅ 地址縮寫函數
  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  useEffect(() => {
    async function init() {
      try {
        orgX25519PubKeyBase64 = await loadOrgX25519PubKey();
        if (window.ethereum) {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            setAccount(accounts[0]);
          }
        } else {
          alert('Please install MetaMask wallet!');
        }
      } catch (err) {
        console.error('❌ Init Failed:', err);
      }
    }
    init();
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) return alert('Please install MetaMask!');
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
    } catch (error) {
      console.error('User rejected wallet connection:', error);
    }
  };

  const handleRegisterApp = async () => {
    if (!account) return alert('Please connect wallet.');
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const message = `Get CSR for ${account}`;
      const messageHash = ethers.hashMessage(message);
      const signatureFlat = await signer.signMessage(message);
      const sigSplit = ethers.Signature.from(signatureFlat);
      const { v, r, s } = sigSplit;

      const csrRes = await axios.post('http://localhost:3000/auth/getEncryptedCSR', {
        address: account,
        signature: { messageHash, v, r, s }
      });

      const csrPlain = await decryptWithMetaMask(csrRes.data.encryptedCSR, account);
      let csrToSend = csrPlain;
      try {
        const parsed = JSON.parse(csrPlain);
        csrToSend = typeof parsed === 'string' ? parsed : csrPlain;
      } catch {}

      const encryptedCSRForOrg = encryptWithOrgX25519PublicKey(orgX25519PubKeyBase64, csrToSend);
      const submitMessage = `Submit RegisterApp for ${account}`;
      const submitSignature = await signer.signMessage(submitMessage);

      await axios.post('http://localhost:3000/auth/registerApp', {
        address: account,
        encryptedCSR: encryptedCSRForOrg,
        signature: { flat: submitSignature },
        type: userType
      });

      alert('App Registration Successful!');
      navigate('/login');
    } catch (err) {
      console.error('❌ Register App Failed:', err);
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
          {/* Header Section */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Avatar 
              sx={{ 
                width: 60, height: 60, 
                bgcolor: account ? 'success.main' : 'primary.main', 
                mb: 2, 
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
              }}
            >
              <AppChainIcon sx={{ fontSize: 35 }} />
            </Avatar>
            <Typography variant="h4" fontWeight={900} color="text.primary">
              Register APP
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Cross-Chain Application Identity Setup
            </Typography>
          </Box>

          <Divider sx={{ mb: 4 }} />

          {!account ? (
            <Stack spacing={3}>
              <Typography variant="body2" color="text.secondary">
                Please connect your MetaMask wallet to initialize the app-chain registration.
              </Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<WalletIcon />}
                onClick={connectWallet}
                sx={{ py: 1.8, borderRadius: 3, fontWeight: 700, textTransform: 'none' }}
              >
                Connect To Wallet
              </Button>
            </Stack>
          ) : (
            <Stack spacing={3}>
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  Identity Verified
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

              <FormControl fullWidth variant="outlined">
                <InputLabel id="user-type-label">Role Type</InputLabel>
                <Select
                  labelId="user-type-label"
                  value={userType}
                  label="Role Type"
                  onChange={(e) => setUserType(e.target.value)}
                  sx={{ borderRadius: 3 }}
                >
                  <MenuItem value="1">Job Seeker</MenuItem>
                  <MenuItem value="2">Enterprise</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <VerifyIcon />}
                onClick={handleRegisterApp}
                disabled={loading}
                sx={{
                  py: 1.8,
                  borderRadius: 3,
                  fontWeight: 700,
                  textTransform: 'none',
                  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                }}
              >
                {loading ? 'Processing CSR...' : 'Initialize Registration'}
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

export default RegisterAppPage;