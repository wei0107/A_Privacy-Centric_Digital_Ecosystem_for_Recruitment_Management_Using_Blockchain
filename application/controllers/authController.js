const fs = require('fs');
const path = require('path');
const ethService = require('../services/ethService');
const hyperledgerService = require('../services/hyperledgerService');
const naclUtil = require('tweetnacl-util');
const { Web3 } = require('web3');
const { execFileSync } = require('child_process');
const didConfig = require('../public/javascripts/did_config');
const web3 = new Web3();

function parseCsrCommonNameWithOpenSSL(csrPem) {
  // 1) 寫到暫存檔
  const tmpPath = `/tmp/csr_${Date.now()}_${Math.random().toString(16).slice(2)}.pem`;
  fs.writeFileSync(tmpPath, csrPem, { encoding: 'utf8', mode: 0o600 });

  try {
    // 2) openssl req -in xxx -noout -subject
    const out = execFileSync('openssl', ['req', '-in', tmpPath, '-noout', '-subject'], {
      encoding: 'utf8',
    }).trim();

    // out examples:
    // "subject=CN = alice"
    // "subject=CN=alice,O=...,C=TW"
    // "subject=/C=TW/O=.../CN=alice"
    const m =
      out.match(/CN\s*=\s*([^,\/]+)\s*(?:,|\/|$)/) ||   // CN = xxx
      out.match(/\/CN=([^\/]+)(?:\/|$)/);              // /CN=xxx
    if (!m) throw new Error(`Cannot parse CN from: ${out}`);

    return String(m[1]).trim();
  } finally {
    // 3) 清掉暫存
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

const registerDID = async (req, res) => {
  try {
    const { id, address, type, signature, encrypted_CSR, encrypted_KEY } = req.body;
    const userType = type === 'jobseeker' ? '1' : '2';
    const { messageHash, v, r, s } = signature;

    console.log("🧱 [Register] create User");
    await ethService.createUser(id, address, userType);

    console.log("📝 [Register] write CSR");
    await ethService.addUserData(address, "CSR", encrypted_CSR, messageHash, v, r, s);

    console.log("📝 [Register] write KEY");
    await ethService.addUserData(address, "APP_KEY", encrypted_KEY, messageHash, v, r, s);

    const csrVal = await ethService.getUserData(address, "CSR", messageHash, v, r, s);
    console.log("✅ [Register] CSR on chain:", csrVal);

    const keyVal = await ethService.getUserData(address, "APP_KEY", messageHash, v, r, s);
    console.log("✅ [Register] KEY on chain:", keyVal);

    return res.json({ success: true, msg: 'register DID successful' });
  } catch (err) {
    console.error("❌ [Register] register failed:", err);
    return res.status(500).json({ success: false, msg: 'register failed', error: err.toString() });
  }
};

const EthSigUtil = require('eth-sig-util');
const e = require('express');

const ORG_X25519_KEYS_PATH = path.join(__dirname, '..', 'secrets', 'org_x25519_keys.json');

function isZeroAddress(addr) {
  return typeof addr === 'string' && /^0x0{40}$/i.test(addr);
}

function decryptCsrWithOrgKey(encryptedCsrStringOrObj) {
  const keyJson = JSON.parse(fs.readFileSync(ORG_X25519_KEYS_PATH, 'utf8'));
  if (!keyJson.x25519_privkey_base64) {
    throw new Error('Missing x25519_privkey_base64 in org_x25519_keys.json');
  }

  const privKeyBytes = naclUtil.decodeBase64(keyJson.x25519_privkey_base64);

  const encryptedObj =
    typeof encryptedCsrStringOrObj === 'string'
      ? JSON.parse(encryptedCsrStringOrObj)
      : encryptedCsrStringOrObj;

  const csrPem = EthSigUtil.decrypt(encryptedObj, privKeyBytes);

  if (typeof csrPem !== 'string' || !csrPem.includes('BEGIN CERTIFICATE REQUEST')) {
    throw new Error('Decrypted data is not a CSR PEM');
  }

  return csrPem;
}

const registerApp = async (req, res) => {
  try {
    const { address, encryptedCSR, signature, type } = req.body;

    if (!address || !encryptedCSR || !signature || !signature.flat || !type) {
      return res.status(400).json({ success: false, msg: 'missing necessary fields(address/encryptedCSR/signature/type)' });
    } 
    // 1) DID-chain: confirm user exists
    console.log('🔍 [RegisterApp] check if DID user exists...');
    const identityAddress = await ethService.getUserIdentityContractAddress(address);
    if (!identityAddress || isZeroAddress(identityAddress)) {
      return res.status(404).json({ success: false, msg: 'DID user not found. Please register DID first.' });
    }

    // 2) Verify Ethereum signature (prove request is sent by the address owner)
    console.log('🔐 [RegisterApp] 驗證使用者簽名...');
    const message = `Submit RegisterApp for ${address}`;
    const recovered = web3.eth.accounts.recover(message, signature.flat);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, msg: '簽名驗證failed' });
    }

    // 3) Decrypt CSR with government(org) private key (x25519)
    console.log('🧩 [RegisterApp] 解密 CSR...');
    let csrPem;
    try {
      csrPem = decryptCsrWithOrgKey(encryptedCSR);
    } catch (e) {
      console.error('❌ [RegisterApp] CSR 解密failed:', e);
      return res.status(400).json({ success: false, msg: 'CSR 解密failed' });
    }

    // 4) Fabric CA: register + enroll with CSR; store ONLY certificate in server wallet
    console.log('🏷️ [RegisterApp] 申請 Fabric certificate (CSR-based enrollment)...');
    csrPem = decryptCsrWithOrgKey(encryptedCSR);

    // 3.5) Parse CSR CN as enrollmentId
    let enrollmentId;
    try {
      enrollmentId = parseCsrCommonNameWithOpenSSL(csrPem);
      console.log(`🧾 [RegisterApp] CSR CN(enrollmentId) = ${enrollmentId}`);
    } catch (e) {
      console.error('❌ [RegisterApp] CSR CN 解析failed:', e);
      return res.status(400).json({ success: false, msg: 'CSR CN 解析failed' });
    }

    // 4) Fabric CA: register + enroll with CSR; store ONLY certificate in server wallet
    await hyperledgerService.enrollByCsrAndStoreCert({
      enrollmentId,      // from CSR CN
      walletKey: address, // store cert by address
      userType: type,
      csrPem,
    });

    // 5) App-chain business register (executed by admin identity on server)
    console.log('⛓️ [RegisterApp] 寫入 App-chain user registry...');
    const exists = await hyperledgerService.checkIfUserExist(address, type);
    if (!exists) {
      await hyperledgerService.registerOnChain(address, type);
    } else {
      console.log(`✅ [RegisterApp] 使用者 ${address} 已存在，不用重複註冊`);
    }

    console.log('🎉 [RegisterApp] 註冊成功');
    return res.json({ success: true, msg: '註冊成功' });
  } catch (err) {
    console.error('❌ [RegisterApp] 註冊failed:', err);
    return res.status(500).json({ success: false, msg: '註冊failed', error: err.toString() });
  }
};

