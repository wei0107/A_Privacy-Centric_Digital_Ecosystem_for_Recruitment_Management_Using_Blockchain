const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const fs = require('fs');

const kp = nacl.box.keyPair(); // Curve25519 (X25519) keypair, 32-byte each

const pub_b64 = util.encodeBase64(kp.publicKey);
const prv_b64 = util.encodeBase64(kp.secretKey);

// eth-sig-util decrypt() 常用的是「base64 字串私鑰」
// 你也可以把它包成 JSON 方便你存檔管理
const out = {
  x25519_pubkey_base64: pub_b64,
  x25519_privkey_base64: prv_b64,
};

console.log('ORG x25519 public key (base64):', pub_b64);
console.log('ORG x25519 private key (base64):', prv_b64);

fs.writeFileSync('org_x25519_keys.json', JSON.stringify(out, null, 2));
console.log('Saved to org_x25519_keys.json');
