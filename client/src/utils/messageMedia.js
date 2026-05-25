const IMAGE_TYPES = /^image\//;
const VIDEO_TYPES = /^video\//;
const AUDIO_TYPES = /^audio\//;

export const detectMessageType = (file) => {
  if (!file) return 'file';
  if (IMAGE_TYPES.test(file.type)) return 'image';
  if (VIDEO_TYPES.test(file.type)) return 'video';
  if (AUDIO_TYPES.test(file.type) || file.name?.endsWith('.webm')) return 'voice';
  if (AUDIO_TYPES.test(file.type)) return 'audio';
  return 'file';
};

export const formatFileSize = (bytes = 0) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const compressImageFile = async (file, { maxWidth = 1280, quality = 0.82 } = {}) => {
  if (!file || !IMAGE_TYPES.test(file.type) || file.type === 'image/gif') return file;
  if (file.size < 180_000) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Image compression failed'))), 'image/jpeg', quality);
  });

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
};

export const prepareUploadFile = async (file) => {
  const type = detectMessageType(file);
  if (type === 'image') return compressImageFile(file);
  return file;
};

export const compressProfilePhoto = (file) => compressImageFile(file, { maxWidth: 512, quality: 0.78 });
