export async function signData(data, privateKey) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(JSON.stringify(data));
  
    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      privateKey,
      encoded    // ✨直接給 encode 出來的資料，不要自己 hash
    );
  
    return btoa(String.fromCharCode(...new Uint8Array(signature))); // base64 格式
  }