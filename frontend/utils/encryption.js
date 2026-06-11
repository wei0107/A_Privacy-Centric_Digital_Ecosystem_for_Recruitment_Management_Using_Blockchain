import sodium from 'libsodium-wrappers';

export async function encryptForMetaMask(publicKeyBase64, message) {
  await sodium.ready;

  const recipientPublicKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const { publicKey: ephemPublicKey, privateKey: ephemPrivateKey } = sodium.crypto_box_keypair();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(
    message,
    nonce,
    recipientPublicKey,
    ephemPrivateKey
  );

  return {
    version: 'x25519-xsalsa20-poly1305',
    ephemPublicKey: sodium.to_base64(ephemPublicKey, sodium.base64_variants.ORIGINAL),
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
  };
}

export async function convertToMetaMaskHex(jsonString) {
  await sodium.ready;
  return '0x' + sodium.to_hex(sodium.from_string(jsonString));
}

export async function decryptWithMetaMask(encryptedCSR, account) {
  const hexString = await convertToMetaMaskHex(encryptedCSR);

  const decrypted = await window.ethereum.request({
    method: 'eth_decrypt',
    params: [hexString, account],
  });

  return decrypted;
}