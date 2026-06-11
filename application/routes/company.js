const express = require('express');
const router = express.Router();
const enterpriseController = require('../controllers/companyController');

// 查詢該公司所有職缺
router.get('/get-requests', enterpriseController.getCompanyRequestsByAddress);

// 查詢單一職缺
router.get('/get-request', enterpriseController.getCompanyRequest);

// 新增或更新職缺
router.post('/upsert-request', enterpriseController.upsertCompanyRequest);

// 刪除職缺
router.delete('/delete-request', enterpriseController.deleteCompanyRequest);

router.get('/get-resume', enterpriseController.getResumeByAddress);

router.get('/get-all-seekers', enterpriseController.getAllSeekers);

router.post('/send-invite', enterpriseController.sendInvitation);

router.get('/get-invitations', enterpriseController.getInvitationsForJob);

router.get('/applies', enterpriseController.getAppliesByJobId);

module.exports = router;
