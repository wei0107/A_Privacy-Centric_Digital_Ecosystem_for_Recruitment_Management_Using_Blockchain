// controllers/interviewController.js
const dbService = require('../services/dbService');
const hyperledgerService = require('../services/hyperledgerService');
const { Web3 } = require('web3');
const web3 = new Web3();

// --- helpers for deterministic message binding ---
const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

const TS_MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------------------------------ */
/* ✅ 1. 新增一筆面試                                                  */
/* ------------------------------------------------------------------ */
const createInterview = async (req, res) => {
  try {
    const {
      invitationId,
      interviewTime,
      location,
      note = '',
      companyAddress,
      ts,
      signature, // { flat, message }
    } = req.body;

    // 0) 基本檢查
    if (!invitationId || !interviewTime || !location || !companyAddress || !ts || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少必要欄位 invitationId/interviewTime/location/companyAddress/ts/signature' });
    }

    // 1) ts window（防重放）
    const now = Date.now();
    if (typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // 2) message 綁 payload（後端重組 expectedMessage）
    const payload = {
      companyAddress: String(companyAddress).toLowerCase(),
      invitationId: String(invitationId),
      interviewTime: new Date(interviewTime).toISOString(), // ✅ 用 ISO 固定化，避免格式差異
      location: String(location),
      note: String(note || ''),
      ts: Number(ts),
    };

    const canonical = stableStringify(payload);
    const expectedMessage = `CreateInterview ${canonical}`;

    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 payload 不一致' });
    }

    // 3) recover ownership
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== String(companyAddress).toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 4) （建議）檢查 invitation 是否存在 + 確認 invitation.companyId / companyAddress 一致
    // 你如果 dbService 有 getInvitationById，可以加強：
    // const inv = await dbService.getInvitationById(invitationId);
    // if (!inv) return res.status(404).json({ success:false, msg:'找不到該邀請' });
    // if (String(inv.companyId).toLowerCase() !== String(companyAddress).toLowerCase()) return res.status(403).json(...);

    // 5) 建立面試
    const newInterview = await dbService.createInterview({
      invitationId,
      interviewTime: new Date(interviewTime),
      location,
      note,
      companyAddress: companyAddress.toLowerCase(),
      result: 'pending',
    });

    return res.status(201).json({ success: true, interview: newInterview });
  } catch (err) {
    console.error('❌ createInterview 失敗:', err);
    return res.status(500).json({ success: false, msg: '建立面試失敗', error: err.toString() });
  }
};

/* ------------------------------------------------------------------ */
/* 🗑️ 2. 刪除面試                                                     */
/* ------------------------------------------------------------------ */
const deleteInterview = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const deleted = await dbService.deleteInterview(interviewId);
    if (!deleted) {
      return res.status(404).json({ success:false, msg:'找不到該面試' });
    }
    return res.json({ success:true, msg:'已刪除', interview:deleted });
  } catch (err) {
    console.error('❌ deleteInterview 失敗:', err);
    return res.status(500).json({ success:false, msg:'刪除失敗', error:err.toString() });
  }
};

/**
 * PATCH /interview/:interviewId/start
 * body: { address, result, comment, ts, signature:{flat,message} }
 * - verify MetaMask ownership
 * - update DB
 * - if result is pass/fail => build enterprise-chain proposal (offline) and return token+proposalBytesB64
 */
const updateInterviewResultStart = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const { address, result, comment, ts, signature, chainPayload } = req.body || {};

    if (!interviewId || !address || !result || ts == null || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 interviewId/address/result/ts/signature' });
    }

    // ts window
    const now = Date.now();
    if (typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // 1) bind message to payload (MetaMask ownership)
    const payload = {
      address: String(address).toLowerCase(),
      interviewId: String(interviewId),
      result: String(result),
      comment: String(comment || ''),
      ts: Number(ts),
    };
    const canonical = stableStringify(payload);
    const expectedMessage = `UpdateInterviewResult(start) ${canonical}`;

    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 payload 不一致' });
    }

    // 2) recover ownership
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== String(address).toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 3) update DB first
    const updated = await dbService.updateInterviewResult(interviewId, { result, comment });
    if (!updated) return res.status(404).json({ success: false, msg: '找不到該面試' });

    // ✅ 權限檢查：確保這筆 interview 屬於該 company
    const companyAddress = String(address).toLowerCase();
    if (String(updated.companyAddress || '').toLowerCase() !== companyAddress) {
      return res.status(403).json({ success: false, msg: '無權限更新此面試（companyAddress 不一致）' });
    }

    // 4) only when pass/fail => do enterprise-chain offline flow
    if (result !== 'pass' && result !== 'fail') {
      return res.json({ success: true, interview: updated, onchain: false });
    }

    // ✅ 5) 全前端傳 chainPayload（直接用）
    if (!chainPayload || typeof chainPayload !== 'object') {
      return res.status(400).json({ success: false, msg: '缺少 chainPayload' });
    }

    // ✅ chaincode required fields
    const required = ['position', 'company', 'department', 'seekerAddress', 'result'];
    for (const f of required) {
      if (!chainPayload[f]) {
        return res.status(400).json({ success: false, msg: `❌ chainPayload missing field: ${f}` });
      }
    }

    // ✅ 強制把 result/companyAddress 正規化（避免前端亂填）
    const finalPayload = {
      position: String(chainPayload.position),
      company: String(chainPayload.company),
      department: String(chainPayload.department),
      seekerAddress: String(chainPayload.seekerAddress).toLowerCase(),
      result: String(result), // 用 req.body.result 作主
    };

    // 6) build offline proposal (enterprise chaincode)
    const { token, proposalBytesB64 } = await hyperledgerService.offlineBuildProposal({
      address: companyAddress,
      type: '2',
      fcn: 'addInterviewResult',
      args: [companyAddress, JSON.stringify(finalPayload)],
    });

    return res.json({
      success: true,
      interview: updated,
      onchain: true,
      token,
      proposalBytesB64,
    });
  } catch (err) {
    console.error('❌ updateInterviewResultStart 失敗:', err);
    return res.status(500).json({ success: false, msg: 'start 失敗', error: err.toString() });
  }
};

