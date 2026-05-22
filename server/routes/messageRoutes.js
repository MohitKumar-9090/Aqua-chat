import { Router } from 'express';
import { listMessages, markSeen, sendMessage } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/:chatId', requireAuth, listMessages);
router.post('/', requireAuth, sendMessage);
router.post('/:chatId/seen', requireAuth, markSeen);

export default router;
