const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const interviewSchema = new Schema({
  invitationId: {
    type: Schema.Types.ObjectId,
    ref: 'SeekerInvitation',
    required: true,
  },
  companyAddress: {
    type: String,
    required: true,
    lowercase: true, // 自動轉小寫，統一格式
    trim: true,
  },
  interviewTime: {
    type: Date,
    required: true,
  },
  location: {
    type: String,
    required: true,
    trim: true,
  },
  note: {
    type: String,
    default: '',
    trim: true,
  },
  result: {
    type: String,
    enum: ['pending', 'pass', 'fail'],
    default: 'pending',
  },
  comment: {
    type: String,
    default: '',
    trim: true,
  },

  // 仲裁快取欄位，方便前端直接顯示
  disputeStatus: {
    type: String,
    enum: ['none', 'submitted', 'reviewing', 'resolved'],
    default: 'none',
    index: true,
  },
  arbitrationResult: {
    type: String,
    enum: ['support_seeker', 'support_company', 'partial_support', 'unable_to_determine', null],
    default: null,
  },

  onchainStatus: {
    type: String,
    enum: ['unconfirmed', 'confirmed'],
    default: 'unconfirmed',
    index: true,
  },


  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Interview', interviewSchema);