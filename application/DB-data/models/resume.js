const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
  address: { type: String, required: true, unique: true },
  resumeCid: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Resume', resumeSchema);