const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const seekerApplySchema = new Schema(
    {
      jobId: {
        type: Schema.Types.ObjectId,
        ref: 'CompanyRequest',
        required: true,
      },
      seekerAddress: {
        type: String,
        required: true,
        lowercase: true,       // 自動轉小寫
        trim: true,
      },
      expectedSalary: Number,
      skills: [String],
      availableFrom: Date,
      location: String,
      notes: String,
      position: String,
    },
    { timestamps: true }
  );
  
  // 唯一複合索引：同一應徵者對同一職缺只會有一筆
  seekerApplySchema.index({ jobId: 1, seekerAddress: 1 }, { unique: true });
  
  module.exports = mongoose.model('SeekerApply', seekerApplySchema);
  