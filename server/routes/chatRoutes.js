import { Router } from 'express';
import {
  addMembers,
  createDirectChat,
  createGroupChat,
  getChat,
  listChats,
  removeMember,
  updateGroup
} from '../controllers/chatController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, listChats);
router.get('/:chatId', requireAuth, getChat);
router.post('/direct', requireAuth, createDirectChat);
router.post('/group', requireAuth, createGroupChat);
router.patch('/:chatId', requireAuth, updateGroup);
router.post('/:chatId/members', requireAuth, addMembers);
router.delete('/:chatId/members/:userId', requireAuth, removeMember);

export default router;
