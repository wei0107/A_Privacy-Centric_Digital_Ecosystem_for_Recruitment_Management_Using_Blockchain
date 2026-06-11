const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const testAccounts = require('../../../application/scripts/testAccounts');

const OUT = path.join(__dirname, 'addEncryptedCsrPayloads.json');

const encryptedCSR = {
  version: 'x25519-xsalsa20-poly1305',
  ephemPublicKey: 'LbYYLoQtcJeqKv8DCnlFzzVTgGwfqxarx6ZxxVOvw2w=',
  nonce: 'N+B8Xky/pSd7APHQz4aBTnVzsqwMg0O3',
  ciphertext: 'CeRR5M0ZDG8hP3Lp7D4MF9j616O2AhAIc0WMmIRcshLpFJxxwzNqbWpxomtv79gbZ8yBUFRZMLO42g2lPBYnUZawdNGWtPnQIiQwl7LR859mS4qwl/EVs2VbouW0F9/QwgGlbi0Gap1Z7MlH0btpdyPE2Y+ji4R/NCMvfnxf0ZPODEf1I1oFST67rvLXiV0T7k3prfter+4vIPDNTgwACmL4iTi6hlDxXNk6Xy0g2ljTpKDJyfnMxWWc4hl/4tT5IfX4sSHDbJYFi2mjtNCQiKZHAFs+g9ItGPH3IzMgSXkblpyfv63qOZTUMfh8cwLviKEU6JjDbPNLwo6vU4JJo5KzMcmXBKlGBxUysCU1Bsrc6XKHlOk4oTHAQkUOnisBa3wyOJqvDRDcGj1J0jtd9greKYtY2djB7wXPOngM9SoV2B4UhDCrdGmcZRPq7JAY/P7zI4gFDWXMO/n9L005K9UCfWPxD3xIHjCAiKEP3V6RqP+40xmSMFno91m41bBGoLDuV5/JTt/7D+hesyqzaBAi/w==',
};

const accounts = testAccounts.slice(0, 100);

const payloads = accounts.map((acc) => {
  const messageHash = ethers.keccak256(
    ethers.toUtf8Bytes(`AddEncryptedCSR:${acc.address}`)
  );

  const wallet = new ethers.Wallet(acc.privateKey);
  const sig = wallet.signingKey.sign(messageHash);

  return {
    address: acc.address,
    encryptedCSR: JSON.stringify(encryptedCSR),
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