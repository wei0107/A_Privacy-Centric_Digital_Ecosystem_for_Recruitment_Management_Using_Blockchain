const ipfsService = require('../services/ipfsService');
const dbService = require('../services/dbService');
const hyperledgerService = require('../services/hyperledgerService');
const { upsertSeekerAsync } = require('../services/qdrantClient');
const { Web3 } = require('web3');

const web3 = new Web3(); 

// --- helpers for deterministic hashing & anti-replay ---
const stableStringify = (obj) => {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

// 允許前端與後端時間差（避免因為時鐘些微不同就擋掉）
const TS_MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * 上傳履歷（改成 MetaMask ownership 驗證，移除假 CSR）
 * body: { address, resume, signature: { flat, message }, ts }
 */
const uploadResume = async (req, res) => {
  try {
    const { address, resume, signature, ts } = req.body;

    if (!resume || !address || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 resume/address/signature' });
    }

    // 0) ts window
    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // 1) hash resume (must match frontend)
    const resumeCanonical = stableStringify(resume);
    const resumeHash = web3.utils.sha3(resumeCanonical);

    const expectedMessage = `UploadResume for ${address.toLowerCase()} resumeHash=${resumeHash} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 resume 不一致' });
    }

    // 2) recover ownership
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 3) do business
    const ipfsHash = await ipfsService.uploadResume(resume);

    await dbService.uploadResume({
      address: address.toLowerCase(),
      resumeCid: ipfsHash
    });

    console.log(`✅ 使用者 ${address} 履歷上傳完成，CID: ${ipfsHash}`);
    return res.json({ success: true, ipfsHash });
  } catch (err) {
    console.error('❌ 上傳履歷失敗:', err);
    return res.status(500).json({ success: false, msg: '上傳失敗', error: err.toString() });
  }
};

/**
 * 更新履歷（改成 MetaMask ownership 驗證）
 * body: { address, newResume, signature: { flat, message }, ts }
 */
const updateResume = async (req, res) => {
  try {
    const { address, newResume, signature, ts } = req.body;

    if (!address || !newResume || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 address/newResume/signature' });
    }

    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    const resumeCanonical = stableStringify(newResume);
    const resumeHash = web3.utils.sha3(resumeCanonical);

    const expectedMessage = `UpdateResume for ${address.toLowerCase()} resumeHash=${resumeHash} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 newResume 不一致' });
    }

    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    const oldRecord = await dbService.getResume(address.toLowerCase());
    if (!oldRecord) {
      return res.status(404).json({ success: false, msg: '找不到原履歷紀錄，請先上傳' });
    }

    const newCid = await ipfsService.updateResume(oldRecord.resumeCid, newResume);
    await dbService.updateResume(address.toLowerCase(), newCid);

    console.log(`✅ 使用者 ${address} 履歷已更新，新CID: ${newCid}`);
    return res.json({ success: true, newCid });
  } catch (err) {
    console.error('❌ 更新履歷失敗:', err);
    return res.status(500).json({ success: false, msg: '更新失敗', error: err.toString() });
  }
};

/**
 * 刪除履歷（改成 MetaMask ownership 驗證）
 * body: { address, signature: { flat, message }, ts }
 */
const deleteResume = async (req, res) => {
  try {
    const { address, signature, ts } = req.body;

    if (!address || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 address/signature' });
    }

    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    const expectedMessage = `DeleteResume for ${address.toLowerCase()} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 address 不一致' });
    }

    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    const record = await dbService.getResume(address.toLowerCase());
    if (!record) {
      return res.status(404).json({ success: false, msg: '找不到履歷紀錄' });
    }

    await ipfsService.deleteResume(record.resumeCid);
    await dbService.deleteResume(address.toLowerCase());

    console.log(`✅ 使用者 ${address} 的履歷已刪除`);
    return res.json({ success: true, msg: '履歷刪除成功' });
  } catch (err) {
    console.error('❌ 刪除履歷失敗:', err);
    return res.status(500).json({ success: false, msg: '刪除失敗', error: err.toString() });
  }
};

/**
 * setAccessConfig - start
 * 驗證 MetaMask ownership → build proposal → 回 token + proposalBytesB64
 * body: { address, accessConfig, ts, signature:{flat,message} }
 */
const setAccessConfigStart = async (req, res) => {
  try {
    const { address, accessConfig, ts, signature } = req.body;

    if (!address || !accessConfig || !ts || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 address/accessConfig/ts/signature' });
    }

    const now = Date.now();
    if (typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // bind message to accessConfig
    const accessCanonical = stableStringify(accessConfig);
    const accessHash = web3.utils.sha3(accessCanonical);

    const expectedMessage = `SetAccessConfig(start) for ${address.toLowerCase()} accessHash=${accessHash} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 accessConfig 不一致' });
    }

    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // offline proposal for chaincode fcn = setAccessConfig
    const { token, proposalBytesB64 } = await hyperledgerService.offlineBuildProposal({
      address: address.toLowerCase(),
      type: '1',
      fcn: 'setAccessConfig',
      args: [address.toLowerCase(), JSON.stringify(accessConfig)],
    });

    return res.json({ success: true, token, proposalBytesB64 });
  } catch (err) {
    console.error('❌ setAccessConfigStart 失敗:', err);
    return res.status(500).json({ success: false, msg: 'start 失敗', error: err.toString() });
  }
};

