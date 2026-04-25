/**
 * Kairo Cloudinary Integration
 * Optimized for secure, encrypted uploads using the provided credentials.
 */

const CLOUD_NAME = 'dz6qjy2t6';
const UPLOAD_PRESET = 'purechat_upload';

/**
 * Uploads encrypted binary data.
 * Even though it's an image originally, once encrypted it's just raw bytes.
 * We use the 'auto' resource type so Cloudinary can handle it based on the preset.
 */
export const uploadEncryptedToCloudinary = async (encryptedBase64) => {
  // Use a proper data URI format. Cloudinary's unsigned upload via preset
  // is often picky about the resource_type matching the preset's settings.
  const dataUri = `data:application/octet-stream;base64,${encryptedBase64}`;

  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('upload_preset', UPLOAD_PRESET);
  
  // We specify 'auto' to let Cloudinary decide, but usually 'raw' is needed for ciphertext.
  // If the user's preset is set to 'Image', we might need to send it as an image.
  // Let's try the most compatible endpoint first.
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
