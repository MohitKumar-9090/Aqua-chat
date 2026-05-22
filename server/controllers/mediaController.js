import { assertCloudinaryReady, cloudinary } from '../config/cloudinary.js';
import { asyncHandler, createError } from '../utils/asyncHandler.js';

const uploadBuffer = (file, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(file.buffer);
  });

export const uploadMedia = asyncHandler(async (req, res) => {
  assertCloudinaryReady();
  if (!req.file) throw createError(400, 'media file is required');

  const result = await uploadBuffer(req.file, `aqua-chat/${req.user._id}`);
  res.status(201).json({
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    bytes: result.bytes,
    format: result.format,
    duration: result.duration
  });
});
