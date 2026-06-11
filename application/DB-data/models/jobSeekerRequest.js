const mongoose = require('mongoose');

const jobSeekerRequestSchema = new mongoose.Schema({
  address: String,
  expectedSalary: Number,
  skills: [String],
  availableFrom: Date,
  location: String,
  notes: String,
  position: String,
}, { timestamps: true });

module.exports = mongoose.model('JobSeekerRequest', jobSeekerRequestSchema);