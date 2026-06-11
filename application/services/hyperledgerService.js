const { Gateway, Wallets } = require('fabric-network');
const FabricCaServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');
const mspOrg1 = 'Org1MSP';
const adminUserId = 'admin'; // CA admin 使用者
const adminUserPasswd = 'adminpw'; // CA admin 密碼
const FabricCommon = require('fabric-common');
const crypto = require('crypto');

function buildCcp(_ccpPath) {
    if (!fs.existsSync(_ccpPath)) {
        throw new Error(`no such file or directory: ${_ccpPath}`);
    }
    const contents = fs.readFileSync(_ccpPath, 'utf8');
    const ccp = JSON.parse(contents);
    console.log(`Loaded the network configuration located at ${_ccpPath}`);
    return ccp;
}

async function buildWallet(_wallets, _walletPath) {
    let wallet;
    if (_walletPath) {
        wallet = await Wallets.newFileSystemWallet(_walletPath);
        console.log(`Built a file system wallet at ${_walletPath}`);
    } else {
        wallet = await Wallets.newInMemoryWallet();
        console.log('Built an in-memory wallet');
    }
    return wallet;
}

function buildCaClient(_fabricCaServices, _ccp, _caHostName) {
    const caInfo = _ccp.certificateAuthorities[_caHostName];
    const caClient = new _fabricCaServices(caInfo.url, { verify: false }, caInfo.caName);
    console.log(`Built a CA Client named ${caInfo.caName}`);
    return caClient;
}

async function enrollAdmin(_caClient, _wallet, _orgMspId) {
    try {
        const identity = await _wallet.get(adminUserId);
        if (identity) {
            console.log('An identity for the admin user already exists in the wallet');
            return;
        }

        const enrollment = await _caClient.enroll({
            enrollmentID: adminUserId,
            enrollmentSecret: adminUserPasswd,
        });
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: _orgMspId,
            type: 'X.509',
        };
        await _wallet.put(adminUserId, x509Identity);
        console.log('Successfully enrolled admin user and imported it into the wallet');
    } catch (error) {
        console.error(`Failed to enroll admin user: ${error}`);
    }
}

/**
 * CSR-based enrollment:
 * - enrollmentId: used for Fabric-CA register/enroll (must match CSR CN)
 * - walletKey: how YOU index identities in server wallet (e.g., address)
 * - store ONLY certificate in wallet (no user private key)
 */
async function enrollByCsrAndStoreCert({ enrollmentId, walletKey, userType, csrPem }) {
  if (!enrollmentId || !walletKey || !csrPem) {
    throw new Error('enrollByCsrAndStoreCert requires enrollmentId, walletKey, csrPem');
  }

  // If certificate already exists in wallet (by walletKey), idempotent success.
  const walletPath = path.join(__dirname, 'wallet');
  const wallet = await buildWallet(Wallets, walletPath);

  const existing = await wallet.get(walletKey);
  if (existing && existing.credentials && existing.credentials.certificate) {
    console.log(`✅ [CA] Certificate for walletKey=${walletKey} already exists; skip enroll.`);
    return;
  }

  // Build CA client
  const ccpPath = path.resolve(
    __dirname,
    '..',
    '..',
    'app-chain',
    'fablo-target',
    'fabric-config',
    'connection-profiles',
    'connection-profile-org1.json'
  );
  const ccp = buildCcp(ccpPath);
  const caClient = buildCaClient(FabricCaServices, ccp, 'ca.org1.example.com');

  // Ensure admin enrolled
  await enrollAdmin(caClient, wallet, mspOrg1);

  // Admin context
  const adminIdentity = await wallet.get(adminUserId);
  if (!adminIdentity) throw new Error('CA admin identity missing in wallet');
  const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
  const adminUser = await provider.getUserContext(adminIdentity, adminUserId);

  // Register user (enrollmentId must match CSR CN)
  let secret;
  try {
    secret = await caClient.register(
      {
        enrollmentID: enrollmentId,
        affiliation: '',
        role: 'client',
        //attrs: [{ name: 'userType', value: String(userType ?? ''), ecert: true }],
        attrs: [{
          name: 'category',
          value: 'Peer',
          ecert: true
      }],
      },
      adminUser
    );
  } catch (e) {
    console.error(`❌ [CA] Failed to register enrollmentId=${enrollmentId}:`, e);
    throw e;
  }

  // Enroll with CSR (CSR CN must equal enrollmentId)
  const enrollment = await caClient.enroll({
    enrollmentID: enrollmentId,
    enrollmentSecret: secret,
    csr: csrPem,
  });

  // Store ONLY certificate, indexed by walletKey (e.g., address)
  const x509Identity = {
    credentials: {
      certificate: enrollment.certificate,
      // NOTE: intentionally NO privateKey here.
    },
    mspId: mspOrg1,
    type: 'X.509',
  };

  await wallet.put(walletKey, x509Identity);
  console.log(`✅ [CA] Stored certificate for walletKey=${walletKey} (enrollmentId=${enrollmentId}) in server wallet.`);
}

