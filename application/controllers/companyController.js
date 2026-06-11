const dbService = require('../services/dbService');
const hyperledgerService = require('../services/hyperledgerService');
const ipfsService        = require('../services/ipfsService');
const { upsertJobAsync, deleteJobAsync } = require('../services/qdrantClient');
const { Web3 } = require('web3');
const web3 = new Web3();

const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

/**
 * 查詢該公司所有職缺
 */
const getCompanyRequestsByAddress = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, msg: '缺少 address' });
    }
    const requests = await dbService.getCompanyRequestsByAddress(address.toLowerCase());
    return res.json({ success: true, requests });
  } catch (err) {
    console.error('❌ 查詢公司職缺失敗:', err);
    return res.status(500).json({ success: false, msg: '查詢失敗', error: err.toString() });
  }
};

/**
 * 查詢單一職缺
 */
const getCompanyRequest = async (req, res) => {
    try {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ success: false, msg: '缺少 id' });
      }
      console.log(id)
      const result = await dbService.getCompanyRequest(id);
      if (!result) {
        return res.status(404).json({ success: false, msg: '查無職缺' });
      }
  
      return res.json({ success: true, request: result });
    } catch (err) {
      console.error('❌ 查詢職缺失敗:', err);
      return res.status(500).json({ success: false, msg: '伺服器錯誤', error: err.toString() });
    }
  };

const TS_MAX_SKEW_MS = 5 * 60 * 1000;

const upsertCompanyRequest = async (req, res) => {
  try {
    const { request, signature, ts } = req.body;
    const address = request?.address;

    if (!request || !address || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 request/address/signature' });
    }

    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    const reqForHash = {
      _id: request._id ?? null,
      address: String(request.address || '').toLowerCase(),
      companyId: request.companyId ?? '',
      position: request.position ?? '',
      department: request.department ?? '',
      salaryRange: {
        min: Number(request.salaryRange?.min),
        max: Number(request.salaryRange?.max),
      },
      requirements: Array.isArray(request.requirements) ? [...request.requirements].sort() : [],
      location: request.location ?? '',
      notes: request.notes ?? '',
    };

    const canonical = stableStringify(reqForHash);
    const jobHash = web3.utils.sha3(canonical);

    const expectedMessage = `UpsertJob for ${address} jobHash=${jobHash} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 request 不一致' });
    }

    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    const saved = await dbService.saveCompanyRequest({
      ...request,
      address: address.toLowerCase(),
    });

    res.json({ success: true, request: saved });

    setImmediate(() => upsertJobAsync(saved));
  } catch (err) {
    console.error('❌ 儲存職缺失敗:', err);
    return res.status(500).json({ success: false, msg: '儲存失敗', error: err.toString() });
  }
};

const deleteCompanyRequest = async (req, res) => {
  try {
    const { address, id, signature, ts } = req.body || {};
    if (!address || !id || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 address/id/signature' });
    }

    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    const expectedMessage = `DeleteJob for ${address} jobId=${id} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 不一致' });
    }

    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    const deleted = await dbService.deleteCompanyRequest(id);
    if (!deleted) return res.status(404).json({ success: false, msg: '查無資料可刪除' });

    res.json({ success: true, msg: '刪除成功' });

    setImmediate(() => deleteJobAsync(id));
  } catch (err) {
    console.error('❌ 刪除職缺失敗:', err);
    return res.status(500).json({ success: false, msg: '刪除失敗', error: err.toString() });
  }
};

/**
 * GET /company/resume?address=<jobSeekerAddress>
 * 企業端：依 address 取得「去識別化」履歷
 */
const getResumeByAddress = async (req, res) => {
  try {
    console.log("Get Resume...");
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, msg: '缺少 address' });
    }
    const lowered = address.toLowerCase();

    /* -------- 1. 讀鏈上 AccessConfig -------- */
    const accessResult  = await hyperledgerService.getAccessConfig(lowered);
    const visibleFields = accessResult?.data?.visibleFields || {};
    console.log("accessResult: ",accessResult);

    /* -------- 2. 讀 DB 取得履歷 CID -------- */
    const resumeRecord = await dbService.getResume(lowered);
    if (!resumeRecord) {
      return res.status(404).json({ success: false, msg: '找不到履歷紀錄' });
    }

    /* -------- 3. 從 IPFS 取得完整履歷 -------- */
    const fullResume = await ipfsService.getResume(resumeRecord.resumeCid);

    /* -------- 4. 依可見欄位過濾 -------- */
    const filteredResume = {};
    Object.entries(visibleFields).forEach(([field, canShow]) => {
      filteredResume[field] = canShow ? fullResume[field] ?? null : null;
    });

    return res.json({
      success: true,
      cid: resumeRecord.resumeCid,
      visibleFields,
      resume: filteredResume
    });
  } catch (err) {
    console.error('❌ getResumeByAddress 失敗:', err);
    return res.status(500).json({ success: false, msg: '取得履歷失敗', error: err.toString() });
  }
};

