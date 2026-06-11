const express = require('express');
const router = express.Router();
const arbitrationController = require('../controllers/arbitrationController');

router.get('/getArbitrations', arbitrationController.getAllArbitrations);
router.get('/getArbitration/:id', arbitrationController.getArbitrationById);
router.patch('/update/:id/review', arbitrationController.startReviewArbitration);
router.patch('/update/:id/resolve', arbitrationController.resolveArbitration);
router.delete('/delete/:id', arbitrationController.deleteArbitration);

module.exports = router;