const mongoose = require('mongoose');

const userCredentialSchema = new mongoose.Schema({
  id: String,            // 合約地址或 DID
  name: String,
  issuedAt: String,
  role: String           // 'jobseeker' 或 'company'
}, { timestamps: true });

module.exports = mongoose.model('UserCredential', userCredentialSchema);