/**
 * setAccessConfig - finish
 * - 有 commitSig 就送 commit
 * - 沒 commitSig 就送 endorsementSig 並回 commitBytesB64
 * body: { address, token, endorsementSignatureDerB64?, commitSignatureDerB64? }
 */
const setAccessConfigFinish = async (req, res) => {
  try {
    const { address, token, endorsementSignatureDerB64, commitSignatureDerB64 } = req.body;

    if (!address || !token) {
      return res.status(400).json({ success: false, msg: '缺少 address/token' });
    }

    if (commitSignatureDerB64) {
      const commitResp = await hyperledgerService.offlineSendCommit({
        token,
        address: address.toLowerCase(),
        commitSignatureDerB64,
      });
      return res.json({ success: true, commitResp });
    }

    if (!endorsementSignatureDerB64) {
      return res.status(400).json({ success: false, msg: '缺少 endorsementSignatureDerB64' });
    }

    const { commitBytesB64 } = await hyperledgerService.offlineSendEndorsementAndBuildCommit({
      token,
      address: address.toLowerCase(),
      endorsementSignatureDerB64,
    });

    return res.json({ success: true, commitBytesB64 });
  } catch (err) {
    console.error('❌ setAccessConfigFinish 失敗:', err);
    return res.status(500).json({ success: false, msg: 'finish 失敗', error: err.toString() });
  }
};

/**
 * 查詢履歷
 */
const getResume = async (req, res) => {
  try {
    const { address } = req.query; // 用 query string 帶 address
    if (!address) {
      return res.status(400).json({ success: false, msg: '缺少地址' });
    }

    console.log('🔍 正在查詢履歷, address=', address);
    const lowered = address.toLowerCase();

    // 查 DB 中是否有履歷
    const resumeRecord = await dbService.getResume(lowered);
    if (!resumeRecord) {
      return res.status(404).json({ success: false, msg: '找不到履歷紀錄' });
    }

    // 從 IPFS 抓履歷內容
    const resumeData = await ipfsService.getResume(resumeRecord.resumeCid);

    // 從鏈上抓 access 權限設定
    const accessResult = await hyperledgerService.getAccessConfig(lowered);
    console.log("accessResult:", accessResult);
    const access = accessResult?.data || null;

    return res.json({
      success: true,
      resume: resumeData,
      cid: resumeRecord.resumeCid,
      access,
    });
  } catch (err) {
    console.error('❌ 查詢履歷失敗:', err);
    return res.status(500).json({ success: false, msg: '查詢失敗', error: err.toString() });
  }
};

/**
 * 新增或更新求職者需求單（改成 MetaMask ownership 驗證）
 * body: { request, signature: { flat, message }, ts }
 */