async function fabricInit(_type) {
    const channelName = 'access-control-channel';
    //const chaincodeName = _type === '1' ? 'person-access-control-chaincode' : 'enterprise-access-control-chaincode';
    let chaincodeName;

    if (_type === '1') {
      chaincodeName = 'person-access-control-chaincode';
    } else if (_type === '2') {
      chaincodeName = 'enterprise-access-control-chaincode';
    } else if (_type === '3') {
      chaincodeName = 'government-management-chaincode';
    } else {
      throw new Error('unknown chaincode type');
    }

    const ccpPath = path.resolve(
        __dirname,
        '..',
        '..',
        'app-chain',
        'fablo-target',
        'fabric-config',
        'connection-profiles',
        'connection-profile-org1.json'
    );
    const ccp = buildCcp(ccpPath);
    const caClient = buildCaClient(FabricCaServices, ccp, 'ca.org1.example.com');

    const walletPath = path.join(__dirname, 'wallet');
    const wallet = await buildWallet(Wallets, walletPath);

    // Ensure admin identity exists in server wallet
    await enrollAdmin(caClient, wallet, mspOrg1);

    // IMPORTANT: server does NOT hold user private keys, so all gateway submissions here use admin identity.
    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: adminUserId,
        discovery: { enabled: true, asLocalhost: true },
    });

    const network = await gateway.getNetwork(channelName);
    const contract = network.getContract(chaincodeName);
    return { gateway, contract, caClient, wallet, ccp };
}

async function checkIfUserExist(address, type) {
    const { gateway, contract } = await fabricInit(type);
    try {
        if (type === '1') {
            const result = await contract.evaluateTransaction('checkUserExist', address);
            console.log(`🔎 [PersonChaincode] checkUserExist(${address}) 結果:`, result.toString());
            return result.toString() === 'true';
        } else if (type === '2') {
            const result = await contract.evaluateTransaction('checkEnterpriseExist', address);
            console.log(`🔎 [EnterpriseChaincode] checkEnterpriseExist(${address}) 結果:`, result.toString());
            return result.toString() === 'true';
        } else {
            throw new Error(`未知的 type: ${type}`);
        }
    } catch (err) {
        console.error(`❌ [Chaincode] checkIfUserExist(${address}) 失敗:`, err.message);
        throw err;
    } finally {
        gateway.disconnect();
    }
}

async function registerOnChain(address, type) {
    const { gateway, contract } = await fabricInit(type);
    try {
        if (type === '1') {
            const result = await contract.submitTransaction('registerUser', address);
            console.log(`✅ [Chaincode] Personal user register(${address}) 成功:`, result.toString());
        } else if (type === '2') {
            const result = await contract.submitTransaction('registerEnterprise', address);
            console.log(`✅ [Chaincode] Enterprise register(${address}) 成功:`, result.toString());
        }
    } finally {
        gateway.disconnect();
    }
}

const _offlineTxCache = new Map(); 
// token -> { gateway, channel, endorsement, userContext, type, chaincodeName, createdAt }
const OFFLINE_TTL_MS = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [token, ctx] of _offlineTxCache.entries()) {
    if (now - ctx.createdAt > OFFLINE_TTL_MS) {
      try { ctx.gateway?.disconnect(); } catch {}
      _offlineTxCache.delete(token);
    }
  }
}, 60 * 1000);

function _b64(buf) { return Buffer.from(buf).toString('base64'); }
function _fromB64(b64) { return Buffer.from(b64, 'base64'); }
function _sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function _buildUserContextFromWalletCert(gateway, wallet, address) {
  const userJson = await wallet.get(address);
  //console.log('User JSON from wallet:', userJson);
  if (!userJson?.credentials?.certificate) {
    throw new Error(`No certificate in server wallet for address=${address}`);
  }
  const certPem = userJson.credentials.certificate;
  require('fs').writeFileSync('/tmp/user_cert.pem', certPem);
  const user = FabricCommon.User.createUser(
    address,
    null,
    userJson.mspId,
    userJson.credentials.certificate,
    null
  );
  //console.log('User:', user);
  return gateway.client.newIdentityContext(user);
}

