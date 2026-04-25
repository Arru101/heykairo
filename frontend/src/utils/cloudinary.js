export const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', 'purechat_upload'); // updated preset name

  try {
    const res = await fetch('https://api.cloudinary.com/v1_1/dz6qjy2t6/image/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary upload failed", error);
    return null;
  }
};
