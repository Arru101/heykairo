// Helper function to convert base64 to buffer
const base64ToArrayBuffer = (base64) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// Helper function to convert buffer to base64
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Derive a cryptographic key from a password using PBKDF2 + SHA-256
export const deriveKey = async (password) => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Fixed salt for symmetric key derivation (both sides must match)
  const salt = encoder.encode('kairo-e2e-salt-v2-2026');

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 250000, // Increased from 100k to 250k for better brute-force resistance
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// Encrypt a text message
export const encryptMessage = async (message, key) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encodedMessage
  );

  const encryptedBytes = new Uint8Array(encrypted);
  const packedData = new Uint8Array(iv.length + encryptedBytes.length);
  packedData.set(iv);
  packedData.set(encryptedBytes, iv.length);

  return arrayBufferToBase64(packedData);
};

// Decrypt a text message
export const decryptMessage = async (encryptedBase64, key) => {
  try {
    const data = base64ToArrayBuffer(encryptedBase64);
    const dataArray = new Uint8Array(data);
    const iv = dataArray.slice(0, 12);
    const encryptedData = dataArray.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    return '[Encrypted/Unreadable]';
  }
};

/**
 * Encrypt a raw file (image) using AES-GCM.
 * Returns a base64 string of the encrypted binary blob.
 * When uploaded to Cloudinary, it appears as garbage data — unreadable.
 */
export const encryptFile = async (file, key) => {
  const arrayBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    arrayBuffer
  );

  const encryptedBytes = new Uint8Array(encrypted);
  // Pack: [4 bytes mime length][mime bytes][12 bytes IV][encrypted data]
  const mimeEncoder = new TextEncoder();
  const mimeBytes = mimeEncoder.encode(file.type);
  const mimeLengthBytes = new Uint8Array(4);
  new DataView(mimeLengthBytes.buffer).setUint32(0, mimeBytes.length, false);

  const packed = new Uint8Array(
    4 + mimeBytes.length + 12 + encryptedBytes.length
  );
  packed.set(mimeLengthBytes, 0);
  packed.set(mimeBytes, 4);
  packed.set(iv, 4 + mimeBytes.length);
  packed.set(encryptedBytes, 4 + mimeBytes.length + 12);

  return arrayBufferToBase64(packed.buffer);
};

/**
 * Decrypt an encrypted file blob (base64) back into raw bytes.
 * Returns { bytes: Uint8Array, mimeType: string }
 */
export const decryptFile = async (encryptedBase64, key) => {
  try {
    const data = new Uint8Array(base64ToArrayBuffer(encryptedBase64));

    // Extract mime type
    const mimeLength = new DataView(data.buffer, 0, 4).getUint32(0, false);
    const mimeBytes = data.slice(4, 4 + mimeLength);
    const mimeType = new TextDecoder().decode(mimeBytes);

    // Extract IV
    const iv = data.slice(4 + mimeLength, 4 + mimeLength + 12);

    // Extract encrypted payload
    const encryptedData = data.slice(4 + mimeLength + 12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encryptedData
    );

    return { bytes: new Uint8Array(decrypted), mimeType };
  } catch {
    return null;
  }
};
