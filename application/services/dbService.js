const mongoose = require('mongoose');
const path = require('path');

// 載入三個 model
const JobSeekerRequest = require(path.join(__dirname, '../DB-data/models/jobSeekerRequest'));
const CompanyRequest = require(path.join(__dirname, '../DB-data/models/companyRequest'));
const UserCredential = require(path.join(__dirname, '../DB-data/models/userCredential'));
const CompanyMatch = require(path.join(__dirname, '../DB-data/models/companyMatch'));
const SeekerMatch = require(path.join(__dirname, '../DB-data/models/seekerMatch'));
const resume = require(path.join(__dirname, '../DB-data/models/resume'));
const SeekerInvitation = require(path.join(__dirname, '../DB-data/models/seekerInvitation'));
const Interview = require(path.join(__dirname, '../DB-data/models/interview'));
const SeekerApply = require(path.join(__dirname, '../DB-data/models/seekerApply'));
const InterviewDispute = require(path.join(__dirname, '../DB-data/models/interviewDispute'));

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/hr-db');
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Failed to connect MongoDB:", err);
  }
};

// === 用戶憑證 ===
const saveUserCredential = async (data) => {
  const cred = new UserCredential(data);
  return await cred.save();
};

const getAllUserCredentials = async () => {
  return await UserCredential.find();
};

const getUserCredential = async (id) => {
  id=id.toLowerCase();
  return await UserCredential.findOne({ id });
};

// === 求職者需求單 ===
const saveJobSeekerRequest = async (data) => {
  const address = data.address.toLowerCase();
  return await JobSeekerRequest.findOneAndUpdate(
    { address },     // 查找條件
    data,            // 新資料
    { upsert: true, new: true }
  );
};

const getAllJobSeekerRequests = async () => {
  return await JobSeekerRequest.find();
};

const getJobSeekerRequestByAddress = async (address) => {
  address = address.toLowerCase();
  return await JobSeekerRequest.findOne({ address });
};

const deleteJobSeekerRequestByAddress = async (address) => {
  address = address.toLowerCase();
  return await JobSeekerRequest.deleteOne({ address });
};

const deleteFakeJobSeekerRequests = async () => {
  try {
    const result = await JobSeekerRequest.deleteMany({
      address: { $regex: /^0xFAKEADDR/i } // 忽略大小寫比對 prefix
    });
    console.log(`🗑️ 已刪除 ${result.deletedCount} 筆假求職需求資料`);
  } catch (err) {
    console.error("❌ 刪除假資料失敗:", err);
  }
};

// === 企業需求單 ===
const saveCompanyRequest = async (data) => {
  if (!data._id) {
    const newRequest = new CompanyRequest(data);
    return await newRequest.save();
  } else {
    return await CompanyRequest.findByIdAndUpdate(data._id, data, { new: true });
  }
};

const getAllCompanyRequests = async () => {
  return await CompanyRequest.find();
};

const getCompanyRequestsByAddress = async (address) => {
  address = address.toLowerCase();
  return await CompanyRequest.find({ address });
};

const deleteCompanyRequest = async (_id) => {
  return await CompanyRequest.findByIdAndDelete(_id);
};

const getCompanyRequest = async (_id) => {
  return await CompanyRequest.findById(_id);
};

const deleteFakeCompanyRequests = async () => {
  const result = await CompanyRequest.deleteMany({ address: /^0xCOMPANY/ });
  console.log(`🧹 刪除 ${result.deletedCount} 筆假公司職缺`);
};

// === 儲存 match 結果 ===
const saveCompanyMatches = async (companyMatches) => {
  await CompanyMatch.deleteMany({});
  return await CompanyMatch.insertMany(companyMatches);
};

const saveSeekerMatches = async (seekerMatches) => {
  await SeekerMatch.deleteMany({});
  return await SeekerMatch.insertMany(seekerMatches);
};

const getCompanyMatches = async () => {
  return await CompanyMatch.find();
};

const getSeekerMatches = async () => {
  return await SeekerMatch.find();
};

const getCompanyMatchesByFilter = async ({ companyId, department, position }) => {
  const query = {};
  if (companyId) query.companyId = companyId;
  if (department) query.department = department;
  if (position) query.position = position;
  return await CompanyMatch.find(query);
};

const getSeekerMatchesByFilter = async ({ seekerId }) => {
  const query = {};
  if (seekerId) query.seekerId = seekerId;
  return await SeekerMatch.find(query);
};