/**
 * 1) 建 proposal bytes -> hash -> 回傳給前端簽名
 * @returns { token, proposalHashHex }
 */
async function offlineBuildProposal({ address, type, fcn, args }) {
  const { gateway, wallet } = await fabricInit(type);
  const channel = (await gateway.getNetwork('access-control-channel')).getChannel();
  const chaincodeName = type === '1'
    ? 'person-access-control-chaincode'
    : 'enterprise-access-control-chaincode';

  const userContext = await _buildUserContextFromWalletCert(gateway, wallet, address);

  const endorsement = channel.newEndorsement(chaincodeName);
  const proposalBytes = endorsement.build(userContext, { fcn, args });

  const proposalBytesB64 = Buffer.from(proposalBytes).toString('base64');

  const token = crypto.randomBytes(24).toString('hex');
  _offlineTxCache.set(token, {
    address, gateway, channel, endorsement, userContext, type, chaincodeName, createdAt: Date.now()
  });

  return { token, proposalBytesB64 };
}

/**
 * 2) 吃 endorsementSig -> 送 endorsement -> build commit -> hash -> 回傳給前端簽名
 * @returns { commitHashHex }
 */
async function offlineSendEndorsementAndBuildCommit({ token, address, endorsementSignatureDerB64 }) {
  const ctx = _offlineTxCache.get(token);
  if (!ctx) throw new Error('Invalid or expired token');

  if (!address) throw new Error('Missing address');
  if (ctx.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Token/address mismatch');
  }

  const { endorsement, channel, userContext } = ctx;

  // 使用「對 proposalBytes 的簽名 DER」
  endorsement.sign(Buffer.from(endorsementSignatureDerB64, 'base64'));

  await endorsement.send({ targets: channel.getEndorsers('Org1MSP') });

  const commit = endorsement.newCommit();
  const commitBytes = commit.build(userContext);
  const commitBytesB64 = Buffer.from(commitBytes).toString('base64');

  ctx.commit = commit;

  return { commitBytesB64 };
}

/**
 * 3) 吃 commitSig -> 送 commit -> 結束
 */
async function offlineSendCommit({ token, address, commitSignatureDerB64 }) {
  const ctx = _offlineTxCache.get(token);
  if (!ctx) throw new Error('Invalid or expired token');

  if (!address) throw new Error('Missing address');
  if (ctx.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Token/address mismatch');
  }

  const { commit, channel, gateway } = ctx;
  if (!commit) throw new Error('Commit not built yet');

  commit.sign(_fromB64(commitSignatureDerB64));
  const resp = await commit.send({
    requestTimeout: 300000,
    targets: channel.getCommitters(),
  });

  // cleanup
  try { gateway.disconnect(); } catch {}
  _offlineTxCache.delete(token);
  console.log("[offlineSendCommit] resp=", resp);
  return resp; // 依需求回傳
}

async function setEncryptedProfile(address, ciphertext) {
    const { gateway, contract } = await fabricInit('1');
    try {
        const result = await contract.submitTransaction('setEncryptedProfile', address, ciphertext);
        console.log(`✅ [Chaincode] setEncryptedProfile(${address}) 成功`);
        return result.toString();
    } catch (err) {
        console.error(`❌ [Chaincode] setEncryptedProfile(${address}) 失敗:`, err.message);
        throw err;
    } finally {
        gateway.disconnect();
    }
}

async function getEncryptedProfile(address) {
    const { gateway, contract } = await fabricInit('1');
    try {
        const result = await contract.evaluateTransaction('getEncryptedProfile', address);
        console.log(`✅ [Chaincode] getEncryptedProfile(${address}) 成功`);
        return JSON.parse(result.toString());
    } catch (err) {
        console.error(`❌ [Chaincode] getEncryptedProfile(${address}) 失敗:`, err.message);
        throw err;
    } finally {
        gateway.disconnect();
    }
}

