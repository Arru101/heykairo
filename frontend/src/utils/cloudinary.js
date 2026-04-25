/**
 * Kairo Cloudinary Integration
 * Uploads encrypted binary blobs as raw files.
 * The server never sees the original image — only encrypted binary data.
 */
export const uploadEncryptedToCloudinary = async (encryptedBase64) => {
  try {
    // Convert base64 encrypted blob to a raw binary Blob
    const binary = atob(encryptedBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Upload as application/octet-stream (raw binary, not an image)
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob, 'kairo_encrypted.bin');
    formData.append('upload_preset', 'purechat_upload');
    formData.append('resource_type', 'raw');

    const res = await fetch(
      'https://api.cloudinary.com/v1_1/dz6qjy2t6/raw/upload',
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    return data.secure_url || null;
  } catch {
    return null;
  }
};

/**
 * Fetch an encrypted blob from Cloudinary and return its raw base64 data.
 */
export const fetchEncryptedBlob = async (url) => {
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
};
