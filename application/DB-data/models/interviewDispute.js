const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const interviewDisputeSchema = new Schema(
  {
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
      required: true,
      index: true,
    },

    seekerAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    companyAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    originalResult: {
      type: String,
      enum: ['pass', 'fail'],
      required: true,
    },

    reason: {
      type: String,
      enum: ['result_mismatch', 'unfair_decision', 'incorrect_record', 'other'],
      required: true,
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    status: {
      type: String,
      enum: ['submitted', 'reviewing', 'resolved'],
      default: 'submitted',
      index: true,
    },

    arbitrationResult: {
      type: String,
      enum: ['support_seeker', 'support_company', 'partial_support', 'unable_to_determine'],
      default: null,
    },

    arbitrationSummary: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    reviewedBy: {
      type: String,
      default: '',
      lowercase: true,
      trim: true,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    chainTxId: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// 一筆 interview 同時間只允許一個未結案 dispute
interviewDisputeSchema.index(
  { interviewId: 1, status: 1 },
  {
    partialFilterExpression: {
      status: { $in: ['submitted', 'reviewing'] },
    },
  }
);

module.exports = mongoose.model('InterviewDispute', interviewDisputeSchema);