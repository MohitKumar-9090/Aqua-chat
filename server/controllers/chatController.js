import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { asyncHandler, createError } from '../utils/asyncHandler.js';
import { ensureChatAdmin, ensureChatMember } from '../middleware/auth.js';

const populateChat = (query) =>
  query
    .populate('participants.user', 'displayName username email phoneNumber photoURL bio isOnline lastSeen')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'displayName photoURL' }
    });

export const listChats = asyncHandler(async (req, res) => {
  const chats = await populateChat(
    Chat.find({ 'participants.user': req.user._id }).sort({ updatedAt: -1 })
  );

  const decorated = await Promise.all(
    chats.map(async (chat) => ({
      ...chat.toObject(),
      unreadCount: await Message.countDocuments({
        chat: chat._id,
        sender: { $ne: req.user._id },
        'seenBy.user': { $ne: req.user._id }
      })
    }))
  );

  res.json({ chats: decorated });
});

export const createDirectChat = asyncHandler(async (req, res) => {
  const otherUserId = req.body.userId;
  if (!otherUserId) {
    throw createError(400, 'userId is required');
  }

  let chat = await Chat.findOne({
    type: 'direct',
    'participants.user': { $all: [req.user._id, otherUserId] }
  });

  if (!chat) {
    chat = await Chat.create({
      type: 'direct',
      createdBy: req.user._id,
      participants: [{ user: req.user._id, role: 'admin' }, { user: otherUserId }]
    });
  }

  chat = await populateChat(Chat.findById(chat._id));
  chat.participants.forEach((participant) => {
    req.app.get('io')?.to(participant.user._id.toString()).emit('chat:created', chat);
  });
  res.status(201).json({ chat });
});

export const createGroupChat = asyncHandler(async (req, res) => {
  const { name, avatarUrl = '', memberIds = [] } = req.body;
  if (!name?.trim()) {
    throw createError(400, 'Group name is required');
  }

  const uniqueMembers = [...new Set([req.user._id.toString(), ...memberIds])];
  const chat = await Chat.create({
    type: 'group',
    name: name.trim(),
    avatarUrl,
    createdBy: req.user._id,
    participants: uniqueMembers.map((userId) => ({
      user: userId,
      role: userId === req.user._id.toString() ? 'admin' : 'member'
    }))
  });

  const populated = await populateChat(Chat.findById(chat._id));
  res.status(201).json({ chat: populated });
});

export const updateGroup = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat || chat.type !== 'group') throw createError(404, 'Group not found');
  if (!ensureChatAdmin(chat, req.user._id)) throw createError(403, 'Admin access required');

  if (typeof req.body.name === 'string') chat.name = req.body.name.trim();
  if (typeof req.body.avatarUrl === 'string') chat.avatarUrl = req.body.avatarUrl;
  await chat.save();

  const populated = await populateChat(Chat.findById(chat._id));
  req.app.get('io')?.to(chat._id.toString()).emit('chat:updated', populated);
  res.json({ chat: populated });
});

export const addMembers = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat || chat.type !== 'group') throw createError(404, 'Group not found');
  if (!ensureChatAdmin(chat, req.user._id)) throw createError(403, 'Admin access required');

  const existing = new Set(chat.participants.map((participant) => participant.user.toString()));
  (req.body.memberIds || []).forEach((userId) => {
    if (!existing.has(userId)) chat.participants.push({ user: userId });
  });

  await chat.save();
  const populated = await populateChat(Chat.findById(chat._id));
  req.app.get('io')?.to(chat._id.toString()).emit('chat:updated', populated);
  res.json({ chat: populated });
});

export const removeMember = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId);
  if (!chat || chat.type !== 'group') throw createError(404, 'Group not found');
  if (!ensureChatAdmin(chat, req.user._id)) throw createError(403, 'Admin access required');

  chat.participants = chat.participants.filter(
    (participant) => participant.user.toString() !== req.params.userId
  );
  await chat.save();

  const message = await Message.create({
    chat: chat._id,
    sender: req.user._id,
    type: 'text',
    body: 'A member was removed from the group.'
  });
  chat.lastMessage = message._id;
  await chat.save();

  const populated = await populateChat(Chat.findById(chat._id));
  req.app.get('io')?.to(chat._id.toString()).emit('chat:updated', populated);
  res.json({ chat: populated });
});

export const getChat = asyncHandler(async (req, res) => {
  const chat = await populateChat(Chat.findById(req.params.chatId));
  if (!chat) throw createError(404, 'Chat not found');
  if (!ensureChatMember(chat, req.user._id)) throw createError(403, 'Chat access denied');

  res.json({ chat });
});
