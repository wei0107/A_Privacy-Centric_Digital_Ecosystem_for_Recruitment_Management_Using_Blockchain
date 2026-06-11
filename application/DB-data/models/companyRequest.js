const mongoose = require('mongoose');

const companyRequestSchema = new mongoose.Schema({
  address: String,
  companyId: String,
  position: String,
  department: String,
  salaryRange: {
    min: Number,
    max: Number
  },
  requirements: [String],
  location: String,
  notes: String
}, { timestamps: true });

module.exports = mongoose.model('CompanyRequest', companyRequestSchema);