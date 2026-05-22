import { Router } from 'express';
import { getMe, syncProfile } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, getMe);
router.post('/sync', requireAuth, syncProfile);

export default router;