/**
 * PATCH /interview/:interviewId/finish
 * body: { address, token, endorsementSignatureDerB64?, commitSignatureDerB64? }
 */
const updateInterviewResultFinish = async (req, res) => {
  try {
    const { interviewId } = req.params; // not strictly needed but good for route symmetry
    const { address, token, endorsementSignatureDerB64, commitSignatureDerB64 } = req.body || {};

    if (!interviewId || !address || !token) {
      return res.status(400).json({ success: false, msg: '缺少 interviewId/address/token' });
    }

    // commit stage
    if (commitSignatureDerB64) {
      const commitResp = await hyperledgerService.offlineSendCommit({
        token,
        address: String(address).toLowerCase(),
        commitSignatureDerB64,
      });
      return res.json({ success: true, commitResp });
    }

    // endorsement stage
    if (!endorsementSignatureDerB64) {
      return res.status(400).json({ success: false, msg: '缺少 endorsementSignatureDerB64' });
    }

    const { commitBytesB64 } = await hyperledgerService.offlineSendEndorsementAndBuildCommit({
      token,
      address: String(address).toLowerCase(),
      endorsementSignatureDerB64,
    });

    return res.json({ success: true, commitBytesB64 });
  } catch (err) {
    console.error('❌ updateInterviewResultFinish 失敗:', err);
    return res.status(500).json({ success: false, msg: 'finish 失敗', error: err.toString() });
  }
};