const upsertRequest = async (req, res) => {
  try {
    const { request, signature, ts } = req.body;
    const { address } = request || {};

    if (!request || !address || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 request/address/signature' });
    }

    // 0) ts window（防重放基礎版）
    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // 1) 後端重算 requestHash（必做：避免只驗 message 而 message 沒綁內容）
    //    注意：前端把 availableFrom 轉 ISO string；DB 存 Date 也 OK
    const requestForHash = {
      address: String(request.address || '').toLowerCase(),
      position: request.position ?? '',
      expectedSalary: Number(request.expectedSalary),
      skills: Array.isArray(request.skills) ? [...request.skills].sort() : [],
      availableFrom: request.availableFrom ? new Date(request.availableFrom).toISOString() : null,
      location: request.location ?? '',
      notes: request.notes ?? '',
    };

    const requestCanonical = stableStringify(requestForHash);
    const requestHash = web3.utils.sha3(requestCanonical);

    // 2) 組出「你前端簽的同一個 message」，比對 signature.message
    const expectedMessage = `UpsertRequest for ${address} requestHash=${requestHash} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 request 不一致' });
    }

    // 3) recover 驗證 ownership（等同你 setEncryptedProfileStart）
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 4) 儲存（新增或更新）
    //    建議存 address 小寫，避免 DB 出現多份
    const saved = await dbService.saveJobSeekerRequest({
      ...request,
      address: address.toLowerCase(),
    });

    console.log(`✅ 使用者 ${address} 的需求單已儲存`);
    res.json({ success: true, request: saved });

    setImmediate(() => {
      upsertSeekerAsync(saved);
    });
  } catch (err) {
    console.error('❌ 儲存需求單失敗:', err);
    return res.status(500).json({ success: false, msg: '儲存失敗', error: err.toString() });
  }
};

/**
 * 查詢指定地址的需求單
 */
const getRequest = async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, msg: '缺少 address' });
    }

    const result = await dbService.getJobSeekerRequestByAddress(address.toLowerCase());
    if (!result) {
      return res.status(404).json({ success: false, msg: '查無資料' });
    }

    return res.json({ success: true, request: result });
  } catch (err) {
    console.error('❌ 查詢失敗:', err);
    return res.status(500).json({ success: false, msg: '查詢失敗', error: err.toString() });
  }
};

/**
 * 刪除求職者需求單（改成 MetaMask ownership 驗證）
 * body: { address, signature: { flat, message }, ts }
 */
const deleteRequest = async (req, res) => {
  try {
    const { address, signature, ts } = req.body || {};
    if (!address || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 address/signature' });
    }

    // 0) ts window（防重放基礎版）
    const now = Date.now();
    if (!ts || typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // 1) message 必須符合你前端簽的格式
    const expectedMessage = `DeleteRequest for ${address} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 address 不一致' });
    }

    // 2) recover 驗證 ownership
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 3) 刪 DB
    const deleted = await dbService.deleteJobSeekerRequestByAddress(address.toLowerCase());
    if (deleted.deletedCount === 0) {
      return res.status(404).json({ success: false, msg: '查無資料可刪除' });
    }

    console.log(`✅ 使用者 ${address} 的需求單已刪除`);
    res.json({ success: true, msg: '刪除成功' });

    // 4) 背景刪 Qdrant（你要記得 import deleteSeekerAsync 才不會噴錯）
    setImmediate(() => {
      deleteSeekerAsync(address.toLowerCase());
    });
  } catch (err) {
    console.error('❌ 刪除失敗:', err);
    return res.status(500).json({ success: false, msg: '刪除失敗', error: err.toString() });
  }
};

/**
 * 儲存加密的個人資料
 */
/**
 * setEncryptedProfile - step1 (start)
 * 驗證使用者簽名(ownership of address) → 建 proposal → 回 token + proposalHashHex
 */
const setEncryptedProfileStart = async (req, res) => {
  try {
    const { address, ciphertext, signature } = req.body;

    console.log("[start] key=", address.toLowerCase(), "ciphertextLen=", ciphertext.length);

    if (!address || !ciphertext || !signature?.flat) {
      return res.status(400).json({ success: false, msg: '缺少 address/ciphertext/signature.flat' });
    }

    // 1) 驗證簽名（證明 request 真的是 address 本人發的）
    // ⚠️ message 建議包含 ciphertext 的 hash，避免別人重放簽名去覆蓋資料
    const ciphertextHash = web3.utils.sha3(ciphertext); // keccak256
    const message = `SetEncryptedProfile(start) for ${address} ciphertextHash=${ciphertextHash}`;

    const recovered = web3.eth.accounts.recover(message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 2) 建 proposal（離線簽名：回傳 proposal hash 給前端用 key.pem 簽）
    const { token, proposalBytesB64 } = await hyperledgerService.offlineBuildProposal({
      address: address.toLowerCase(),
      type: '1',
      fcn: 'setEncryptedProfile',
      args: [address.toLowerCase(), ciphertext],
    });

    return res.json({ success: true, token, proposalBytesB64 });
  } catch (err) {
    console.error('❌ setEncryptedProfileStart 失敗:', err);
    return res.status(500).json({ success: false, msg: 'start 失敗', error: err.toString() });
  }
};