// === 履歷 Resume ===
const uploadResume = async (data) => {
  const newResume = new resume(data);
  return await newResume.save();
};

const getResume = async (address) => {
  address = address.toLowerCase();  // 小寫標準化
  return await resume.findOne({ address });
};

const updateResume = async (address, newCid) => {
  address = address.toLowerCase();
  return await resume.findOneAndUpdate(
    { address },
    { resumeCid: newCid, updatedAt: new Date() },
    { new: true }
  );
};

const deleteResume = async (address) => {
  address = address.toLowerCase();
  return await resume.deleteOne({ address });
};

// === 求職者邀請 Seeker Invitation ===
/**
 * 發送邀請（避免重複）
 */
const sendInvitation = async (invitation) => {
  const { seekerId, companyId, position, department, jobId } = invitation;

  const filter = jobId
    ? { seekerId, companyId, jobId }           // ✅ 最穩：同職缺唯一
    : { seekerId, companyId, position, department };

  const update = {
    ...invitation,
    invitedAt: new Date(),
    status: 'pending',
  };

  const options = { new: true, upsert: true };
  return await SeekerInvitation.findOneAndUpdate(filter, update, options);
};

const getInvitationById = async (invitationId) => {
  return await SeekerInvitation.findById(invitationId);
};

const updateInvitationAccepted = async (invitationId, encryptedProfile) => {
  return await SeekerInvitation.findByIdAndUpdate(
    invitationId,
    { status: 'accepted', encryptedProfile },
    { new: true }
  );
};

/**
 * 刪除邀請
 */
const deleteInvitation = async ({ seekerId, companyId, position, department }) => {
  try {
    const result = await SeekerInvitation.deleteOne({
      seekerId,
      companyId,
      position,
      department
    });

    if (result.deletedCount === 0) {
      console.warn("⚠️ 找不到對應邀請，未刪除");
    } else {
      console.log("🗑️ 已成功刪除邀請");
    }

    return result;
  } catch (err) {
    console.error("❌ 刪除邀請失敗:", err);
    throw err;
  }
};

const getInvitationsForSeeker = async (seekerId) => {
  seekerId = seekerId.toLowerCase();
  return await SeekerInvitation.find({ seekerId });
};

const getInvitationsForCompany = async ({ companyId, position, department }) => {
  //companyId = companyId.toLowerCase();
  return await SeekerInvitation.find({
    companyId,
    position,
    department,
  });
};

// === 求職者邀請 Seeker Invitation ===
const VALID_STATUSES = ['pending', 'accepted', 'rejected'];
const updateInvitationStatus = async (invitationId, newStatus) => {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`無效的邀請狀態：${newStatus}`);
  }

  return await SeekerInvitation.findByIdAndUpdate(
    invitationId,
    { status: newStatus },
    { new: true }          // 回傳更新後文件
  );
};

/**
 * 當求職者接受邀請後，回傳加密後個資與 ephemeral 公鑰
 */
const updateInvitationProfile = async (invitationId, { encryptedProfile, ephemeralPublicKey, iv }) => {
  if (!encryptedProfile || !ephemeralPublicKey || !iv) {
    throw new Error("❌ 缺少必要欄位：encryptedProfile 或 ephemeralPublicKey 或 iv");
  }

  return await SeekerInvitation.findByIdAndUpdate(
    invitationId,
    {
      encryptedProfile,
      ephemeralPublicKey,
      iv,
      status: 'accepted', // ✅ 同時更新狀態
    },
    { new: true }
  );
};

/* ------------------------------------------------------------------
 * 面試 Interview
 * -----------------------------------------------------------------*/

/** ✅ 新增一筆面試（建立後回傳整筆 document） */
const createInterview = async (data) => {
  const { invitationId, interviewTime, location, note, companyAddress, result } = data;

  if (!invitationId || !interviewTime || !location || !companyAddress) {
    throw new Error("缺少必要欄位");
  }

  return await Interview.findOneAndUpdate(
    { invitationId }, // 查找條件
    {
      $set: {
        interviewTime,
        location,
        note: note || '',
        companyAddress: companyAddress.toLowerCase(),
        result
      }
    },
    {
      new: true,     // 回傳更新後的 document
      upsert: true,  // 不存在則新增
    }
  );
};

