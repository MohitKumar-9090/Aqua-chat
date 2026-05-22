import { Router } from 'express';
import { acceptConnection, connectUser, followUser, listUsers, updateProfile } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listUsers);
router.patch('/me', requireAuth, updateProfile);
router.post('/:userId/connect', requireAuth, connectUser);
router.post('/:userId/accept', requireAuth, acceptConnection);
router.post('/:userId/follow', requireAuth, followUser);

export default router;
