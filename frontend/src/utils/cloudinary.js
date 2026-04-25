/**
 * Kairo Cloudinary Integration
 * Uploads encrypted binary data as a base64 data URI (most reliable method).
 * Cloudinary only ever sees ciphertext — never the original image.
 */
export const uploadEncryptedToCloudinary = async (encryptedBase64) => {
  // Wrap as a data URI so Cloudinary accepts it via auto-detect
  const dataUri = `data:application/octet-stream;base64,${encryptedBase64}`;

  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('upload_preset', 'purechat_upload');

  const res = await fetch(
    'https://api.cloudinary.com/v1_1/dz6qjy2t6/raw/upload',
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Cloudinary: ${msg}`);
  }

  const data = await res.json();
  if (!data.secure_url) throw new Error('No URL returned from Cloudinary');
  return data.secure_url;
};

/**
 * Fetch an encrypted blob from Cloudinary and return its raw base64 data.
 * Uses no-cors workaround via a proxy-style direct fetch with proper headers.
 */
export const fetchEncryptedBlob = async (url) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // chunk to avoid call stack overflow on large files
  const chunk = 8192;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};