const setEncryptedProfileFinish = async (req, res) => {
  try {
    const { address, token, endorsementSignatureDerB64, commitSignatureDerB64 } = req.body;

    if (!address || !token) {
      return res.status(400).json({ success: false, msg: '缺少 address/token' });
    }

    // ✅ 第二段：有 commitSig 就直接送 commit，絕對不要再 build 新 commit
    if (commitSignatureDerB64) {
      const commitResp = await hyperledgerService.offlineSendCommit({
        token,
        address: address.toLowerCase(),
        commitSignatureDerB64,
      });
      return res.json({ success: true, commitResp });
    }

    // ✅ 第一段：沒有 commitSig 才需要 endorsementSig
    if (!endorsementSignatureDerB64) {
      return res.status(400).json({ success: false, msg: '缺少 endorsementSignatureDerB64' });
    }

    const { commitBytesB64 } = await hyperledgerService.offlineSendEndorsementAndBuildCommit({
      token,
      address: address.toLowerCase(),
      endorsementSignatureDerB64,
    });

    return res.json({ success: true, commitBytesB64 });
  } catch (err) {
    console.error('❌ setEncryptedProfileFinish 失敗:', err);
    return res.status(500).json({ success: false, msg: 'finish 失敗', error: err.toString() });
  }
};

/**
 * 取得加密的個人資料
 */
const getEncryptedProfile = async (req, res) => {
  try {
    const { address } = req.query;

    if (!address) {
      return res.status(400).json({ success: false, msg: '缺少地址' });
    }

    const result = await hyperledgerService.getEncryptedProfile(address.toLowerCase());

    // 取出真正的加密字串
    const rawCiphertext = result?.data?.ciphertext ?? '';
    console.log(`✅ [Controller] 成功取得 ${address} 的加密個人資料`);
    return res.json({ success: true, ciphertext: rawCiphertext });
  } catch (err) {
    console.error('❌ getEncryptedProfile 失敗:', err);
    return res.status(500).json({ success: false, msg: '取得失敗', error: err.toString() });
  }
};

/**
 * 查詢所有公司職缺
 */
const getAllJobs = async (req, res) => {
  try {
    const jobs = await dbService.getAllCompanyRequests();
    return res.json({ success: true, jobs });
  } catch (err) {
    console.error('❌ 取得所有職缺失敗:', err);
    return res.status(500).json({ success: false, msg: '查詢失敗', error: err.toString() });
  }
};

/**
 * 查詢求職者的所有邀請
 */
const getInvitationsForSeeker = async (req, res) => {
  try {
    const { seekerId } = req.query;
    if (!seekerId) {
      return res.status(400).json({ success: false, msg: '缺少 seekerId' });
    }

    const lowered = seekerId.toLowerCase();
    const invitations = await dbService.getInvitationsForSeeker(lowered);

    return res.json({ success: true, invitations });
  } catch (err) {
    console.error('❌ 查詢邀請失敗:', err);
    return res.status(500).json({ success: false, msg: '查詢邀請失敗', error: err.toString() });
  }
};

/**
 * 更新求職者邀請狀態（accepted / rejected）
 * body: { encryptedCSR, signature, invitationId, seekerId, newStatus }
 */