const getEncryptedCSR = async (req, res) => {
  try {
    const { address, signature } = req.body;

    const { messageHash, v, r, s } = signature;

    console.log("🔍 [getEncryptedCSR] 從 DID 讀取加密的 CSR...");
    const encryptedCSR = await ethService.getUserData(address, "CSR", messageHash, v, r, s);

    if (!encryptedCSR) {
      return res.status(404).json({ success: false, msg: '找不到加密的 CSR' });
    }

    return res.json({ success: true, encryptedCSR });
  } catch (err) {
    console.error('❌ 取得加密CSRfailed:', err);
    return res.status(500).json({ success: false, msg: '伺服器錯誤', error: err.toString() });
  }
};

const getEncryptedAppKey = async (req, res) => {
  try {
    const { address, signature } = req.body;

    const { messageHash, v, r, s } = signature;

    console.log("🔍 [getEncryptedAppKey] 從 DID 讀取加密的 App Private Key...");
    const encryptedAppKey = await ethService.getUserData(address, "APP_KEY", messageHash, v, r, s);

    if (!encryptedAppKey) {
      return res.status(404).json({ success: false, msg: '找不到加密的 App Private Key' });
    }

    return res.json({ success: true, encryptedAppKey });
  } catch (err) {
    console.error('❌ 取得加密APP_KEYfailed:', err);
    return res.status(500).json({ success: false, msg: '伺服器錯誤', error: err.toString() });
  }
};

