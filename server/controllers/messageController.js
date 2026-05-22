import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { ensureChatMember } from '../middleware/auth.js';
import { asyncHandler, createError } from '../utils/asyncHandler.js';

const populateMessage = (query) =>
  query
    .populate('sender', 'displayName username photoURL')
    .populate('seenBy.user', 'displayName username photoURL')
    .populate('deliveredTo.user', 'displayName username photoURL');

export const listMessages = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat) throw createError(404, 'Chat not found');
  if (!ensureChatMember(chat, req.user._id)) throw createError(403, 'Chat access denied');

  const limit = Math.min(Number(req.query.limit) || 30, 80);
  const before = req.query.before ? new Date(req.query.before) : new Date();
  const messages = await populateMessage(
    Message.find({ chat: chat._id, createdAt: { $lt: before } })
      .sort({ createdAt: -1 })
      .limit(limit)
  );

  res.json({ messages: messages.reverse() });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.body.chatId);
  if (!chat) throw createError(404, 'Chat not found');
  if (!ensureChatMember(chat, req.user._id)) throw createError(403, 'Chat access denied');

  const message = await Message.create({
    chat: chat._id,
    sender: req.user._id,
    type: req.body.type || 'text',
    body: req.body.body || '',
    mediaUrl: req.body.mediaUrl || '',
    cloudinaryPublicId: req.body.cloudinaryPublicId || '',
    duration: req.body.duration || 0,
    replyTo: req.body.replyTo
  });

  chat.lastMessage = message._id;
  await chat.save();

  const populated = await populateMessage(Message.findById(message._id));
  req.app.get('io')?.to(chat._id.toString()).emit('message:new', populated);
  res.status(201).json({ message: populated });
});

export const markSeen = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const chat = await Chat.findById(chatId);
  if (!chat) throw createError(404, 'Chat not found');
  if (!ensureChatMember(chat, req.user._id)) throw createError(403, 'Chat access denied');

  await Message.updateMany(
    {
      chat: chatId,
      sender: { $ne: req.user._id },
      'seenBy.user': { $ne: req.user._id }
    },
    {
      $addToSet: { seenBy: { user: req.user._id, at: new Date() } },
      $set: { status: 'seen' }
    }
  );

  req.app.get('io')?.to(chatId).emit('message:seen', { chatId, userId: req.user._id });
  res.json({ ok: true });
});
