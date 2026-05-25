/**
 * Centralized Cloudinary media service for AquaChat.
 *
 * Uses **unsigned uploads** directly from the browser → Cloudinary CDN.
 * No server round-trip for uploads — only the delete operation requires
 * the server-side API secret.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '';

const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Upload any file to Cloudinary.
 *
 * @param {File|Blob} file
 * @param {object}    options
 * @param {string}    [options.folder]        – Cloudinary folder path
 * @param {string}    [options.resourceType]  – 'image' | 'video' | 'auto' (default 'auto')
 * @param {function}  [options.onProgress]    – called with 0–100
 * @returns {Promise<{ url: string, secureUrl: string, publicId: string, resourceType: string, width: number, height: number, format: string, bytes: number }>}
 */
export const uploadToCloudinary = (file, { folder, resourceType = 'auto', onProgress } = {}) => {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return Promise.reject(new Error('Cloudinary is not configured. Check VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.'));
  }

  return new Promise((resolve, reject) => {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    if (folder) formData.append('folder', folder);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    // Real upload progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      });
    }

    // Timeout
    const timer = setTimeout(() => {
      xhr.abort();
      reject(new Error('Upload timed out. Check your internet connection.'));
    }, UPLOAD_TIMEOUT_MS);

    xhr.addEventListener('load', () => {
      clearTimeout(timer);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({
            url: data.secure_url || data.url,
            secureUrl: data.secure_url || data.url,
            publicId: data.public_id,
            resourceType: data.resource_type || resourceType,
            width: data.width || 0,
            height: data.height || 0,
            format: data.format || '',
            bytes: data.bytes || file.size
          });
        } catch (parseError) {
          reject(new Error('Invalid response from Cloudinary.'));
        }
      } else {
        let message = 'Upload failed.';
        try {
          const errData = JSON.parse(xhr.responseText);
          message = errData?.error?.message || message;
        } catch (_) { /* ignore */ }
        reject(new Error(message));
      }
    });

    xhr.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Network error during upload. Check your connection.'));
    });

    xhr.addEventListener('abort', () => {
      clearTimeout(timer);
      // Reject only if not already rejected by timeout
    });

    xhr.send(formData);
  });
};

/**
 * Upload an image to Cloudinary.
 */
export const uploadImageToCloudinary = (file, { folder, onProgress } = {}) =>
  uploadToCloudinary(file, { folder, resourceType: 'image', onProgress });

/**
 * Upload a video to Cloudinary.
 */
export const uploadVideoToCloudinary = (file, { folder, onProgress } = {}) =>
  uploadToCloudinary(file, { folder, resourceType: 'video', onProgress });

/**
 * Transform a Cloudinary URL to add optimisation parameters.
 * Returns the original URL unchanged if it is not a Cloudinary URL.
 *
 * @param {string} url
 * @param {object} options
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {string} [options.quality]  – 'auto' | 'auto:low' | number
 * @param {string} [options.format]   – 'auto' | 'webp' | 'avif'
 * @param {string} [options.crop]     – 'fill' | 'limit' | 'fit'
 * @returns {string}
 */
export const optimizeCloudinaryUrl = (url, { width, height, quality = 'auto', format = 'auto', crop = 'limit' } = {}) => {
  if (!url || typeof url !== 'string') return url || '';
  // Only transform Cloudinary URLs
  if (!url.includes('res.cloudinary.com')) return url;

  const transforms = [];
  if (format) transforms.push(`f_${format}`);
  if (quality) transforms.push(`q_${quality}`);
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  if ((width || height) && crop) transforms.push(`c_${crop}`);
  transforms.push('dpr_auto');

  if (!transforms.length) return url;

  const transformStr = transforms.join(',');

  // Insert transforms after /upload/ in the URL
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  const insertAt = uploadIndex + '/upload/'.length;

  // Check if transforms are already present (avoid double-transforming)
  const afterUpload = url.slice(insertAt);
  if (afterUpload.startsWith('f_') || afterUpload.startsWith('q_') || afterUpload.startsWith('w_')) {
    return url;
  }

  return url.slice(0, insertAt) + transformStr + '/' + afterUpload;
};

/**
 * Extract the public ID from a Cloudinary URL.
 *
 * @param {string} url
 * @returns {string|null}
 */
export const getCloudinaryPublicId = (url) => {
  if (!url || !url.includes('res.cloudinary.com')) return null;
  const uploadMatch = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
  if (uploadMatch) return uploadMatch[1];
  // Handle URLs with transforms
  const transformMatch = url.match(/\/upload\/[^/]+\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
  return transformMatch ? transformMatch[1] : null;
};

/**
 * Delete a Cloudinary asset via the backend proxy.
 * The server endpoint uses the API secret which cannot be exposed client-side.
 *
 * @param {string} publicId
 * @param {string} [resourceType='image']
 * @returns {Promise<{ ok: boolean }>}
 */
export const deleteCloudinaryAsset = async (publicId, resourceType = 'image') => {
  if (!publicId) return { ok: false };

  const { auth } = await import('../firebase.js');
  const user = auth.currentUser;
  if (!user) throw new Error('You must be logged in.');

  const token = await user.getIdToken();
  const serverUrl = import.meta.env.VITE_SERVER_URL || '';
  const res = await fetch(`${serverUrl}/api/cloudinary/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ publicId, resourceType })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not delete media.');
  }

  return { ok: true };
};
