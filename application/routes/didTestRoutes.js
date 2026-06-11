const express = require("express");
const router = express.Router();

const didService = require("../services/ethService");

function formatError(err) {
  return {
    message: err?.message,
    reason: err?.reason,
    code: err?.code,
    data: err?.data,
    receipt: err?.receipt
      ? {
          transactionHash: err.receipt.transactionHash,
          status: err.receipt.status,
          gasUsed: err.receipt.gasUsed,
          blockNumber: err.receipt.blockNumber,
        }
      : undefined,
    stack: err?.stack,
  };
}

function toJsonSafe(value) {
  return typeof value === "bigint" ? value.toString() : value;
}

router.post("/add-encrypted-csr", async (req, res) => {
  try {
    const { address, encryptedCSR, signature } = req.body;
    const { messageHash, v, r, s } = signature || {};

    if (!address || !encryptedCSR || !messageHash || v === undefined || !r || !s) {
      return res.status(400).json({
        success: false,
        operation: "addEncryptedCSR",
        error: "address, encryptedCSR, signature.messageHash, v, r, s are required",
      });
    }

    const result = await didService.addUserData(
      address,
      "CSR",
      encryptedCSR,
      messageHash,
      v,
      r,
      s
    );

    return res.json({
      success: true,
      operation: "addEncryptedCSR",
      transactionHash: result?.transactionHash,
      blockNumber: toJsonSafe(result?.blockNumber),
      gasUsed: toJsonSafe(result?.gasUsed),
    });
  } catch (err) {
    const errorInfo = formatError(err);
    console.error("[DID addEncryptedCSR ERROR]", errorInfo);

    return res.status(500).json({
      success: false,
      operation: "addEncryptedCSR",
      error: errorInfo,
    });
  }
});


// Add Encrypted App Key
router.post("/add-encrypted-app-key", async (req, res) => {
  try {
    const { address, encryptedAppKey, signature } = req.body;
    const { messageHash, v, r, s } = signature || {};

    if (!address || !encryptedAppKey || !messageHash || v === undefined || !r || !s) {
      return res.status(400).json({
        success: false,
        operation: "addEncryptedAppKey",
        error: "address, encryptedAppKey, signature.messageHash, v, r, s are required",
      });
    }

    const result = await didService.addUserData(
      address,
      "APP_KEY",
      encryptedAppKey,
      messageHash,
      v,
      r,
      s
    );

    return res.json({
      success: true,
      operation: "addEncryptedAppKey",
      transactionHash: result?.transactionHash,
      blockNumber: toJsonSafe(result?.blockNumber),
      gasUsed: toJsonSafe(result?.gasUsed),
    });
  } catch (err) {
    const errorInfo = formatError(err);
    console.error("[DID addEncryptedAppKey ERROR]", errorInfo);

    return res.status(500).json({
      success: false,
      operation: "addEncryptedAppKey",
      error: JSON.parse(
        JSON.stringify(errorInfo, (_, value) =>
          typeof value === "bigint" ? value.toString() : value
        )
      ),
    });
  }
});

// Get Encrypted CSR
router.post("/get-encrypted-csr", async (req, res) => {
  try {
    const { address, signature } = req.body;
    const { messageHash, v, r, s } = signature || {};

    if (!address || !messageHash || v === undefined || !r || !s) {
      return res.status(400).json({
        success: false,
        operation: "getEncryptedCSR",
        error: "address, signature.messageHash, v, r, s are required",
      });
    }

    const encryptedCSR = await didService.getUserData(
      address,
      "CSR",
      messageHash,
      v,
      r,
      s
    );

    return res.json({
      success: true,
      operation: "getEncryptedCSR",
      encryptedCSR,
    });
  } catch (err) {
    const errorInfo = formatError(err);
    console.error("[DID getEncryptedCSR ERROR]", errorInfo);
    return res.status(500).json({
      success: false,
      operation: "getEncryptedCSR",
      error: errorInfo,
    });
  }
});

// Get Encrypted App Key
router.post("/get-encrypted-app-key", async (req, res) => {
  try {
    const { address, signature } = req.body;
    const { messageHash, v, r, s } = signature || {};

    if (!address || !messageHash || v === undefined || !r || !s) {
      return res.status(400).json({
        success: false,
        operation: "getEncryptedAppKey",
        error: "address, signature.messageHash, v, r, s are required",
      });
    }

    const encryptedAppKey = await didService.getUserData(
      address,
      "APP_KEY",
      messageHash,
      v,
      r,
      s
    );

    return res.json({
      success: true,
      operation: "getEncryptedAppKey",
      encryptedAppKey,
    });
  } catch (err) {
    const errorInfo = formatError(err);
    console.error("[DID getEncryptedAppKey ERROR]", errorInfo);
    return res.status(500).json({
      success: false,
      operation: "getEncryptedAppKey",
      error: errorInfo,
    });
  }
});

// Get Identity Contract Address
router.get("/identity/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({
        success: false,
        operation: "getUserIdentityContractAddress",
        error: "address is required",
      });
    }

    const identityContractAddress =
      await didService.getUserIdentityContractAddress(address);

    return res.json({
      success: true,
      operation: "getUserIdentityContractAddress",
      identityContractAddress,
    });
  } catch (err) {
    const errorInfo = formatError(err);
    console.error("[DID get identity ERROR]", errorInfo);
    return res.status(500).json({
      success: false,
      operation: "getUserIdentityContractAddress",
      error: errorInfo,
    });
  }
});

module.exports = router;