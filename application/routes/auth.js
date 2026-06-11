const express = require('express');
const router = express.Router();
const { registerDID ,registerApp ,getEncryptedAppKey ,getEncryptedCSR , initCredential, login, me, logout } = require('../controllers/authController');

// 註冊階段 1：建立身份與寫入 name
router.post('/registerDID', registerDID);

router.post('/registerApp', registerApp);

router.post('/getEncryptedCSR', getEncryptedCSR);

router.post('/getEncryptedAppKey', getEncryptedAppKey);

router.post('/login', login);

router.post('/logout', logout);

module.exports = router;