// controllers/matchController.js
const axios = require('axios');

const MATCH_SERVICE_BASE = process.env.MATCH_SERVICE_BASE || "http://127.0.0.1:8082";

// ✅ /match/seeker?seekerId=0x...
// 轉打 matchService: /match/jobs-for-seeker/{seeker_address}
const getSeekerMatches = async (req, res) => {
  try {
    const { seekerId, topK } = req.query;
    if (!seekerId) {
      return res.status(400).json({ success: false, msg: '缺少 seekerId' });
    }

    const { data } = await axios.get(
      `${MATCH_SERVICE_BASE}/match/jobs-for-seeker/${encodeURIComponent(seekerId)}`,
      { params: { top_k: topK ? Number(topK) : 30 } }
    );

    // matchService 回傳 { seekerAddress, topK, matches: [...] } :contentReference[oaicite:5]{index=5}
    return res.json({ success: true, matches: data.matches });
  } catch (err) {
    console.error('❌ seeker→jobs 失敗:', err?.response?.data || err);
    return res.status(500).json({ success: false, msg: '查詢失敗' });
  }
};

// ✅ /match/company?jobId=...
// 轉打 matchService: /match/seekers-for-job/{job_id}
const getCompanyMatches = async (req, res) => {
  try {
    const { jobId, topK } = req.query;

    // ⚠️ 你舊版前端傳的是 companyId/position/department :contentReference[oaicite:6]{index=6}
    // 新版要改成傳 jobId 才能完全不靠 DB
    if (!jobId) {
      return res.status(400).json({ success: false, msg: '缺少 jobId（已改成用 jobId 查詢）' });
    }

    const { data } = await axios.get(
      `${MATCH_SERVICE_BASE}/match/seekers-for-job/${encodeURIComponent(jobId)}`,
      { params: { top_k: topK ? Number(topK) : 30 } }
    );

    // matchService 回傳 { jobId, topK, matches: [...] } :contentReference[oaicite:7]{index=7}
    return res.json({ success: true, matches: data.matches });
  } catch (err) {
    console.error('❌ job→seekers 失敗:', err?.response?.data || err);
    return res.status(500).json({ success: false, msg: '查詢失敗' });
  }
};

// ✅ 你不需要 runMatching（那是舊的 batch + DB）:contentReference[oaicite:8]{index=8}
const runMatching = async (req, res) => {
  return res.status(410).json({
    success: false,
    msg: '已改為 on-demand matching（MatchService + Qdrant），不再支援 runMatching / DB 寫入。',
  });
};

module.exports = {
  runMatching,
  getCompanyMatches,
  getSeekerMatches,
};