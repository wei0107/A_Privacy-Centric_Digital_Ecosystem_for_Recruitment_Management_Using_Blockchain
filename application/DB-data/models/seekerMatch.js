const mongoose = require('mongoose');
const { Schema } = mongoose;

const seekerMatchSchema = new Schema(
  {
    seekerId      : String,          // 求職者位址 / ID
    seekerPosition: String,          // 求職者目標職位

    matchedJobs: [
      {
        jobId     : {                // ★ 新增 jobId
          type: Schema.Types.ObjectId,
          ref : 'CompanyRequest',    // 對應公司職缺 collection
          required: true,
        },
        companyId : String,
        position  : String,
        department: String,
        notes     : String,
        matchScore: Number,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('SeekerMatch', seekerMatchSchema);
