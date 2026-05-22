import { Router } from 'express';
import { uploadMedia } from '../controllers/mediaController.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.post('/upload', requireAuth, upload.single('media'), uploadMedia);

export default router;