/** 🔍 取得單筆面試（依 _id） */
const getInterviewById = async (interviewId) => {
  return await Interview.findById(interviewId).populate('invitationId');
};

/** 🗑️ 刪除面試（依 _id） */
const deleteInterview = async (interviewId) => {
  return await Interview.findByIdAndDelete(interviewId);
};

/** ✏️ 更新面試結果 / 評論 */
const updateInterviewResult = async (interviewId, { result, comment }) => {
  const VALID = ['pending', 'pass', 'fail'];
  if (result && !VALID.includes(result)) {
    throw new Error(`無效的結果：${result}`);
  }

  const update = {};
  if (result)  update.result  = result;
  if (comment !== undefined) update.comment = comment;  // 可為空字串

  return await Interview.findByIdAndUpdate(
    interviewId,
    update,
    { new: true }   // 回傳更新後文件
  );
};

// 查詢某公司所有面試紀錄（根據 companyAddress）
const getInterviewsByCompany = async (companyAddress) => {
  companyAddress = companyAddress.toLowerCase();
  return await Interview.find({ companyAddress }).populate('invitationId');
};

// 查詢某求職者的所有面試紀錄（根據 invitation 內的 seekerId）
const getInterviewsBySeeker = async (seekerId) => {
  seekerId = seekerId.toLowerCase();
  // 先找出該求職者的所有邀請 ID
  const invitations = await SeekerInvitation.find({ seekerId });
  const invitationIds = invitations.map(inv => inv._id);
  return await Interview.find({ invitationId: { $in: invitationIds } }).populate('invitationId');
};

/** ⚖️ 更新面試的仲裁狀態 */
const updateInterviewArbitrationStatus = async (
  interviewId,
  { disputeStatus, arbitrationResult }
) => {
  const VALID_STATUS = ['none', 'submitted', 'reviewing', 'resolved'];
  const VALID_RESULT = ['support_seeker', 'support_company', 'partial_support', 'unable_to_determine'];

  const update = {};

  // 驗證 disputeStatus
  if (disputeStatus) {
    if (!VALID_STATUS.includes(disputeStatus)) {
      throw new Error(`無效的 disputeStatus：${disputeStatus}`);
    }
    update.disputeStatus = disputeStatus;
  }

  // 驗證 arbitrationResult
  if (arbitrationResult !== undefined) {
    if (arbitrationResult !== null && !VALID_RESULT.includes(arbitrationResult)) {
      throw new Error(`無效的 arbitrationResult：${arbitrationResult}`);
    }
    update.arbitrationResult = arbitrationResult;
  }

  return await Interview.findByIdAndUpdate(
    interviewId,
    update,
    { new: true }
  );
};

/** 🔗 標記使用者面試結果已完成上鏈 */
const markInterviewOnchainConfirmed = async (interviewId) => {
  return await Interview.findByIdAndUpdate(
    interviewId,
    { onchainStatus: 'confirmed' },
    { new: true }
  );
};

/**
 * 新增 / 更新求職者應徵紀錄
 * @param {String|ObjectId} jobId             - 企業職缺 _id
 * @param {String}          seekerAddress     - 求職者錢包位址 (未轉小寫前)
 * @param {Object}          applyData         - 其餘欄位（expectedSalary、skills…）
 * @returns {Promise<Document>}               - 儲存後的 document
 */
const saveSeekerApply = async (jobId, seekerAddress, applyData = {}) => {
  if (!jobId || !seekerAddress) {
    throw new Error('缺少 jobId 或 seekerAddress');
  }

  const normalizedAddr = seekerAddress.toLowerCase();

  return await SeekerApply.findOneAndUpdate(
    /* ---------- filter ---------- */
    { jobId, seekerAddress: normalizedAddr },

    /* ---------- update ---------- */
    {
      $set: {
        jobId,
        seekerAddress: normalizedAddr,
        expectedSalary: applyData.expectedSalary,
        skills        : applyData.skills,
        availableFrom : applyData.availableFrom,
        location      : applyData.location,
        notes         : applyData.notes,
        position      : applyData.position,
      },
    },

    /* ---------- options ---------- */
    {
      new: true,               // 回傳更新後的文件
      upsert: true,            // 不存在就新增
      setDefaultsOnInsert: true,
    }
  );
};