const seekerConfirmOnchainStart = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const { address, ts, signature, chainPayload } = req.body || {};

    if (!interviewId || !address || ts == null || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 interviewId/address/ts/signature' });
    }

    const now = Date.now();
    if (typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    const required = ['position', 'company', 'department', 'result'];
    for (const f of required) {
      if (!chainPayload?.[f]) {
        return res.status(400).json({ success: false, msg: `❌ chainPayload 缺少必要欄位: ${f}` });
      }
    }

    if (!['pass', 'fail'].includes(String(chainPayload.result))) {
      return res.status(400).json({ success: false, msg: 'result 必須為 pass/fail 才能確認上鏈' });
    }

    const seekerAddr = String(address).toLowerCase();

    const authPayload = {
      address: seekerAddr,
      interviewId: String(interviewId),
      result: String(chainPayload.result),
      ts: Number(ts),
    };

    const expectedMessage = `ConfirmInterviewOnchain(start) ${stableStringify(authPayload)}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 payload 不一致' });
    }

    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== seekerAddr) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    const { token, proposalBytesB64 } = await hyperledgerService.offlineBuildProposal({
      address: seekerAddr,
      type: '1',
      fcn: 'addInterviewResult',
      args: [seekerAddr, JSON.stringify(chainPayload)],
    });

    return res.json({ success: true, token, proposalBytesB64 });
  } catch (err) {
    console.error('❌ seekerConfirmOnchainStart 失敗:', err);
    return res.status(500).json({ success: false, msg: 'start 失敗', error: err.toString() });
  }
};

const seekerConfirmOnchainFinish = async (req, res) => {
  try {
    const { interviewId } = req.params;
    const { address, token, endorsementSignatureDerB64, commitSignatureDerB64 } = req.body || {};

    if (!interviewId || !address || !token) {
      return res.status(400).json({ success: false, msg: '缺少 interviewId/address/token' });
    }

    if (commitSignatureDerB64) {
      const commitResp = await hyperledgerService.offlineSendCommit({
        token,
        address: String(address).toLowerCase(),
        commitSignatureDerB64,
      });
      return res.json({ success: true, commitResp });
    }

    if (!endorsementSignatureDerB64) {
      return res.status(400).json({ success: false, msg: '缺少 endorsementSignatureDerB64' });
    }

    const { commitBytesB64 } = await hyperledgerService.offlineSendEndorsementAndBuildCommit({
      token,
      address: String(address).toLowerCase(),
      endorsementSignatureDerB64,
    });

    await dbService.markInterviewOnchainConfirmed(interviewId);

    return res.json({ success: true, commitBytesB64 });
  } catch (err) {
    console.error('❌ seekerConfirmOnchainFinish 失敗:', err);
    return res.status(500).json({ success: false, msg: 'finish 失敗', error: err.toString() });
  }
};

/* ------------------------------------------------------------------ */
/* 🔍 4. 公司端查詢所有面試                                            */
/* ------------------------------------------------------------------ */
const listInterviewsByCompany = async (req, res) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ success:false, msg:'缺少公司地址' });
    }
    const interviews = await dbService.getInterviewsByCompany(address);
    return res.json({ success:true, interviews });
  } catch (err) {
    console.error('❌ getInterviewsByCompany 失敗:', err);
    return res.status(500).json({ success:false, msg:'查詢失敗', error:err.toString() });
  }
};

/* ------------------------------------------------------------------ */
/* 🔍 5. 求職者端查詢所有面試                                          */
/* ------------------------------------------------------------------ */
const listInterviewsBySeeker = async (req, res) => {
  try {
    const { address } = req.params;   // 這裡沿用「seeker address」
    if (!address) {
      return res.status(400).json({ success:false, msg:'缺少求職者地址' });
    }
    const interviews = await dbService.getInterviewsBySeeker(address);
    return res.json({ success:true, interviews });
  } catch (err) {
    console.error('❌ getInterviewsBySeeker 失敗:', err);
    return res.status(500).json({ success:false, msg:'查詢失敗', error:err.toString() });
  }
};


/**
 * 建立面試仲裁申請
 * body: { interviewId, address, reason, description, ts, signature: { flat, message } }
 */
const createInterviewDispute = async (req, res) => {
  try {
    const { interviewId, address, reason, description, ts, signature } = req.body || {};

    if (!interviewId || !address || !reason || !ts || !signature?.flat || !signature?.message) {
      return res.status(400).json({
        success: false,
        msg: '缺少 interviewId/address/reason/ts/signature',
      });
    }

    const now = Date.now();
    if (typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({
        success: false,
        msg: 'ts 無效或已過期',
      });
    }

    const loweredAddress = String(address).toLowerCase();

    // 1) 綁定 message 與 payload
    const payloadForMsg = {
      address: loweredAddress,
      interviewId: String(interviewId),
      reason: String(reason),
      description: description ?? '',
      ts: Number(ts),
    };

    const canonical = stableStringify(payloadForMsg);
    const expectedMessage = `CreateInterviewDispute ${canonical}`;

    if (signature.message !== expectedMessage) {
      return res.status(400).json({
        success: false,
        msg: 'message 與 payload 不一致',
      });
    }

    // 2) 驗證簽名
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== loweredAddress) {
      return res.status(401).json({
        success: false,
        msg: '簽名驗證失敗',
      });
    }

    // 3) 直接查單筆 interview
    const targetInterview = await dbService.getInterviewById(interviewId);

    if (!targetInterview) {
      return res.status(404).json({
        success: false,
        msg: '找不到該面試紀錄',
      });
    }

    // 4) 確認這筆 interview 屬於該 seeker
    const invitationSeekerId = String(targetInterview.invitationId?.seekerId || '').toLowerCase();
    if (invitationSeekerId !== loweredAddress) {
      return res.status(403).json({
        success: false,
        msg: '你無權對此面試紀錄提出仲裁',
      });
    }

    // 5) interview result 必須已經公布
    if (targetInterview.result === 'pending') {
      return res.status(400).json({
        success: false,
        msg: '面試結果尚未公布，無法提出仲裁',
      });
    }

    // 6) 建立 dispute
    const dispute = await dbService.createInterviewDispute({
      interviewId: targetInterview._id,
      seekerAddress: loweredAddress,
      companyAddress: String(targetInterview.companyAddress).toLowerCase(),
      originalResult: targetInterview.result,
      reason,
      description: description || '',
    });

    // 7) 同步更新 interview 快取欄位
    await dbService.updateInterviewArbitrationStatus(targetInterview._id, {
      disputeStatus: 'submitted',
      arbitrationResult: null,
    });

    return res.json({
      success: true,
      msg: '仲裁申請建立成功',
      dispute,
    });
  } catch (err) {
    console.error('❌ createInterviewDispute 失敗:', err);

    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        msg: '此面試已存在尚未結案的仲裁申請',
      });
    }

    return res.status(500).json({
      success: false,
      msg: '建立仲裁申請失敗',
      error: err.toString(),
    });
  }
};

module.exports = {
  createInterview,
  deleteInterview,
  updateInterviewResultStart,
  updateInterviewResultFinish,
  listInterviewsByCompany,
  listInterviewsBySeeker,
  seekerConfirmOnchainStart,
  seekerConfirmOnchainFinish,
  createInterviewDispute
};
