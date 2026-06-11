const mongoose = require('mongoose');

const companyMatchSchema = new mongoose.Schema({
  companyId: String,
  position: String,
  department: String,
  matchedSeekers: [
    {
      seekerId: String,
      seekerPosition: String,
      matchScore: Number
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('CompanyMatch', companyMatchSchema);
