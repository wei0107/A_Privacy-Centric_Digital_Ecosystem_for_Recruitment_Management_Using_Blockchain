// routes/interviewRoutes.js
const express = require('express');
const ctrl = require('../controllers/interviewController');
const router = express.Router();

router.post('/', ctrl.createInterview);             // POST  /interview
router.delete('/:interviewId', ctrl.deleteInterview); // DELETE /interview/:interviewId
router.patch('/:interviewId/start', ctrl.updateInterviewResultStart);
router.patch('/:interviewId/finish', ctrl.updateInterviewResultFinish);
router.patch('/:interviewId/seeker/start', ctrl.seekerConfirmOnchainStart);
router.patch('/:interviewId/seeker/finish', ctrl.seekerConfirmOnchainFinish);
router.get('/company/:address', ctrl.listInterviewsByCompany);
router.get('/seeker/:address',  ctrl.listInterviewsBySeeker);
router.post('/createArbitration', ctrl.createInterviewDispute);

module.exports = router;
