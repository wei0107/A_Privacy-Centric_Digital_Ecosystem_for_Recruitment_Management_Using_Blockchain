const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const hyperledgerService = require('../services/hyperledgerService');
const testAccounts = require('./testAccounts'); // 依你的實際路徑調整

const OUTPUT_DIR = path.join(__dirname, '../../generated-appkeys');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' });
}

function safeName(address) {
  return address.toLowerCase().replace(/^0x/, '');
}

function generateP256KeyAndCsr(address) {
  const name = safeName(address);
  const userDir = path.join(OUTPUT_DIR, name);
  ensureDir(userDir);

  const keyPath = path.join(userDir, 'appkey.pem');
  const csrPath = path.join(userDir, 'appkey.csr');

  const enrollmentId = `${name}-appkey`;

  if (!fs.existsSync(keyPath)) {
    run('openssl', [
      'genpkey',
      '-algorithm', 'EC',
      '-pkeyopt', 'ec_paramgen_curve:P-256',
      '-out', keyPath,
    ]);
  }

  if (!fs.existsSync(csrPath)) {
    run('openssl', [
      'req',
      '-new',
      '-key', keyPath,
      '-out', csrPath,
      '-subj', `/CN=${enrollmentId}/OU=client`,
    ]);
  }

  return {
    enrollmentId,
    keyPath,
    csrPath,
    csrPem: fs.readFileSync(csrPath, 'utf8'),
  };
}

async function registerOne(account, type) {
  const address = account.address.toLowerCase();
  const { enrollmentId, keyPath, csrPath, csrPem } = generateP256KeyAndCsr(address);

  console.log('========================================');
  console.log(`🏷️ address      = ${address}`);
  console.log(`🧾 enrollmentId = ${enrollmentId}`);
  console.log(`🔑 keyPath       = ${keyPath}`);
  console.log(`📄 csrPath       = ${csrPath}`);

  await hyperledgerService.enrollByCsrAndStoreCert({
    enrollmentId,
    walletKey: address,
    userType: type,
    csrPem,
  });

  const exists = await hyperledgerService.checkIfUserExist(address, type);
  if (!exists) {
    await hyperledgerService.registerOnChain(address, type);
    console.log(`✅ Registered on app chain: ${address}`);
  } else {
    console.log(`✅ Already exists on app chain: ${address}`);
  }

  return {
    address,
    appKeyPemPath: keyPath,
    csrPath,
    enrollmentId,
  };
}

async function main() {
  try {
    const type = process.argv[2] || '1';          // 1 seeker, 2 company
    const start = Number(process.argv[3] || 0);   // 起始 index
    const count = Number(process.argv[4] || 10);  // 要幾筆

    ensureDir(OUTPUT_DIR);

    const selected = testAccounts.slice(start, start + count);
    if (selected.length === 0) {
      throw new Error('No accounts selected');
    }

    const results = [];
    for (const acc of selected) {
      const r = await registerOne(acc, type);
      results.push(r);
    }

    const outPath = path.join(OUTPUT_DIR, `registered_users_type${type}_${start}_${count}.json`);
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

    console.log('========================================');
    console.log(`🎉 Batch registration done`);
    console.log(`📦 Output saved to: ${outPath}`);
  } catch (err) {
    console.error('❌ registerBatchAppUsers failed:', err);
    process.exit(1);
  }
}

main();