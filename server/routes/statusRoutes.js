import { Router } from 'express';
import { createStatus, listStatuses, markStatusSeen } from '../controllers/statusController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listStatuses);
router.post('/', requireAuth, createStatus);
router.post('/:statusId/seen', requireAuth, markStatusSeen);

export default router;
