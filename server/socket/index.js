import { Server } from 'socket.io';
import { firebaseAdmin } from '../config/firebase.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

const populateMessage = (query) =>
  query
    .populate('sender', 'displayName username photoURL')
    .populate('seenBy.user', 'displayName username photoURL')
    .populate('deliveredTo.user', 'displayName username photoURL');

const isParticipant = (chat, userId) =>
  chat.participants.some((participant) => participant.user.toString() === userId.toString());

const compact = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null));

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || !firebaseAdmin.apps.length) return next(new Error('Unauthorized'));

      const decoded = await firebaseAdmin.auth().verifyIdToken(token);
      const user = await User.findOneAndUpdate(
        { firebaseUid: decoded.uid },
        {
          $setOnInsert: {
            displayName: decoded.name || decoded.email?.split('@')[0] || decoded.phone_number || 'New Friend',
            email: decoded.email,
            phoneNumber: decoded.phone_number,
            photoURL: decoded.picture || ''
          },
          $set: compact({
            isOnline: true,
            email: decoded.email,
            phoneNumber: decoded.phone_number,
            photoURL: decoded.picture,
            lastSeen: new Date()
          })
        },
        { upsert: true, new: true }
      );

      socket.user = user;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    socket.join(userId);

    const chats = await Chat.find({ 'participants.user': userId }).select('_id');
    chats.forEach((chat) => socket.join(chat._id.toString()));
    socket.broadcast.emit('presence:update', { userId, isOnline: true });

    socket.on('chat:join', async (chatId) => {
      const chat = await Chat.findById(chatId);
      if (chat && isParticipant(chat, userId)) socket.join(chatId);
    });

    socket.on('typing:start', ({ chatId }) => {
      socket.to(chatId).emit('typing:start', { chatId, user: socket.user });
    });

    socket.on('typing:stop', ({ chatId }) => {
      socket.to(chatId).emit('typing:stop', { chatId, userId });
    });

    socket.on('message:send', async (payload, ack) => {
      try {
        const chat = await Chat.findById(payload.chatId);
        if (!chat || !isParticipant(chat, userId)) throw new Error('Chat access denied');

        const message = await Message.create({
          chat: chat._id,
          sender: userId,
          type: payload.type || 'text',
          body: payload.body || '',
          mediaUrl: payload.mediaUrl || '',
          cloudinaryPublicId: payload.cloudinaryPublicId || '',
          duration: payload.duration || 0,
          replyTo: payload.replyTo
        });

        chat.lastMessage = message._id;
        await chat.save();

        const populated = await populateMessage(Message.findById(message._id));
        io.to(chat._id.toString()).emit('message:new', populated);
        ack?.({ ok: true, message: populated });
      } catch (error) {
        ack?.({ ok: false, message: error.message });
      }
    });

    socket.on('message:delivered', async ({ messageId }) => {
      const message = await Message.findById(messageId);
      if (!message || message.sender.toString() === userId) return;

      if (!message.deliveredTo.some((receipt) => receipt.user.toString() === userId)) {
        message.deliveredTo.push({ user: userId, at: new Date() });
      }
      if (message.status === 'sent') message.status = 'delivered';
      await message.save();
      io.to(message.chat.toString()).emit('message:delivered', { messageId, userId });
    });

    socket.on('message:seen', async ({ chatId }) => {
      await Message.updateMany(
        { chat: chatId, sender: { $ne: userId }, 'seenBy.user': { $ne: userId } },
        { $addToSet: { seenBy: { user: userId, at: new Date() } }, $set: { status: 'seen' } }
      );
      io.to(chatId).emit('message:seen', { chatId, userId });
    });

    socket.on('call:offer', ({ to, chatId, offer, callType }) => {
      io.to(to).emit('call:offer', { from: userId, chatId, offer, callType, caller: socket.user });
    });

    socket.on('call:answer', ({ to, answer }) => {
      io.to(to).emit('call:answer', { from: userId, answer });
    });

    socket.on('call:ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('call:ice-candidate', { from: userId, candidate });
    });

    socket.on('call:end', ({ to, chatId }) => {
      io.to(to).emit('call:end', { from: userId, chatId });
    });

    socket.on('disconnect', async () => {
      const sockets = await io.in(userId).fetchSockets();
      if (sockets.length === 0) {
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
        socket.broadcast.emit('presence:update', { userId, isOnline: false, lastSeen: new Date() });
      }
    });
  });

  return io;
};
