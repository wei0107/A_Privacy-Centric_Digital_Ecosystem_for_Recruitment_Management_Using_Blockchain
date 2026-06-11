import { useEffect, useState } from 'react';
import { 
  Box, Paper, Typography, TextField, Button, Snackbar, 
  Alert, Stack, CircularProgress, InputAdornment, Container 
} from '@mui/material';
import { 
  Person as PersonIcon, 
  Phone as PhoneIcon, 
  Email as EmailIcon,
  Save as SaveIcon 
} from '@mui/icons-material';
import axios from 'axios';
import useAuthGuard from '../hooks/useAuthGuard';
import { decryptWithMetaMask, encryptForMetaMask } from '../../utils/encryption';
import { useNavigate } from 'react-router-dom';
import { keccak256, toUtf8Bytes, getBytes, toUtf8String } from "ethers";
import { p256 } from '@noble/curves/p256';

const API_BASE = 'http://localhost:3000';

function SeekerEditProfile() {
  useAuthGuard('jobseeker');
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    name: '',
    phone: '',
    email: '',
  });

  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  // =========================
  // Helpers
  // =========================

  // 1) 取得 Ethereum address（你原本就是放 sessionStorage）
  const getAddressOrThrow = () => {
    const address = sessionStorage.getItem('address');
    if (!address) throw new Error('Can not find address in sessionStorage. Please log in again.');
    return address.toLowerCase();
  };

  // 2) 用 MetaMask 解密 sessionStorage 的 encryptedAppKey → 得到 JWK (EC P-256 private key)
  const pemToDer = (pem) => {
    const b64 = pem
      .replace(/-----BEGIN [^-]+-----/g, "")
      .replace(/-----END [^-]+-----/g, "")
      .replace(/\s+/g, "");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  };
  
  const b64urlToBytes = (b64url) => {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const b64ToU8 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  // PKCS8 PEM -> WebCrypto -> export JWK -> dBytes(32)
  const pkcs8PemToP256Scalar = async (pkcs8Pem) => {
    const keyData = pemToDer(pkcs8Pem);
  
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );
  
    const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
    if (!jwk?.d) throw new Error("exported JWK missing d");
  
    const dBytes = b64urlToBytes(jwk.d);
  
    // normalize to 32 bytes
    if (dBytes.length === 32) return dBytes;
    const out = new Uint8Array(32);
    out.set(dBytes.slice(-32), 32 - Math.min(32, dBytes.length));
    return out;
  };
  
  // 回傳 private scalar dBytes (Uint8Array length 32)
  const getAppKeyScalarOrThrow = async (address) => {
    const encryptedAppKey = sessionStorage.getItem("encryptedAppKey");
    if (!encryptedAppKey) throw new Error("Can not find encryptedAppKey in sessionStorage. Please log in again.");
  
    const decryptedRaw = (await decryptWithMetaMask(encryptedAppKey, address))?.trim?.() ?? "";
  
    // 兼容：有些流程可能存成 0xhex 的 JSON/PEM
    const text = decryptedRaw.startsWith("0x")
      ? toUtf8String(getBytes(decryptedRaw)).trim()
      : decryptedRaw;
  
    if (!text.includes("BEGIN PRIVATE KEY")) {
      console.error("[getAppKeyScalarOrThrow] decrypted text:", text);
      // throw new Error("AppKey 解密後不是 PKCS8（BEGIN PRIVATE KEY）。請改用 PKCS8 私鑰再存入 encryptedAppKey。");
      throw new Error("Decrypted AppKey is not in PKCS8 format (missing BEGIN PRIVATE KEY).");
    }
  
    return await pkcs8PemToP256Scalar(text);
  };

  // 3) 用 MetaMask 對「start message」簽名（回 signature.flat）
  const signStartMessageWithMetaMask = async (address, ciphertext) => {
    if (!window.ethereum) throw new Error("MetaMask not installed");
  
    // ✅ 一律用 ethers 計算 keccak256（不要再碰 window.web3）
    const ciphertextHash = keccak256(toUtf8Bytes(ciphertext));
  
    const message = `SetEncryptedProfile(start) for ${address} ciphertextHash=${ciphertextHash}`;
  
    // 建議 address 用 checksum 或原樣也可；你這裡用 sessionStorage 存的就好
    const sig = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    });
  
    return { flat: sig, message };
  };

  // 4) 用 AppKey(JWK) 對「hashHex」做 ECDSA(P-256) 簽名，輸出 DER base64
  //    - proposalHashHex / commitHashHex 來自後端（hex 字串）
  const hexToBase64 = (hex) => {
    const clean = hex.replace(/^0x/, "");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };

  const signBytesWithScalarToDerB64 = async (bytesU8, dBytes) => {
    // ✅ 路線 1：bytes 直接簽，讓 noble 做 SHA-256
    const sig = p256.sign(bytesU8, dBytes, { prehash: true });
  
    // noble 版本相容：有的叫 toDERHex，有的叫 toDER
    if (typeof sig.toDERHex === "function") {
      const derHex = sig.toDERHex(); // "30..."
      const clean = derHex.replace(/^0x/, "");
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    }
  
    if (typeof sig.toDER === "function") {
      const der = sig.toDER(); // Uint8Array
      return btoa(String.fromCharCode(...der));
    }
  
    throw new Error("noble signature object has no DER encoder (toDERHex/toDER). Please check @noble/curves version.");
  };

  // =========================
  // Load profile (GET /getProfile)
  // =========================
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const address = getAddressOrThrow();

        const res = await axios.get(`${API_BASE}/seeker/getProfile`, {
          params: { address },
          withCredentials: true,
        });

        if (!res.data?.success) {
          // 沒資料也不一定是錯，就維持空表單
          console.log("No profile data found");
          return;
        }
        console.log("loaded profile data:", res.data);

        const ciphertextStr = res.data?.ciphertext || '';
        if (!ciphertextStr) return;

        // ciphertextStr 是 MetaMask encrypt 回傳物件的 JSON 字串（你後端就是存它）
        const decrypted = await decryptWithMetaMask(ciphertextStr, address);
        const obj = JSON.parse(decrypted);

        setProfile({
          name: obj?.name ?? '',
          phone: obj?.phone ?? '',
          email: obj?.email ?? '',
        });
      } catch (err) {
        Console.error('Load profile error:', err);
        navigate('/seeker/home');
      }
    };

    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =========================
  // Submit (2-step offline flow)
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const address = getAddressOrThrow();

      // Step A: 把 profile 用 MetaMask encryption public key 加密
      const encryptionPublicKey = await window.ethereum.request({
        method: 'eth_getEncryptionPublicKey',
        params: [address],
      });

      const encryptedProfileObj = await encryptForMetaMask(encryptionPublicKey, JSON.stringify(profile));
      const ciphertext = JSON.stringify(encryptedProfileObj);

      // Step B: 用 MetaMask 對 start message 簽名（signature.flat）
      const signature = await signStartMessageWithMetaMask(address, ciphertext);

      // Step C: /updateProfile/start → 拿 token + proposalHashHex
      const startRes = await axios.put(
        `${API_BASE}/seeker/updateProfile/start`,
        {
          address,
          ciphertext,
          signature, // { flat, message }
        },
        { withCredentials: true }
      );

      if (!startRes.data?.success) {
        throw new Error(startRes.data?.msg || 'start failed');
      }

      // Step C: /updateProfile/start → 拿 token + proposalBytesB64
      const { token, proposalBytesB64 } = startRes.data;
      if (!token || !proposalBytesB64) throw new Error('Missing token or proposalBytesB64 from start response');

      // Step D: 解密 AppKey（PKCS8 PEM → dBytes）
      const appKeyDBytes = await getAppKeyScalarOrThrow(address);
      const pub = p256.getPublicKey(appKeyDBytes, false);
      const x = pub.slice(1, 33);
      const y = pub.slice(33, 65);

      // 2) 轉成 JWK（P-256）
      const toB64Url = (u8) => btoa(String.fromCharCode(...u8))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const jwk = { kty: "EC", crv: "P-256", x: toB64Url(x), y: toB64Url(y), ext: true };

      // 3) importKey -> export spki
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
      );
      const spki = new Uint8Array(await crypto.subtle.exportKey("spki", key));

      // 4) sha256(spkiDER) 轉 hex
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", spki));
      const hex = [...hash].map(b => b.toString(16).padStart(2, "0")).join("");
      console.log("AppKey pubkey sha256(spki) =", hex);

      // Step E: 簽 proposalBytes → endorsementSignatureDerB64
      const proposalBytes = b64ToU8(proposalBytesB64);
      const endorsementSignatureDerB64 = await signBytesWithScalarToDerB64(proposalBytes, appKeyDBytes);

      // Step F: /finish（先送 endorsementSig）→ 拿 commitBytesB64
      const finish1 = await axios.put(
        `${API_BASE}/seeker/updateProfile/finish`,
        { address, token, endorsementSignatureDerB64 },
        { withCredentials: true }
      );

      if (!finish1.data?.success) {
        throw new Error(finish1.data?.msg || 'finish(endorsement) failed');
      }

      const { commitBytesB64 } = finish1.data;
      if (!commitBytesB64) throw new Error('Missing commitBytesB64 from finish(endorsement) response');

      // Step G: 簽 commitBytes → commitSignatureDerB64
      const commitBytes = b64ToU8(commitBytesB64);
      const commitSignatureDerB64 = await signBytesWithScalarToDerB64(commitBytes, appKeyDBytes);

      // Step H: /finish（送 commitSig，上鏈）
      const finish2 = await axios.put(
        `${API_BASE}/seeker/updateProfile/finish`,
        { address, token, endorsementSignatureDerB64, commitSignatureDerB64 },
        { withCredentials: true }
      );

      if (!finish2.data?.success) {
        throw new Error(finish2.data?.msg || 'finish(commit) failed');
      }

      if (!finish2.data?.success) {
        throw new Error(finish2.data?.msg || 'finish(commit) failed');
      }

      setSnackbarOpen(true);
      setTimeout(() => {
        navigate('/seeker/home');
      }, 1500); // 延遲 1.5 秒讓使用者看到成功訊息
    } catch (err) {
      console.error('Update profile failed:', err);
      alert(err?.message || 'Update profile failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0, left: 0, width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        zIndex: 1000,
        overflowY: 'auto',
        p: 2
      }}
    >
      <Container maxWidth="sm">
        <Paper 
          elevation={6} 
          sx={{ 
            p: { xs: 3, md: 5 }, 
            borderRadius: 4,
            textAlign: 'center'
          }}
        >
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 800, color: '#1a202c' }}>
            Edit Profile
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 4 }}>
            Your data will be encrypted and stored on the blockchain securely.
          </Typography>

          <form onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <TextField
                label="Full Name"
                variant="outlined"
                value={profile.name}
                onChange={(e) => handleChange('name', e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Phone Number"
                variant="outlined"
                value={profile.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PhoneIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Email Address"
                type="email"
                variant="outlined"
                value={profile.email}
                onChange={(e) => handleChange('email', e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />

              <Box sx={{ mt: 2, position: 'relative' }}>
                <Button 
                  type="submit" 
                  variant="contained" 
                  size="large"
                  disabled={loading}
                  startIcon={!loading && <SaveIcon />}
                  sx={{ 
                    py: 1.5, 
                    px: 4, 
                    borderRadius: 2,
                    fontSize: '1.1rem',
                    textTransform: 'none',
                    width: '100%',
                    boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)'
                  }}
                >
                  {loading ? 'Encrypting & Uploading...' : 'Save & Secure'}
                </Button>
                {loading && (
                  <CircularProgress
                    size={24}
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      marginTop: '-12px',
                      marginLeft: '-12px',
                    }}
                  />
                )}
              </Box>

              <Button 
                variant="text" 
                onClick={() => navigate('/seeker/home')}
                disabled={loading}
                sx={{ textTransform: 'none', color: 'text.secondary' }}
              >
                Cancel
              </Button>
            </Stack>
          </form>
        </Paper>
      </Container>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          severity="success" 
          variant="filled" 
          sx={{ width: '100%', borderRadius: 2, fontWeight: 600 }}
        >
          Success! Profile encrypted and saved.
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SeekerEditProfile;
