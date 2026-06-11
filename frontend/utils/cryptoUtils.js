// src/utils/cryptoUtils.js
/* ────────────────────────────── 既有（政府 RSA-OAEP） ───────────────────────────── */

export async function loadOrgPublicKey() {
  const res = await fetch('/org_public_key.pem');
  return await res.text();
}

export async function importOrgPublicKey(pem) {
  const pemHeader = '-----BEGIN PUBLIC KEY-----';
  const pemFooter = '-----END PUBLIC KEY-----';
  const body      = pem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
  const der       = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki',
    der.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
}

export async function encryptWithOrgPublicKey(pubKey, data) {
  const enc = new TextEncoder();
  const buf = enc.encode(data);
  const encBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, buf);
  return arrayBufToB64(encBuf);
}

/* ──────────────────────────────  本機 ECDSA 簽章  ───────────────────────────── */
export async function importPrivateKeyFromJwk(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/* ───────────────────────────── AES-GCM 共用工具 ───────────────────────────── */
export async function deriveKey(password, salt) { /* …舊函式保持… */ }
export async function decryptData(encryptedData, password) { /* …舊函式保持… */ }

/* ╔══════════════════════════════════════════════════════════════╗
   ║            ★★★   新增：企業 Peer 端 ECDH 功能   ★★★           ║
   ╚══════════════════════════════════════════════════════════════╝ */

/** Uint8Array ⇆ base64 轉換小工具 */
export function arrayBufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
export function b64ToArrayBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/** JWK(EC 公鑰) → CryptoKey，用於 ECDH */
export async function importPeerPublicKey(jwk) {
  console.log('🔑 匯入對方公鑰 (JWK)：', jwk);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []                          // 只拿來 deriveBits，不需要 encrypt/decrypt
  );
}

/**
 * 跟對方公鑰做 ECDH，並使用 AES-GCM(256) 加密 plaintext。
 * @param {Object} peerJwk             對方 P-256 公鑰 (JWK, kty='EC')
 * @param {string|Uint8Array} plaintext
 * @returns {Object} { ciphertext (base64), iv (base64), tagLen,   // tag 已含在密文內
 *                    ephemeralPublicKey (JWK) }
 */
export async function ecEncryptWithPeer(peerJwk, plaintext) {
  /* 1️⃣ 匯入對方公鑰 */
  const peerKey = await importPeerPublicKey(peerJwk);

  /* 2️⃣ 產生本次的 Ephemeral keypair */
  const { publicKey: ephPub, privateKey: ephPriv } =
    await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

  /* 3️⃣ ECDH → 32 bytes shared secret */
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerKey },
    ephPriv,
    256
  );                       // ArrayBuffer(32)

  /* 4️⃣ 把 shared secret 哈成 AES-GCM 256 key */
  const aesKey = await crypto.subtle.importKey(
    'raw',
    shared,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  /* 5️⃣ 開始加密 */
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const enc       = new TextEncoder();
  const dataBuf   = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    dataBuf
  );

  /* 6️⃣ 輸出 */
  const ephJwk = await crypto.subtle.exportKey('jwk', ephPub);
  return {
    ciphertext        : arrayBufToB64(cipherBuf),      // GCM tag 已附在尾端
    iv                : arrayBufToB64(iv),
    tagLen            : 128,
    ephemeralPublicKey: ephJwk
  };
}
/*   ░░░░░░  新增：企業端用私鑰解密  ░░░░░░  */

/**
 * 企業端用自己的 **P-256 私鑰** + 求職者附帶的 `ephemeralPublicKey`
 * 透過 ECDH 衍生 AES-GCM key，解開 ciphertext。
 *
 * @param {Object}  myPrivateJwk         - 企業自己的 P-256 私鑰 (JWK)
 * @param {Object}  peerEphemeralJwk     - 求職者附帶的 Ephemeral 公鑰 (JWK)
 * @param {string}  ciphertextB64        - base64 (含 GCM tag)
 * @param {string}  ivB64                - base64 (12-bytes IV)
 * @returns {string} plaintext           - 解密後的原文字串 (UTF-8)
 */
export async function ecDecryptWithEphemeral(
  myPrivateJwk,
  peerEphemeralJwk,
  ciphertextB64,
  ivB64
) {
  /* 1️⃣ 匯入自己私鑰 & 對方 Ephemeral 公鑰 */
  const myPrivateJwkForECDH = {
    ...myPrivateJwk,
    key_ops: ['deriveBits'], // 👈 加這一行就好
  };
  const myPriv   = await crypto.subtle.importKey(
    'jwk',
    myPrivateJwkForECDH,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const peerPub  = await importPeerPublicKey(peerEphemeralJwk);

  /* 2️⃣ ECDH 產出 shared secret (32 bytes) */
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPub },
    myPriv,
    256
  );

  /* 3️⃣ shared secret → AES-GCM key */
  const aesKey = await crypto.subtle.importKey(
    'raw',
    shared,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  console.log('🔑 匯入的 AES-GCM key:', aesKey);
  /* 4️⃣ 解密 */
  const iv     = b64ToArrayBuf(ivB64);
  const cipher = b64ToArrayBuf(ciphertextB64);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    cipher
  );

  console.log('🔑 解密完成，原始資料長度:', plainBuf.byteLength);
  /* 5️⃣ 轉回字串 */
  const dec = new TextDecoder();
  return dec.decode(plainBuf);
}
