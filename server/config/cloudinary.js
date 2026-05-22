import { v2 as cloudinary } from 'cloudinary';
import { normalizeEnv } from './env.js';

normalizeEnv();

const cloudinaryReady = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET &&
    !process.env.CLOUDINARY_CLOUD_NAME.startsWith('YOUR_')
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (cloudinaryReady) {
  console.log('Cloudinary config loaded');
}

export const assertCloudinaryReady = () => {
  if (!cloudinaryReady) {
    throw new Error('Cloudinary environment variables are missing or still placeholders.');
  }
};

export { cloudinary };