const updateInvitationStatus = async (req, res) => {
  try {
    const { invitationId, seekerId, newStatus, encryptedProfile, ts, signature } = req.body || {};

    if (!invitationId || !seekerId || !newStatus || !ts || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 invitationId/seekerId/newStatus/ts/signature' });
    }

    const ALLOWED = ['pending', 'accepted', 'rejected'];
    if (!ALLOWED.includes(newStatus)) {
      return res.status(400).json({ success: false, msg: '無效的邀請狀態' });
    }

    // 0) ts window（防重放基礎版）
    const now = Date.now();
    if (typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // 1) 確保 message 綁定內容（canonical payload）
    const payloadForMsg = {
      seekerId: String(seekerId || '').toLowerCase(),
      invitationId: String(invitationId || ''),
      newStatus: String(newStatus || ''),
      ts: Number(ts),
    };

    const canonical = stableStringify(payloadForMsg);
    const expectedMessage = `UpdateInvitationStatus ${canonical}`;

    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 payload 不一致' });
    }

    // 2) recover ownership
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== String(seekerId).toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 3) 找 invitation，確認真的是這個 seeker 的
    const inv = await dbService.getInvitationById(invitationId); // 你要實作
    if (!inv) return res.status(404).json({ success: false, msg: '找不到該邀請' });

    if (String(inv.seekerId).toLowerCase() !== String(seekerId).toLowerCase()) {
      return res.status(403).json({ success: false, msg: 'seekerId 不符合該邀請' });
    }

    // 4) accepted 必須帶 encryptedProfile（給公司看的密文）
    let updated;
    if (newStatus === 'accepted') {
      if (!encryptedProfile) {
        return res.status(400).json({ success: false, msg: 'accepted 必須帶 encryptedProfile' });
      }
      updated = await dbService.updateInvitationAccepted(invitationId, encryptedProfile); // 你要實作
    } else {
      updated = await dbService.updateInvitationStatus(invitationId, newStatus);
    }

    return res.json({ success: true, invitation: updated });
  } catch (err) {
    console.error('❌ updateInvitationStatus 失敗:', err);
    return res.status(500).json({ success: false, msg: '更新失敗', error: err.toString() });
  }
};

/**
 * 求職者應徵職缺
 * body: { encryptedCSR, signature, jobId, applyData }
 */
const applyJob = async (req, res) => {
  try {
    const { address, jobId, applyData, ts, signature } = req.body || {};

    if (!address || !jobId || !applyData || !ts || !signature?.flat || !signature?.message) {
      return res.status(400).json({ success: false, msg: '缺少 address/jobId/applyData/ts/signature' });
    }

    // 0) ts window（防重放）
    const now = Date.now();
    if (typeof ts !== 'number' || Math.abs(now - ts) > TS_MAX_SKEW_MS) {
      return res.status(400).json({ success: false, msg: 'ts 無效或已過期' });
    }

    // 1) canonicalize applyData（⚠️要和前端一致）
    const applyForHash = {
      address: String(applyData.address || '').toLowerCase(),
      expectedSalary: Number(applyData.expectedSalary),
      skills: Array.isArray(applyData.skills) ? [...applyData.skills].sort() : [],
      availableFrom: applyData.availableFrom ? new Date(applyData.availableFrom).toISOString() : null,
      location: applyData.location ?? '',
      notes: applyData.notes ?? '',
      position: applyData.position ?? '',
    };

    // address 一致性檢查（避免用別人的 address 簽名）
    if (String(address).toLowerCase() !== applyForHash.address) {
      return res.status(400).json({ success: false, msg: 'applyData.address mismatch' });
    }

    const applyCanonical = stableStringify(applyForHash);
    const applyHash = web3.utils.sha3(applyCanonical); // keccak256

    // 2) message 綁定內容
    const expectedMessage = `ApplyJob for ${String(address).toLowerCase()} jobId=${String(jobId)} applyHash=${applyHash} ts=${ts}`;
    if (signature.message !== expectedMessage) {
      return res.status(400).json({ success: false, msg: 'message 與 applyData 不一致' });
    }

    // 3) recover ownership
    const recovered = web3.eth.accounts.recover(signature.message, signature.flat);
    if (recovered.toLowerCase() !== String(address).toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證失敗' });
    }

    // 4) 存 DB（同一地址 + jobId 若已存在，則更新）
    const saved = await dbService.saveSeekerApply(String(jobId), String(address).toLowerCase(), {
      ...applyData,
      address: String(address).toLowerCase(),
    });

    console.log(`✅ 使用者 ${address} 應徵職缺 ${jobId} 完成`);
    return res.json({ success: true, application: saved });
  } catch (err) {
    console.error('❌ 應徵職缺失敗:', err);
    return res.status(500).json({ success: false, msg: '應徵失敗', error: err.toString() });
  }
};

module.exports = {
  uploadResume,
  getResume,
  updateResume,
  deleteResume,
  setAccessConfigStart,
  setAccessConfigFinish,
  upsertRequest,
  getRequest,
  deleteRequest,
  setEncryptedProfileStart,
  setEncryptedProfileFinish,
  getEncryptedProfile,
  getAllJobs,
  getInvitationsForSeeker,
  updateInvitationStatus,
  applyJob
};