/**
 * 查詢某個職缺 jobId 的所有申請者
 * @param {String} jobId - 公司職缺的 ObjectId
 * @returns {Promise<Array>} - 所有申請該職缺的 SeekerApply 資料
 */
const getAppliesByJobId = async (jobId) => {
  return await SeekerApply.find({ jobId }).populate('jobId');
};

/* ------------------------------------------------------------------
 * 仲裁 InterviewDispute
 * -----------------------------------------------------------------*/

/** ✅ 新增一筆仲裁 */
const createInterviewDispute = async (data) => {
  const {
    interviewId,
    seekerAddress,
    companyAddress,
    originalResult,
    reason,
    description,
  } = data;

  if (!interviewId || !seekerAddress || !companyAddress || !originalResult || !reason) {
    throw new Error('缺少必要欄位');
  }

  return await InterviewDispute.create({
    interviewId,
    seekerAddress: seekerAddress.toLowerCase(),
    companyAddress: companyAddress.toLowerCase(),
    originalResult,
    reason,
    description: description || '',
  });
};

/** ✏️ 修改一筆仲裁 */
const updateInterviewDispute = async (disputeId, updateData) => {
  const allowedFields = [
    'reason',
    'description',
    'status',
    'arbitrationResult',
    'arbitrationSummary',
    'reviewedBy',
    'resolvedAt',
    'chainTxId',
  ];

  const update = {};

  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      update[key] = updateData[key];
    }
  }

  if (update.reviewedBy) {
    update.reviewedBy = update.reviewedBy.toLowerCase();
  }

  return await InterviewDispute.findByIdAndUpdate(
    disputeId,
    update,
    { new: true }
  ).populate('interviewId');
};

/** 🔍 取得某筆仲裁 */
const getInterviewDisputeById = async (disputeId) => {
  return await InterviewDispute.findById(disputeId).populate('interviewId');
};

/** 🗑️ 刪除一筆仲裁 */
const deleteInterviewDispute = async (disputeId) => {
  return await InterviewDispute.findByIdAndDelete(disputeId);
};

/** 🏢 取得某個公司的所有仲裁 */
const getInterviewDisputesByCompany = async (companyAddress) => {
  companyAddress = companyAddress.toLowerCase();
  return await InterviewDispute.find({ companyAddress })
    .sort({ createdAt: -1 })
    .populate('interviewId');
};

/** 👤 取得某個求職者的所有仲裁 */
const getInterviewDisputesBySeeker = async (seekerAddress) => {
  seekerAddress = seekerAddress.toLowerCase();
  return await InterviewDispute.find({ seekerAddress })
    .sort({ createdAt: -1 })
    .populate('interviewId');
};

const getAllInterviewDisputes = async () => {
  return await InterviewDispute.find()
    .sort({ createdAt: -1 })   // 最新在前
    .populate('interviewId');  // 帶出面試資訊
};

module.exports = {
  connectDB,
  saveUserCredential,
  getAllUserCredentials,
  getUserCredential,
  saveJobSeekerRequest,
  getJobSeekerRequestByAddress,
  deleteJobSeekerRequestByAddress,
  getAllJobSeekerRequests,
  saveCompanyRequest,
  getAllCompanyRequests,
  getCompanyRequestsByAddress,
  getCompanyRequest,
  deleteCompanyRequest,
  saveCompanyMatches,
  saveSeekerMatches,
  getCompanyMatches,
  getSeekerMatches,
  getCompanyMatchesByFilter,
  getSeekerMatchesByFilter, 
  uploadResume,
  updateResume,
  getResume,
  deleteResume,
  deleteFakeJobSeekerRequests,
  deleteFakeCompanyRequests,
  sendInvitation,
  deleteInvitation,
  getInvitationsForSeeker,
  getInvitationsForCompany,
  updateInvitationStatus,
  updateInvitationProfile,
  createInterview,
  deleteInterview,
  updateInterviewResult,
  getInterviewsByCompany,
  getInterviewsBySeeker,
  saveSeekerApply,
  getAppliesByJobId,
  getInvitationById,
  updateInvitationAccepted,
  createInterviewDispute,
  updateInterviewDispute,
  getInterviewDisputeById,
  deleteInterviewDispute,
  getInterviewDisputesByCompany,
  getInterviewDisputesBySeeker,
  getInterviewById,
  updateInterviewArbitrationStatus,
  markInterviewOnchainConfirmed,
  getAllInterviewDisputes
};