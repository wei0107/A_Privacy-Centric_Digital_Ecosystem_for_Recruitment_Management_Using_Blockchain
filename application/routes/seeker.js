const express = require('express');
const router = express.Router();
const { uploadResume, getResume, updateResume, deleteResume, upsertRequest, getRequest, deleteRequest, getEncryptedProfile, setEncryptedProfileStart, setEncryptedProfileFinish, getAllJobs, getInvitationsForSeeker, updateInvitationStatus, applyJob,  setAccessConfigStart, setAccessConfigFinish} = require('../controllers/seekerController');

// === 求職者履歷 API ===
router.post('/uploadResume', uploadResume);
router.get('/getResume', getResume);
router.put('/updateResume', updateResume);
router.delete('/deleteResume', deleteResume);
router.post('/setAccessConfig/start', setAccessConfigStart);
router.post('/setAccessConfig/finish', setAccessConfigFinish);

// === 求職者需求單 API ===
router.post('/upsertrequest', upsertRequest);
router.get('/getRequest', getRequest);
router.delete('/deleteRequest', deleteRequest);

// === 求職者個人資料 API ===
router.get('/getProfile', getEncryptedProfile);
router.put('/updateProfile/start', setEncryptedProfileStart);
router.put('/updateProfile/finish', setEncryptedProfileFinish);

// === 求職者工作列表 API ===
router.get('/getJobs', getAllJobs);

// === 求職者邀請 API ===
router.get('/getInvitations', getInvitationsForSeeker);

// 更新邀請狀態
router.post('/updateInvitationStatus', updateInvitationStatus);

// 求職者申請工作
router.post('/applyJob', applyJob);

module.exports = router;