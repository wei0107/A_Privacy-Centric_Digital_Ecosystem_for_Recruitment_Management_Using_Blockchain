const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');

router.post('/run', matchController.runMatching);
router.get('/company', matchController.getCompanyMatches);
router.get('/seeker', matchController.getSeekerMatches);

module.exports = router;