/**
 * 取得所有求職者需求單（給企業端檢視）
 * GET /company/seekers
 */
const getAllSeekers = async (req, res) => {
  try {
    // 目前不帶條件，全部撈出
    const seekers = await dbService.getAllJobSeekerRequests();
    return res.json({ success: true, seekers });
  } catch (err) {
    console.error('❌ 取得所有求職者需求單失敗:', err);
    return res
      .status(500)
      .json({ success: false, msg: '查詢失敗', error: err.toString() });
  }
};

const sendInvitation = async (req, res) => {
  try {
    const { address, ts, message, signatureFlat, invitation } = req.body || {};
    if (!address || !message || !signatureFlat) {
      return res.status(400).json({ success: false, msg: '缺少 address/message/signatureFlat' });
    }
    if (!invitation) {
      return res.status(400).json({ success: false, msg: '缺少 invitation 內容' });
    }

    let invObj = invitation;
    if (typeof invObj === 'string') {
      try { invObj = JSON.parse(invObj); }
      catch { return res.status(400).json({ success: false, msg: 'invitation 格式錯誤（不是合法 JSON）' }); }
    }

    const {
      seekerId, companyId, position, department, jobId,
      message: inviteMsg,
      companyEncPubKey,
      salaryRange, requirements, location, notes,
    } = invObj;

    if (!seekerId || !companyId || !position || !department) {
      return res.status(400).json({ success: false, msg: '邀請缺少必要欄位' });
    }
    if (!companyEncPubKey) {
      return res.status(400).json({ success: false, msg: '缺少 companyEncPubKey' });
    }

    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    const invitationForHash = {
      seekerId: String(seekerId || '').toLowerCase(),
      jobId: String(jobId || ''),
      companyId: String(companyId || '').toLowerCase(),
      position: position ?? '',
      department: department ?? '',
      salaryRange: { min: Number(salaryRange?.min), max: Number(salaryRange?.max) },
      requirements: Array.isArray(requirements) ? [...requirements].sort() : [],
      location: location ?? '',
      notes: notes ?? '',
      message: inviteMsg ?? '',
      companyEncPubKey: companyEncPubKey ?? '',
    };

    const canonical = stableStringify(invitationForHash);
    const invitationHash = web3.utils.sha3(canonical);

    const expectedMessage = `SendInvite company=${address} seeker=${seekerId} invitationHash=${invitationHash} ts=${ts}`;
    if (message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 invitation 不一致' });
    }

    const recovered = web3.eth.accounts.recover(message, signatureFlat);
    if (recovered.toLowerCase() !== String(address).toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // ✅ 真正寫入 DB 的欄位（保證 companyEncPubKey 存進去）
    const saved = await dbService.sendInvitation({
      seekerId: String(seekerId).toLowerCase(),
      companyId: String(companyId).toLowerCase(),
      jobId: jobId ? String(jobId) : undefined,
      position,
      department,
      salaryRange: salaryRange ?? undefined,
      requirements: Array.isArray(requirements) ? requirements : [],
      location,
      notes,
      message: inviteMsg ?? '',
      companyEncPubKey: String(companyEncPubKey),
      invitedAt: new Date(),
      status: 'pending',
    });

    return res.json({ success: true, invitation: saved });
  } catch (err) {
    console.error('❌ sendInvitation 失敗：', err);
    return res.status(500).json({ success: false, msg: '送出邀請失敗', error: err.toString() });
  }
};

const getInvitationsForJob = async (req, res) => {
  try {
    const { companyId, position, department } = req.query;

    // === 檢查輸入參數 ===
    if (!companyId || !position || !department) {
      return res.status(400).json({
        success: false,
        msg: '缺少 companyId、position 或 department',
      });
    }

    // === 查詢該職缺所有邀請 ===
    const invitations = await dbService.getInvitationsForCompany({
      companyId,
      position,
      department,
    });

    return res.json({
      success: true,
      invitations,
    });
  } catch (err) {
    console.error('❌ 查詢職缺邀請失敗:', err);
    return res.status(500).json({
      success: false,
      msg: '伺服器錯誤，無法取得職缺邀請',
      error: err.toString(),
    });
  }
};

/**
 * 查詢某職缺的所有應徵者
 * GET /company/applies?jobId=xxxxx
 */
const getAppliesByJobId = async (req, res) => {
  try {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({ success: false, msg: '缺少 jobId' });
    }

    const applies = await dbService.getAppliesByJobId(jobId);
    return res.json({ success: true, applies });
  } catch (err) {
    console.error('❌ 查詢應徵者失敗:', err);
    return res.status(500).json({ success: false, msg: '查詢失敗', error: err.toString() });
  }
};

module.exports = {
  getCompanyRequestsByAddress,
  getCompanyRequest,
  upsertCompanyRequest,
  deleteCompanyRequest,
  getResumeByAddress,
  getAllSeekers,
  sendInvitation,
  getInvitationsForJob,
  getAppliesByJobId
};