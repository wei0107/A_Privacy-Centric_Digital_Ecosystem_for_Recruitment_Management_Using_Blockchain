const { Web3 } = require('web3');
const dbService = require('../services/dbService');
const didConfig = require('../public/javascripts/did_config');
const hyperledgerService = require('../services/hyperledgerService');

const web3 = new Web3();

const VALID_ARBITRATION_RESULTS = [
  'support_seeker',
  'support_company',
  'partial_support',
  'unable_to_determine',
];

const LABOR_ADDRESS = String(
  didConfig?.orgs?.labor?.address || ''
).toLowerCase();

const normalizeAddress = (addr) => String(addr || '').toLowerCase().trim();

const getRequestAddress = (req) => {
  return normalizeAddress(req.body?.address || req.query?.address);
};

const getRequestSignatureFlat = (req) => {
  return (
    req.body?.signature?.flat ||
    req.body?.signatureFlat ||
    req.query?.signatureFlat ||
    ''
  );
};

const verifyGovernmentSignature = (address, signatureFlat, message) => {
  if (!address) {
    throw new Error('Missing address');
  }

  if (!signatureFlat) {
    throw new Error('Missing signature.flat');
  }

  if (!LABOR_ADDRESS) {
    throw new Error('Labor government address is not configured');
  }

  if (normalizeAddress(address) !== LABOR_ADDRESS) {
    throw new Error('Address is not labor government address');
  }

  const recovered = web3.eth.accounts.recover(message, signatureFlat);
  if (normalizeAddress(recovered) !== LABOR_ADDRESS) {
    throw new Error('Invalid government signature');
  }

  return true;
};

/**
 * ✅ Government: 取得所有仲裁
 * GET /government/arbitrations?address=0x...&signatureFlat=...
 *
 * 簽名訊息：
 * "GetAllArbitrations"
 */
const getAllArbitrations = async (req, res) => {
  try {
    const address = getRequestAddress(req);
    const signatureFlat = getRequestSignatureFlat(req);

    verifyGovernmentSignature(address, signatureFlat, 'GetAllArbitrations');

    const disputes = await dbService.getAllInterviewDisputes();

    return res.json({
      success: true,
      count: disputes.length,
      disputes,
    });
  } catch (err) {
    console.error('❌ [Arbitration] getAllArbitrations failed:', err);
    return res.status(500).json({
      success: false,
      msg: err.message || 'Failed to fetch arbitrations',
      error: err.toString(),
    });
  }
};

/**
 * ✅ Government: 取得單筆仲裁
 * GET /government/arbitrations/:id?address=0x...&signatureFlat=...
 *
 * 簽名訊息：
 * `GetArbitration:${id}`
 */
const getArbitrationById = async (req, res) => {
  try {
    const { id } = req.params;
    const address = getRequestAddress(req);
    const signatureFlat = getRequestSignatureFlat(req);

    verifyGovernmentSignature(address, signatureFlat, `GetArbitration:${id}`);

    const dispute = await dbService.getInterviewDisputeById(id);
    if (!dispute) {
      return res.status(404).json({
        success: false,
        msg: 'Arbitration not found',
      });
    }

    return res.json({
      success: true,
      dispute,
    });
  } catch (err) {
    console.error('❌ [Arbitration] getArbitrationById failed:', err);
    return res.status(500).json({
      success: false,
      msg: err.message || 'Failed to fetch arbitration',
      error: err.toString(),
    });
  }
};

/**
 * ✅ Government: 開始審查
 * PATCH /government/arbitrations/:id/review
 *
 * body:
 * {
 *   address: "0x...",
 *   signature: { flat: "0x..." }
 * }
 *
 * 簽名訊息：
 * `StartReviewArbitration:${id}`
 */
const startReviewArbitration = async (req, res) => {
  try {
    const { id } = req.params;
    const address = getRequestAddress(req);
    const signatureFlat = getRequestSignatureFlat(req);

    verifyGovernmentSignature(
      address,
      signatureFlat,
      `StartReviewArbitration:${id}`
    );

    const dispute = await dbService.getInterviewDisputeById(id);
    if (!dispute) {
      return res.status(404).json({
        success: false,
        msg: 'Arbitration not found',
      });
    }

    if (dispute.status === 'resolved') {
      return res.status(400).json({
        success: false,
        msg: 'This arbitration has already been resolved',
      });
    }

    const interviewId = dispute?.interviewId?._id || dispute?.interviewId;

    const updatedDispute = await dbService.updateInterviewDispute(id, {
      status: 'reviewing',
      reviewedBy: LABOR_ADDRESS,
    });

    await dbService.updateInterviewArbitrationStatus(interviewId, {
      disputeStatus: 'reviewing',
    });

    return res.json({
      success: true,
      msg: 'Arbitration status updated to reviewing',
      dispute: updatedDispute,
    });
  } catch (err) {
    console.error('❌ [Arbitration] startReviewArbitration failed:', err);
    return res.status(500).json({
      success: false,
      msg: err.message || 'Failed to update arbitration status',
      error: err.toString(),
    });
  }
};

