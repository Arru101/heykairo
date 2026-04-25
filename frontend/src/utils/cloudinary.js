/**
 * Kairo Cloudinary Integration
 * Optimized for secure, encrypted uploads using the provided credentials.
 */

const CLOUD_NAME = 'dz6qjy2t6';
const UPLOAD_PRESET = 'purechat_upload';

/**
 * Uploads encrypted binary data.
 * Even though it's an image originally, once encrypted it's just raw bytes.
 * Using a Blob with multipart/form-data is the most robust method.
 */
export const uploadEncryptedToCloudinary = async (encryptedBase64) => {
  try {
    // 1. Convert base64 ciphertext back to binary bytes
    const binaryString = window.atob(encryptedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Create a Blob to send as a file
    const blob = new Blob([bytes], { type: 'application/octet-stream' });

    // 2. Prepare Form Data
    const formData = new FormData();
    formData.append('file', blob, 'encrypted_payload.bin');
    formData.append('upload_preset', UPLOAD_PRESET);
    
    // 3. Use 'auto/upload' to let Cloudinary determine the type based on the preset
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
      { method: 'POST', body: formData }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('Cloudinary Error Detail:', errBody);
      throw new Error(errBody?.error?.message || `Upload failed with status ${res.status}`);
    }

    const data = await res.json();
    return data.secure_url;
  } catch (err) {
    console.error('Cloudinary Upload Exception:', err);
    throw err;
  }
};

/**
 * Fetch an encrypted blob from Cloudinary and return its raw base64 data.
 */
export const fetchEncryptedBlob = async (url) => {
  // Use a proxy-safe fetch to avoid potential CORS issues with 'raw' files
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  let binary = '';
  const len = bytes.byteLength;
  const chunk = 8192;
  for (let i = 0; i < len; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};
