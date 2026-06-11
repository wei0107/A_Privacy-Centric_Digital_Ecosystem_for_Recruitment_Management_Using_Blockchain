// application/services/ipfsService.js  (CommonJS 檔案)

// 懶載入 ESM 的 ipfs-http-client（支援 v60+ 的 ESM-only）
let _ipfsClientPromise = null;

async function getIpfs() {
  if (!_ipfsClientPromise) {
    _ipfsClientPromise = import('ipfs-http-client').then(({ create }) => {
      const url = process.env.IPFS_API || 'http://127.0.0.1:5001';
      return create({ url });
    });
  }
  return _ipfsClientPromise;
}

/**
 * 上傳履歷物件（JSON）到 IPFS
 * @param {Object} resumeObj - 履歷資料
 * @returns {Promise<string>} - IPFS CID
 */
const uploadResume = async (resumeObj) => {
  const ipfs = await getIpfs();
  const jsonStr = JSON.stringify(resumeObj);
  const { cid } = await ipfs.add(jsonStr, { pin: true }); // 需要本地節點允許 pin
  const cidStr = cid.toString();
  console.log('✅ 履歷已上傳並固定 (pinned)，CID：', cidStr);
  return cidStr;
};

/**
 * 根據 CID 從 IPFS 讀取履歷 JSON
 * @param {string} cid - IPFS CID
 * @returns {Promise<Object>} - 還原的履歷物件
 */
const getResume = async (cid) => {
  const ipfs = await getIpfs();
  const stream = ipfs.cat(cid);
  const chunks = [];

  for await (const chunk of stream) {
    // chunk 可能是 Uint8Array，保險轉一下
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);
  const jsonStr = buffer.toString('utf8');
  const resumeObj = JSON.parse(jsonStr);

  console.log('📄 成功取得履歷內容：', resumeObj);
  return resumeObj;
};

/**
 * 更新履歷：
 * 1. 上傳新的履歷
 * 2. pin 新的 CID
 * 3. unpin 舊的 CID
 * @param {string} oldCid - 舊的履歷 CID
 * @param {Object} newResumeObj - 新的履歷資料
 * @returns {Promise<string>} - 新的 IPFS CID
 */
const updateResume = async (oldCid, newResumeObj) => {
  const ipfs = await getIpfs();

  // 1) 上傳新履歷並 pin
  const newJsonStr = JSON.stringify(newResumeObj);
  const { cid: newCidObj } = await ipfs.add(newJsonStr, { pin: true });
  const newCid = newCidObj.toString();
  console.log('✅ 新履歷已上傳並固定 (pinned)，新的 CID：', newCid);

  // 2) 解除舊履歷的 pin（若節點沒 pin 過會拋錯）
  try {
    await ipfs.pin.rm(oldCid);
    console.log(`🗑️ 舊履歷已取消固定 (unpin)，舊 CID：${oldCid}`);
  } catch (err) {
    console.warn(`⚠️ 取消舊履歷 pin 失敗（可能本來就沒 pin）：${oldCid} ；原因：${err.message}`);
  }

  return newCid;
};

/**
 * 刪除履歷（unpin本地的CID）
 * @param {string} cid - 要刪除的 IPFS CID
 */
const deleteResume = async (cid) => {
  const ipfs = await getIpfs();
  try {
    await ipfs.pin.rm(cid);
    console.log(`✅ 履歷已取消固定 (unpin)，CID：${cid}`);
  } catch (err) {
    console.warn(`⚠️ 取消履歷 pin 失敗（可能本來就沒 pin）：${cid} ；原因：${err.message}`);
  }
};

module.exports = {
  uploadResume,
  getResume,
  updateResume,
  deleteResume,
};