/**
 * ✅ Government: 裁決仲裁
 * PATCH /government/arbitrations/:id/resolve
 *
 * body:
 * {
 *   address: "0x...",
 *   signature: { flat: "0x..." },
 *   arbitrationResult: "support_seeker" | "support_company" | "partial_support" | "unable_to_determine",
 *   arbitrationSummary: "..."
 * }
 *
 * 簽名訊息：
 * `ResolveArbitration:${id}:${arbitrationResult}:${arbitrationSummary || ''}`
 */
const resolveArbitration = async (req, res) => {
  try {
    const { id } = req.params;
    const { arbitrationResult, arbitrationSummary } = req.body;

    const address = getRequestAddress(req);
    const signatureFlat = getRequestSignatureFlat(req);

    if (!arbitrationResult) {
      return res.status(400).json({
        success: false,
        msg: 'Missing arbitrationResult',
      });
    }

    if (!VALID_ARBITRATION_RESULTS.includes(arbitrationResult)) {
      return res.status(400).json({
        success: false,
        msg: `Invalid arbitrationResult: ${arbitrationResult}`,
      });
    }

    const summaryText = arbitrationSummary || '';

    verifyGovernmentSignature(
      address,
      signatureFlat,
      `ResolveArbitration:${id}:${arbitrationResult}:${summaryText}`
    );

    const dispute = await dbService.getInterviewDisputeById(id);
    if (!dispute) {
      return res.status(404).json({
        success: false,
        msg: 'Arbitration not found',
      });
    }

    const interviewId = dispute?.interviewId?._id || dispute?.interviewId;
    const resolvedAt = new Date();

    // 1️⃣ 更新 dispute
    const updatedDispute = await dbService.updateInterviewDispute(id, {
      status: 'resolved',
      arbitrationResult,
      arbitrationSummary: summaryText,
      reviewedBy: LABOR_ADDRESS,
      resolvedAt,
    });

    // 2️⃣ 更新 interview cache
    await dbService.updateInterviewArbitrationStatus(interviewId, {
      disputeStatus: 'resolved',
      arbitrationResult,
    });

    // 3️⃣ 🔥 上鏈 (政府最終裁決)
    try {
      await hyperledgerService.recordArbitrationResult({
        arbitrationId: updatedDispute._id.toString(),
        interviewId: interviewId.toString(),
        companyAddress: dispute.companyAddress,
        seekerAddress: dispute.seekerAddress,
        result: arbitrationResult,
        reason: summaryText,
        resolvedBy: LABOR_ADDRESS,
        resolvedAt: resolvedAt.toISOString()
      });

      console.log("✅ Arbitration recorded on chain");

    } catch (chainErr) {
      console.error("⚠️ Failed to record arbitration on chain:", chainErr);
      // 不要 throw，避免 DB 成功但 chain fail
    }

    return res.json({
      success: true,
      msg: 'Arbitration resolved successfully',
      dispute: updatedDispute,
    });

  } catch (err) {
    console.error('❌ [Arbitration] resolveArbitration failed:', err);
    return res.status(500).json({
      success: false,
      msg: err.message || 'Failed to resolve arbitration',
      error: err.toString(),
    });
  }
};

/**
 * ✅ Government: 刪除仲裁
 * DELETE /government/arbitrations/:id
 *
 * body:
 * {
 *   address: "0x...",
 *   signature: { flat: "0x..." }
 * }
 *
 * 簽名訊息：
 * `DeleteArbitration:${id}`
 */
const deleteArbitration = async (req, res) => {
  try {
    const { id } = req.params;
    const address = getRequestAddress(req);
    const signatureFlat = getRequestSignatureFlat(req);

    verifyGovernmentSignature(
      address,
      signatureFlat,
      `DeleteArbitration:${id}`
    );

    const dispute = await dbService.getInterviewDisputeById(id);
    if (!dispute) {
      return res.status(404).json({
        success: false,
        msg: 'Arbitration not found',
      });
    }

    const interviewId = dispute?.interviewId?._id || dispute?.interviewId;

    await dbService.deleteInterviewDispute(id);

    await dbService.updateInterviewArbitrationStatus(interviewId, {
      disputeStatus: 'none',
      arbitrationResult: null,
    });

    return res.json({
      success: true,
      msg: 'Arbitration deleted successfully',
    });
  } catch (err) {
    console.error('❌ [Arbitration] deleteArbitration failed:', err);
    return res.status(500).json({
      success: false,
      msg: err.message || 'Failed to delete arbitration',
      error: err.toString(),
    });
  }
};

module.exports = {
  getAllArbitrations,
  getArbitrationById,
  startReviewArbitration,
  resolveArbitration,
  deleteArbitration,
};