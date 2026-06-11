const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const testAccounts = require('../../../application/scripts/testAccounts');

const OUT = path.join(__dirname, 'getEncryptedAppKeyPayloads.json');

const accounts = testAccounts.slice(0, 100);

const payloads = accounts.map((acc) => {
  const messageHash = ethers.keccak256(
    ethers.toUtf8Bytes(`GetEncryptedAppKey:${acc.address}`)
  );

  const wallet = new ethers.Wallet(acc.privateKey);
  const sig = wallet.signingKey.sign(messageHash);

  return {
    address: acc.address,
    signature: {
      messageHash,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    },
  };
});

fs.writeFileSync(OUT, JSON.stringify(payloads, null, 2));
console.log(`Generated ${payloads.length} payloads -> ${OUT}`);