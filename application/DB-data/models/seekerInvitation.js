const mongoose = require('mongoose');

const seekerInvitationSchema = new mongoose.Schema({
  seekerId: { type: String, required: true },
  companyId: { type: String, required: true },

  jobId: { type: String }, // 你有用 jobId
  position: String,
  department: String,
  salaryRange: { min: Number, max: Number },
  requirements: [String],
  location: String,
  notes: String,
  message: String,

  invitedAt: { type: Date, default: Date.now },

  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },

  // ✅ 公司 MetaMask encryption public key（base64）
  companyEncPubKey: { type: String, required: true },

  // ✅ 求職者接受邀請後回傳給後端存的密文（hex-string 0x...）
  encryptedProfile: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('SeekerInvitation', seekerInvitationSchema);