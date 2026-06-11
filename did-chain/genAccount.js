const fs = require('fs');

const input = fs.readFileSync('ganache_output.txt', 'utf-8');

// === 擷取帳號 ===
const accountSection = input.split('Available Accounts')[1].split('Private Keys')[0];
const addressRegex = /\(\d+\)\s+(0x[a-fA-F0-9]{40})/g;
const addresses = [];
let match;
while ((match = addressRegex.exec(accountSection)) !== null) {
  addresses.push(match[1]);
}

// === 擷取私鑰 ===
const keySection = input.split('Private Keys')[1].split('HD Wallet')[0];
const keyRegex = /\(\d+\)\s+(0x[a-fA-F0-9]{64})/g;
const privateKeys = [];
while ((match = keyRegex.exec(keySection)) !== null) {
  privateKeys.push(match[1]);
}

// === 組合 ===
if (addresses.length !== privateKeys.length) {
  console.error('❌ Address / Private key count mismatch.');
  process.exit(1);
}

const testAccounts = addresses.map((address, i) => ({
  address,
  privateKey: privateKeys[i],
}));

// === 輸出 ===
const content = `module.exports = ${JSON.stringify(testAccounts, null, 2)};\n`;
fs.writeFileSync('testAccounts.js', content);
console.log(`✅ 轉換成功，已輸出 ${testAccounts.length} 組帳號至 testAccounts.js`);
