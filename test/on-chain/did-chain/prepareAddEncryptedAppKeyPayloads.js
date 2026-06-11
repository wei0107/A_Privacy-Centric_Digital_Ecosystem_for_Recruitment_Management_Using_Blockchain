const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const testAccounts = require('../../../application/scripts/testAccounts');

const OUT = path.join(__dirname, 'addEncryptedAppKeyPayloads.json');

const encryptedAppKey = {
  version: 'x25519-xsalsa20-poly1305',
  ephemPublicKey: 'XlKp9ypR9keMbDFjlPP4Iq7jtAp2Y0TdznX9nlfphRI=',
  nonce: '2R+1UJCd5WRK/lWev88PBY/5EKhZ2eZf',
  ciphertext: 'TkXcPpNaj4o1WB57NkDaUU2HoD7YAsoCXAnk4a8xVr9tZyXTrhlDVRTjubTLKneHFN4TRrNipd/FV8UCHsxwBVdaJSQKdsXr0m99jtL7Dpk5IGUX34OC/EDsMWC0aTriepodc1rXlnTzjAXdvstbfmFp/B18OjIZhwklRY3IavgR7Q1iUd2NKlcVeml15XlUF9ZK1qpKgW1Vyp4/z0+xQkJZxqOcMbQTyF65TlE/VjHRWmyosRs8liv0+QFvG9/S7oEge8/UDp+5Sf9wz2C8UFBcjtJakDSbd+U4USDpJqUZlb7LXWOi4Y1l099twaWy1aGsFwz8eBi4hgCEZTmEI5U=',
};

const accounts = testAccounts.slice(0, 100);

const payloads = accounts.map((acc) => {
  const messageHash = ethers.keccak256(
    ethers.toUtf8Bytes(`AddEncryptedAppKey:${acc.address}`)
  );

  const wallet = new ethers.Wallet(acc.privateKey);
  const sig = wallet.signingKey.sign(messageHash);

  return {
    address: acc.address,
    encryptedAppKey: JSON.stringify(encryptedAppKey),
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