const login = async (req, res) => {
  try {
    const { address, signature, type } = req.body;
    const loweredAddress = String(address).toLowerCase();
    // const governmentAddress = String(process.env.GOVERNMENT_ADDRESS || '').toLowerCase();
    const governmentAddress = String(didConfig.orgs.labor.address).toLowerCase();

    console.log('🔍 [Login] 確認 DID address 存在');
    const identityAddress = await ethService.getUserIdentityContractAddress(address);
    if (!identityAddress) {
      console.error('❌ DID address 不存在');
      return res.status(404).json({ success: false, msg: 'DID address not found' });
    }

    // 1) 驗證簽名
    console.log('🔍 [Login] 驗證使用者簽名...');
    const { flat } = signature;
    const message = `Login request for ${address}`;
    const recovered = web3.eth.accounts.recover(message, flat);

    if (recovered.toLowerCase() !== loweredAddress) {
      console.error('❌ 簽名驗證failed');
      return res.status(401).json({ success: false, msg: '簽名驗證failed' });
    }

    console.log('✅ 簽名驗證成功:', recovered);

    // 2) 先判斷是否為政府角色
    if (governmentAddress && loweredAddress === governmentAddress) {
      console.log('🏛️ [Login] Government login success');

      req.session.user = {
        address: loweredAddress,
        role: 'government',
        isLoggedIn: true,
      };

      return res.json({
        success: true,
        msg: '登入成功！',
        role: 'government',
      });
    }

    // 3) 非政府才走 seeker / enterprise 邏輯
    let typeID;
    if (type === 'jobseeker') {
      typeID = '1';
    } else if (type === 'enterprise') {
      typeID = '2';
    } else {
      return res.status(400).json({ success: false, msg: 'invalid login type' });
    }

    const exists = await hyperledgerService.checkIfUserExist(address, typeID);
    if (!exists) {
      console.error('❌ APP-chain not registered');
      return res.status(404).json({ success: false, msg: 'APP not registered' });
    } else {
      console.log(`✅ [Login] 使用者 ${address} status verified on APP-chain`);
    }

    req.session.user = {
      address: loweredAddress,
      role: type, // jobseeker / enterprise
      isLoggedIn: true,
    };

    return res.json({
      success: true,
      msg: '登入成功！',
      role: type,
    });

  } catch (err) {
    console.error('❌ 登入failed:', err);
    return res.status(500).json({ success: false, msg: '登入failed', error: err.toString() });
  }
};

const logout = (req, res) => {
  // 1. 銷毀當前 session
  req.session.destroy(err => {
    if (err) {
      console.error('❌ 登出時銷毀 session failed:', err);
      return res.status(500).json({ success: false, msg: '登出failed' });
    }

    // 2. （可選）清除 cookie
    res.clearCookie('connect.sid');  // 這樣瀏覽器上的 cookie 也一起清掉

    console.log('✅ 使用者成功登出');
    return res.json({ success: true, msg: '成功登出' });
  });
};

module.exports = { registerDID, registerApp, getEncryptedCSR , getEncryptedAppKey, login, logout };