async function setAccessConfig(address, accessJson) {
    const { gateway, contract } = await fabricInit('1');
    try {
        const result = await contract.submitTransaction('setAccessConfig', address, accessJson);
        console.log(`✅ [Chaincode] setAccessConfig(${address}) 成功`);
        return result.toString();
    } catch (err) {
        console.error(`❌ [Chaincode] setAccessConfig(${address}) 失敗:`, err.message);
        throw err;
    } finally {
        gateway.disconnect();
    }
}

async function getAccessConfig(address) {
    const { gateway, contract } = await fabricInit('1');
    try {
        const result = await contract.evaluateTransaction('getAccessConfig', address);
        console.log(`✅ [Chaincode] getAccessConfig(${address}) 成功`);
        return JSON.parse(result.toString());
    } catch (err) {
        console.error(`❌ [Chaincode] getAccessConfig(${address}) 失敗:`, err.message);
        throw err;
    } finally {
        gateway.disconnect();
    }
}

/* ==========================================================
 * 🆕  面試結果 API ── Person / Enterprise 共用邏輯
 * ========================================================== */

/**
 * 通用：寫入面試結果
 * @param {string} address   user 或 enterprise address
 * @param {string} type      '1' = seeker, '2' = enterprise
 * @param {Object} payload   面試結果物件
 */
async function _addInterviewResult(address, type, payload) {
  const { gateway, contract } = await fabricInit(type);
  try {
    const result = await contract.submitTransaction(
      'addInterviewResult',
      address,
      JSON.stringify(payload)
    );
    console.log(`✅ [Chaincode] addInterviewResult(${address}) 成功`);
    return result.toString();
  } catch (err) {
    console.error(`❌ [Chaincode] addInterviewResult(${address}) 失敗:`, err.message);
    throw err;
  } finally {
    gateway.disconnect();
  }
}

/**
 * 通用：取得面試結果列表
 */
async function _getInterviewResults(address, type) {
  const { gateway, contract } = await fabricInit(type);
  try {
    const result = await contract.evaluateTransaction(
      'getInterviewResults',
      address
    );
    console.log(`✅ [Chaincode] getInterviewResults(${address}) 成功`);
    return JSON.parse(result.toString());
  } catch (err) {
    console.error(`❌ [Chaincode] getInterviewResults(${address}) 失敗:`, err.message);
    throw err;
  } finally {
    gateway.disconnect();
  }
}
  
/* ---------- 求職者（type = '1'） ---------- */

async function addInterviewResultForSeeker(seekerAddress, resultObj) {
  /**
   * resultObj 欄位：
   *   - position
   *   - company
   *   - department
   *   - seekerAddress  ← 企業在鏈碼裡的 companyAddress 被換成 seekerAddress
   *   - result         (pass / fail / pending)
   */
  return _addInterviewResult(seekerAddress, '1', resultObj);
}

async function getInterviewResultsForSeeker(seekerAddress) {
  return _getInterviewResults(seekerAddress, '1');
}

/* ---------- 企業（type = '2'） ---------- */

async function addInterviewResultForEnterprise(enterpriseAddress, resultObj) {
  /**
   * resultObj 欄位：
   *   - position
   *   - seekerAddress  ← 與求職者版本對應
   *   - department
   *   - result         (pass / fail / pending)
   */
  return _addInterviewResult(enterpriseAddress, '2', resultObj);
}

async function getInterviewResultsForEnterprise(enterpriseAddress) {
  return _getInterviewResults(enterpriseAddress, '2');
}

async function recordArbitrationResult(arbitrationObj) {
  const { gateway, contract } = await fabricInit('3');

  try {
    const result = await contract.submitTransaction(
      'recordArbitrationResult',
      JSON.stringify(arbitrationObj)
    );

    console.log(`✅ [Chaincode] recordArbitrationResult 成功`);
    return result.toString();

  } catch (err) {
    console.error(`❌ recordArbitrationResult 失敗:`, err.message);
    throw err;

  } finally {
    gateway.disconnect();
  }
}
  
module.exports = {
    enrollByCsrAndStoreCert,
    registerOnChain,
    checkIfUserExist,
    setEncryptedProfile,
    getEncryptedProfile,
    setAccessConfig,
    getAccessConfig,
    addInterviewResultForSeeker,
    getInterviewResultsForSeeker,
    addInterviewResultForEnterprise,
    getInterviewResultsForEnterprise,
    offlineBuildProposal,
    offlineSendEndorsementAndBuildCommit,
    offlineSendCommit,
    recordArbitrationResult
};