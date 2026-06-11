import {
  Box, Typography, TextField, Button, Stack, Paper, Snackbar, Alert,
  Chip, IconButton, Switch, FormControlLabel, Container, Divider, InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Work as WorkIcon,
  School as SchoolIcon,
  AccountTree as ProjectIcon,
  Psychology as SkillIcon,
  Badge as SummaryIcon,
  Save as SaveIcon,
  Public as PublicIcon,
  Lock as PrivateIcon
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import useAuthGuard from '../hooks/useAuthGuard';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { decryptWithMetaMask } from '../../utils/encryption';
import { keccak256, toUtf8Bytes, getBytes, toUtf8String } from "ethers";
import { p256 } from '@noble/curves/p256';

const API_BASE = 'http://localhost:3000';

// ... (helpers 保持不變: extractVisibility, pkcs8PemToP256Scalar, signBytesWithScalarToDerB64 等)
function extractVisibility(accessObj = {}) {
  return {
    summary: accessObj.summary ?? false,
    skills: accessObj.skills ?? false,
    experience: accessObj.experience ?? false,
    education: accessObj.education ?? false,
    project: accessObj.project ?? false,
  };
}

const b64ToU8 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const pemToDer = (pem) => {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
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
const pkcs8PemToP256Scalar = async (pkcs8Pem) => {
  const keyData = pemToDer(pkcs8Pem);
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", cryptoKey);
  const dBytes = b64urlToBytes(jwk.d);
  if (dBytes.length === 32) return dBytes;
  const out = new Uint8Array(32);
  out.set(dBytes.slice(-32), 32 - Math.min(32, dBytes.length));
  return out;
};
const getAddressOrThrow = () => {
  const address = sessionStorage.getItem('address');
  if (!address) throw new Error('Not logged in, please login again');
  return address.toLowerCase();
};
const getAppKeyScalarOrThrow = async (address) => {
  const encryptedAppKey = sessionStorage.getItem("encryptedAppKey");
  if (!encryptedAppKey) throw new Error("EncryptedAppKey not found");
  const decryptedRaw = (await decryptWithMetaMask(encryptedAppKey, address))?.trim?.() ?? "";
  const text = decryptedRaw.startsWith("0x") ? toUtf8String(getBytes(decryptedRaw)).trim() : decryptedRaw;
  if (!text.includes("BEGIN PRIVATE KEY")) throw new Error("Invalid AppKey format");
  return await pkcs8PemToP256Scalar(text);
};
const signBytesWithScalarToDerB64 = async (bytesU8, dBytes) => {
  const sig = p256.sign(bytesU8, dBytes, { prehash: true });
  const derHex = sig.toDERHex();
  const clean = derHex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return btoa(String.fromCharCode(...bytes));
};
const signMessageWithMetaMask = async (address, message) => {
  const sig = await window.ethereum.request({ method: 'personal_sign', params: [message, address] });
  return { flat: sig, message };
};
const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

// ------------------------------------------------------------------------------------

function SeekerEditResumePage() {
  useAuthGuard('jobseeker');
  const navigate = useNavigate();

  const [resume, setResume] = useState({ summary: "", skills: [], experience: [], education: [], projects: [] });
  const [newSkill, setNewSkill] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [visibility, setVisibility] = useState({ summary: false, skills: false, experience: false, education: false, project: false });

  // ... (邏輯函數 handleSkillAdd, handleExperienceChange, saveAccessConfigOnChain 等保持不變)

  useEffect(() => {
    const fetchResume = async () => {
      try {
        const address = getAddressOrThrow();
        const res = await axios.get(`${API_BASE}/seeker/getResume`, { params: { address }, withCredentials: true });
        if (res.data.success) {
          setResume(res.data.resume);
          setVisibility(extractVisibility(res.data?.access?.visibleFields || {}));
          setIsEditing(true);
        }
      } catch (err) {
        if (err.response && err.response.status === 404) {
          setVisibility(extractVisibility());
          setIsEditing(false);
        }
      }
    };
    fetchResume();
  }, []);

  const toggleVisibility = (section) => setVisibility(prev => ({ ...prev, [section]: !prev[section] }));
  const handleSkillAdd = () => {
    const skill = newSkill.trim();
    if (skill && !resume.skills.includes(skill)) {
      setResume({ ...resume, skills: [...resume.skills, skill] });
      setNewSkill('');
    }
  };
  const handleSkillDelete = (skillToDelete) => setResume({ ...resume, skills: resume.skills.filter(skill => skill !== skillToDelete) });
  const handleFieldChange = (field, value) => setResume({ ...resume, [field]: value });
  const handleExperienceChange = (index, field, value) => {
    const newExp = [...resume.experience];
    newExp[index][field] = value;
    setResume({ ...resume, experience: newExp });
  };
  const handleAddExperience = () => setResume({ ...resume, experience: [...resume.experience, { company: '', position: '', start: '', end: '', description: '' }] });
  const handleDeleteExperience = (index) => setResume({ ...resume, experience: resume.experience.filter((_, idx) => idx !== index) });
  const handleEducationChange = (index, field, value) => {
    const newEdu = [...resume.education];
    newEdu[index][field] = value;
    setResume({ ...resume, education: newEdu });
  };
  const handleAddEducation = () => setResume({ ...resume, education: [...resume.education, { school: '', degree: '', start: '', end: '' }] });
  const handleDeleteEducation = (index) => setResume({ ...resume, education: resume.education.filter((_, idx) => idx !== index) });
  const handleProjectChange = (index, field, value) => {
    const newProjects = [...resume.projects];
    newProjects[index][field] = value;
    setResume({ ...resume, projects: newProjects });
  };
  const handleAddProject = () => setResume({ ...resume, projects: [...resume.projects, { title: '', role: '', tech: '', description: '', start: '', end: '', outcome: '' }] });
  const handleDeleteProject = (index) => setResume({ ...resume, projects: resume.projects.filter((_, idx) => idx !== index) });

  const saveAccessConfigOnChain = async (address, accessConfigObj) => {
    const ts = Date.now();
    const accessCanonical = stableStringify(accessConfigObj);
    const accessHash = keccak256(toUtf8Bytes(accessCanonical));
    const signature = await signMessageWithMetaMask(address, `SetAccessConfig(start) for ${address} accessHash=${accessHash} ts=${ts}`);
    const startRes = await axios.post(`${API_BASE}/seeker/setAccessConfig/start`, { address, accessConfig: accessConfigObj, ts, signature }, { withCredentials: true });
    const { token, proposalBytesB64 } = startRes.data;
    const appKeyDBytes = await getAppKeyScalarOrThrow(address);
    const endorsementSignatureDerB64 = await signBytesWithScalarToDerB64(b64ToU8(proposalBytesB64), appKeyDBytes);
    const finish1 = await axios.post(`${API_BASE}/seeker/setAccessConfig/finish`, { address, token, endorsementSignatureDerB64 }, { withCredentials: true });
    const commitSignatureDerB64 = await signBytesWithScalarToDerB64(b64ToU8(finish1.data.commitBytesB64), appKeyDBytes);
    await axios.post(`${API_BASE}/seeker/setAccessConfig/finish`, { address, token, endorsementSignatureDerB64, commitSignatureDerB64 }, { withCredentials: true });
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const address = getAddressOrThrow();
      const ts = Date.now();
      const resumeHash = keccak256(toUtf8Bytes(stableStringify(resume)));
      const opMessage = isEditing ? `UpdateResume for ${address} resumeHash=${resumeHash} ts=${ts}` : `UploadResume for ${address} resumeHash=${resumeHash} ts=${ts}`;
      const signature = await signMessageWithMetaMask(address, opMessage);
      if (isEditing) {
        await axios.put(`${API_BASE}/seeker/updateResume`, { address, newResume: resume, ts, signature }, { withCredentials: true });
      } else {
        await axios.post(`${API_BASE}/seeker/uploadResume`, { address, resume, ts, signature }, { withCredentials: true });
        setIsEditing(true);
      }
      await saveAccessConfigOnChain(address, { visibleFields: visibility });
      // ✅ 先顯示成功提示
      setSnackbarOpen(true);

      // ✅ 停頓 1.5 秒後再跳轉，讓使用者看清提示
      setTimeout(() => {
        navigate('/seeker/home');
      }, 1500);
    } catch (err) {
      alert(err?.message || 'Submission failed');
    }
  };

  const handleDeleteResume = async () => {
    if (!window.confirm('Are you sure you want to delete your resume? This cannot be undone.')) return;
    try {
      const address = getAddressOrThrow();
      const ts = Date.now();
      const signature = await signMessageWithMetaMask(address, `DeleteResume for ${address} ts=${ts}`);
      await axios.delete(`${API_BASE}/seeker/deleteResume`, { data: { address, ts, signature }, withCredentials: true });
      setResume({ summary: "", skills: [], experience: [], education: [], projects: [] });
      setIsEditing(false);
      // ✅ 顯示成功提示
      setSnackbarOpen(true);

      // ✅ 停頓 1.5 秒後再跳轉
      setTimeout(() => {
        navigate('/seeker/home');
      }, 1500);
    } catch (err) {
      alert(err?.message || 'Delete failed');
    }
  };

  // 輔助組件：區段標題與權限開關
  const SectionHeader = ({ title, icon: Icon, visibilityKey, label }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, mt: 4 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Icon color="primary" />
        <Typography variant="h6" fontWeight={700}>{label}</Typography>
      </Stack>
      <FormControlLabel
        control={
          <Switch 
            checked={visibility[visibilityKey]} 
            onChange={() => toggleVisibility(visibilityKey)} 
            color="success"
            icon={<PrivateIcon sx={{ fontSize: 18, p: 0.2, bgcolor: '#ddd', borderRadius: '50%' }} />}
            checkedIcon={<PublicIcon sx={{ fontSize: 18, p: 0.2, bgcolor: '#fff', borderRadius: '50%' }} />}
          />
        }
        label={visibility[visibilityKey] ? "Public" : "Private"}
        sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.8rem', fontWeight: 600, color: 'text.secondary' } }}
      />
    </Box>
  );

  return (
    <Box
      sx={{
        width: '100vw',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        pt: '100px',
        pb: '80px',
        p: 2
      }}
    >
      <Container maxWidth="md">
        <Paper
          elevation={10}
          sx={{
            p: { xs: 3, md: 6 },
            borderRadius: 5,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 5 }}>
            <Typography variant="h3" fontWeight={900} color="text.primary">
              {isEditing ? "Edit Resume" : "Create Resume"}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Build your decentralized professional identity
            </Typography>
          </Box>

          <Stack spacing={4} component="form" onSubmit={handleSubmit}>
            
            {/* 工作經歷 */}
            <Box>
              <SectionHeader label="Experience" icon={WorkIcon} visibilityKey="experience" />
              <Stack spacing={3}>
                {resume.experience.map((exp, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.01)' }}>
                    <Stack spacing={2}>
                      <TextField label="Company" value={exp.company} onChange={(e) => handleExperienceChange(idx, 'company', e.target.value)} fullWidth />
                      <TextField label="Position" value={exp.position} onChange={(e) => handleExperienceChange(idx, 'position', e.target.value)} fullWidth />
                      <Stack direction="row" spacing={2}>
                        <TextField label="Start" type="date" value={exp.start} onChange={(e) => handleExperienceChange(idx, 'start', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                        <TextField label="End" type="date" value={exp.end} onChange={(e) => handleExperienceChange(idx, 'end', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                      </Stack>
                      <TextField label="Description" value={exp.description} onChange={(e) => handleExperienceChange(idx, 'description', e.target.value)} fullWidth multiline rows={2} />
                      <Button variant="text" color="error" size="small" onClick={() => handleDeleteExperience(idx)} startIcon={<DeleteIcon />} sx={{ alignSelf: 'flex-end' }}>Remove</Button>
                    </Stack>
                  </Paper>
                ))}
                <Button onClick={handleAddExperience} startIcon={<AddIcon />} variant="outlined" fullWidth sx={{ borderStyle: 'dashed', py: 1.5 }}>
                  Add Experience
                </Button>
              </Stack>
            </Box>

            <Divider />

            {/* 教育背景 */}
            <Box>
              <SectionHeader label="Education" icon={SchoolIcon} visibilityKey="education" />
              <Stack spacing={3}>
                {resume.education.map((edu, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.01)' }}>
                    <Stack spacing={2}>
                      <TextField label="School" value={edu.school} onChange={(e) => handleEducationChange(idx, 'school', e.target.value)} fullWidth />
                      <TextField label="Degree" value={edu.degree} onChange={(e) => handleEducationChange(idx, 'degree', e.target.value)} fullWidth />
                      <Stack direction="row" spacing={2}>
                        <TextField label="Start" type="date" value={edu.start} onChange={(e) => handleEducationChange(idx, 'start', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                        <TextField label="End" type="date" value={edu.end} onChange={(e) => handleEducationChange(idx, 'end', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                      </Stack>
                      <Button variant="text" color="error" size="small" onClick={() => handleDeleteEducation(idx)} startIcon={<DeleteIcon />} sx={{ alignSelf: 'flex-end' }}>Remove</Button>
                    </Stack>
                  </Paper>
                ))}
                <Button onClick={handleAddEducation} startIcon={<AddIcon />} variant="outlined" fullWidth sx={{ borderStyle: 'dashed', py: 1.5 }}>
                  Add Education
                </Button>
              </Stack>
            </Box>

            <Divider />

            {/* 專案經驗 */}
            <Box>
              <SectionHeader label="Projects" icon={ProjectIcon} visibilityKey="project" />
              <Stack spacing={3}>
                {resume.projects.map((project, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 3, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.01)' }}>
                    <Stack spacing={2}>
                      <TextField label="Project Title" value={project.title} onChange={(e) => handleProjectChange(idx, 'title', e.target.value)} fullWidth />
                      <TextField label="Role" value={project.role} onChange={(e) => handleProjectChange(idx, 'role', e.target.value)} fullWidth />
                      <TextField label="Technologies" value={project.tech} onChange={(e) => handleProjectChange(idx, 'tech', e.target.value)} fullWidth />
                      <TextField label="Description" value={project.description} onChange={(e) => handleProjectChange(idx, 'description', e.target.value)} fullWidth multiline rows={2} />
                      <Stack direction="row" spacing={2}>
                        <TextField label="Start" type="date" value={project.start} onChange={(e) => handleProjectChange(idx, 'start', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                        <TextField label="End" type="date" value={project.end} onChange={(e) => handleProjectChange(idx, 'end', e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                      </Stack>
                      <TextField label="Outcome" value={project.outcome} onChange={(e) => handleProjectChange(idx, 'outcome', e.target.value)} fullWidth />
                      <Button variant="text" color="error" size="small" onClick={() => handleDeleteProject(idx)} startIcon={<DeleteIcon />} sx={{ alignSelf: 'flex-end' }}>Remove</Button>
                    </Stack>
                  </Paper>
                ))}
                <Button onClick={handleAddProject} startIcon={<AddIcon />} variant="outlined" fullWidth sx={{ borderStyle: 'dashed', py: 1.5 }}>
                  Add Project
                </Button>
              </Stack>
            </Box>

            <Divider />

            {/* 技能 */}
            <Box>
              <SectionHeader label="Skills" icon={SkillIcon} visibilityKey="skills" />
              <Box sx={{ p: 3, bgcolor: 'rgba(0,0,0,0.02)', borderRadius: 3 }}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2, gap: 1 }}>
                  {resume.skills.map((skill, idx) => (
                    <Chip key={idx} label={skill} onDelete={() => handleSkillDelete(skill)} color="primary" sx={{ fontWeight: 600 }} />
                  ))}
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Add New Skill"
                    size="small"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSkillAdd(); } }}
                    fullWidth
                  />
                  <IconButton onClick={handleSkillAdd} color="primary" sx={{ bgcolor: 'rgba(25, 118, 210, 0.1)' }}><AddIcon /></IconButton>
                </Stack>
              </Box>
            </Box>

            {/* 自我介紹 */}
            <Box>
              <SectionHeader label="Professional Summary" icon={SummaryIcon} visibilityKey="summary" />
              <TextField
                placeholder="Write a brief overview of your career and goals..."
                value={resume.summary}
                onChange={(e) => handleFieldChange('summary', e.target.value)}
                fullWidth
                multiline
                rows={4}
                sx={{ bgcolor: 'rgba(0,0,0,0.01)' }}
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* 操作按鈕 */}
            <Stack spacing={2}>
              <Button 
                variant="contained" 
                type="submit" 
                size="large" 
                startIcon={<SaveIcon />}
                sx={{ 
                  py: 1.8, 
                  borderRadius: 3, 
                  fontWeight: 700, 
                  fontSize: '1.1rem',
                  boxShadow: '0 4px 14px rgba(25, 118, 210, 0.3)',
                  textTransform: 'none'
                }}
              >
                Save & Update Resume
              </Button>
              
              {isEditing && (
                <Button 
                  variant="text" 
                  color="error" 
                  onClick={handleDeleteResume} 
                  startIcon={<DeleteIcon />}
                  sx={{ fontWeight: 600, textTransform: 'none' }}
                >
                  Delete Resume
                </Button>
              )}
            </Stack>
          </Stack>
        </Paper>
      </Container>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="success" variant="filled" sx={{ width: '100%', borderRadius: 2 }}>
          Resume successfully updated on-chain!
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default SeekerEditResumePage;