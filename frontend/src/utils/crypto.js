// Helper function to convert base64 to buffer
const base64ToArrayBuffer = (base64) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper function to convert buffer to base64
const arrayBufferToBase64 = (buffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Derive a cryptographic key from a password
export const deriveKey = async (password) => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // We use a fixed salt for simplicity since this is symmetric and both users must compute the identical key from the password alone without sharing the salt.
  // In a truly zero-knowledge setup, the connection initiator sends the salt along with the request. We will use a fixed hardcoded salt here for rapid E2EE pairing.
  const salt = encoder.encode('purechat-salt-2026');

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptMessage = async (message, key) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    encodedMessage
  );

  // Pack the IV and the encrypted data together
  const encryptedBytes = new Uint8Array(encrypted);
  const packedData = new Uint8Array(iv.length + encryptedBytes.length);
  packedData.set(iv);
  packedData.set(encryptedBytes, iv.length);

  return arrayBufferToBase64(packedData);
};

export const decryptMessage = async (encryptedBase64, key) => {
  try {
    const data = base64ToArrayBuffer(encryptedBase64);
    const dataArray = new Uint8Array(data);
    
    // Extract the IV
    const iv = dataArray.slice(0, 12);
    const encryptedData = dataArray.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error("Decryption failed. Incorrect password likely.", error);
    return "[Encrypted/Unreadable]";
  }
};
