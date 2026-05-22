import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { asyncHandler, createError } from '../utils/asyncHandler.js';
import { presentUser } from '../utils/userPresenter.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanUsername = (value) => value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
const ids = (values = []) => new Set(values.map((value) => value.toString()));
const normalizeText = (value = '') => value.toString().trim().toLowerCase();
const normalizePhone = (value = '') => value.toString().replace(/[^\d+]/g, '');
const matchesUserSearch = (user, rawQuery) => {
  const query = normalizeText(rawQuery).replace(/^@/, '');
  const phoneQuery = normalizePhone(rawQuery);
  if (!query) return true;

  return [
    user.displayName,
    user.username,
    user.email,
    user.phoneNumber
  ].some((value) => normalizeText(value).includes(query)) || Boolean(phoneQuery && normalizePhone(user.phoneNumber).includes(phoneQuery));
};

const getDirectChat = (currentUserId, otherUserId) =>
  Chat.findOne({
    type: 'direct',
    'participants.user': { $all: [currentUserId, otherUserId] }
  }).populate({
    path: 'lastMessage',
    populate: { path: 'sender', select: 'displayName username photoURL' }
  });

const ensureDirectChat = async (currentUserId, otherUserId) => {
  let chat = await Chat.findOne({
    type: 'direct',
    'participants.user': { $all: [currentUserId, otherUserId] }
  });

  if (!chat) {
    chat = await Chat.create({
      type: 'direct',
      createdBy: currentUserId,
      participants: [{ user: currentUserId, role: 'admin' }, { user: otherUserId }]
    });
  }

  return chat;
};

const withSearchMetadata = async (users, currentUser) => {
  const currentUserId = currentUser._id;
  const following = ids(currentUser.following);
  const followers = ids(currentUser.followers);
  const connected = ids(currentUser.connections);
  const sent = ids(currentUser.connectionRequestsSent);
  const received = ids(currentUser.connectionRequestsReceived);

  return Promise.all(
    users.map(async (user) => {
      const userId = user._id.toString();
      const chat = await getDirectChat(currentUserId, user._id);
      const unreadCount = chat
        ? await Message.countDocuments({
            chat: chat._id,
            sender: { $ne: currentUserId },
            'seenBy.user': { $ne: currentUserId }
          })
        : 0;

      return {
        ...presentUser(user),
        connectionStatus: connected.has(userId)
          ? 'connected'
          : received.has(userId)
            ? 'incoming'
            : sent.has(userId)
              ? 'requested'
              : 'none',
        isFollowing: following.has(userId),
        followsMe: followers.has(userId),
        directChatId: chat?._id,
        lastMessagePreview: chat?.lastMessage?.body || '',
        lastMessageAt: chat?.lastMessage?.createdAt || chat?.updatedAt,
        unreadCount
      };
    })
  );
};

export const listUsers = asyncHandler(async (req, res) => {
  const query = normalizeText(req.query.q || '');
  const safeQuery = query ? escapeRegex(query.replace(/^@/, '')) : '';
  const phoneQuery = query ? escapeRegex(normalizePhone(query)) : '';
  const baseFilter = { _id: { $ne: req.user._id } };
  const totalUsers = await User.countDocuments(baseFilter);
  const filter = query
    ? {
        ...baseFilter,
        $or: [
          { searchableKeywords: safeQuery },
          { username: { $regex: safeQuery, $options: 'i' } },
          { email: { $regex: safeQuery, $options: 'i' } },
          { phoneNumber: { $regex: phoneQuery || safeQuery, $options: 'i' } },
          { displayName: { $regex: safeQuery, $options: 'i' } }
        ]
      }
    : baseFilter;

  let users = await User.find(filter)
    .select('displayName username email phoneNumber photoURL bio verified isOnline lastSeen')
    .sort(query ? { username: 1, displayName: 1 } : { displayName: 1 })
    .limit(query ? 80 : 60);

  if (query) {
    const seen = new Set(users.map((user) => user._id.toString()));
    const fallbackUsers = await User.find(baseFilter)
      .select('displayName username email phoneNumber photoURL bio verified isOnline lastSeen')
      .sort({ displayName: 1 })
      .limit(250);

    users = [
      ...users,
      ...fallbackUsers.filter((user) => !seen.has(user._id.toString()) && matchesUserSearch(user, query))
    ].slice(0, 60);
  }

  res.json({
    users: await withSearchMetadata(users, req.user),
    totalUsers,
    query
  });
});

export const connectUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.userId);
  if (!target || target._id.equals(req.user._id)) throw createError(404, 'User not found');

  if (req.user.connectionRequestsReceived.some((id) => id.equals(target._id))) {
    req.user.connections.addToSet(target._id);
    target.connections.addToSet(req.user._id);
    req.user.connectionRequestsReceived.pull(target._id);
    target.connectionRequestsSent.pull(req.user._id);
    await Promise.all([req.user.save(), target.save(), ensureDirectChat(req.user._id, target._id)]);
    req.app.get('io')?.to(target._id.toString()).emit('connection:accepted', { userId: req.user._id });
    return res.json({ status: 'connected' });
  }

  req.user.connectionRequestsSent.addToSet(target._id);
  target.connectionRequestsReceived.addToSet(req.user._id);
  await Promise.all([req.user.save(), target.save()]);
  req.app.get('io')?.to(target._id.toString()).emit('connection:request', { user: presentUser(req.user) });
  res.json({ status: 'requested' });
});

export const acceptConnection = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.userId);
  if (!target || target._id.equals(req.user._id)) throw createError(404, 'User not found');

  req.user.connections.addToSet(target._id);
  target.connections.addToSet(req.user._id);
  req.user.connectionRequestsReceived.pull(target._id);
  target.connectionRequestsSent.pull(req.user._id);
  await Promise.all([req.user.save(), target.save()]);
  const chat = await ensureDirectChat(req.user._id, target._id);
  req.app.get('io')?.to(target._id.toString()).emit('connection:accepted', { userId: req.user._id, chatId: chat._id });
  res.json({ status: 'connected', chatId: chat._id });
});

export const followUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.userId);
  if (!target || target._id.equals(req.user._id)) throw createError(404, 'User not found');

  const isFollowing = req.user.following.some((id) => id.equals(target._id));
  if (isFollowing) {
    req.user.following.pull(target._id);
    target.followers.pull(req.user._id);
  } else {
    req.user.following.addToSet(target._id);
    target.followers.addToSet(req.user._id);
  }

  await Promise.all([req.user.save(), target.save()]);
  res.json({ isFollowing: !isFollowing });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const aliases = {
    name: 'displayName',
    profilePicture: 'photoURL',
    profilePic: 'photoURL',
    phone: 'phoneNumber'
  };
  Object.entries(aliases).forEach(([from, to]) => {
    if (typeof req.body[from] === 'string') req.body[to] = req.body[from];
  });

  const allowed = ['displayName', 'username', 'photoURL', 'phoneNumber', 'email', 'bio'];
  allowed.forEach((key) => {
    if (typeof req.body[key] === 'string') {
      req.user[key] = key === 'username' ? cleanUsername(req.body[key]) : req.body[key];
    }
  });

  try {
    await req.user.save();
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = 'Username is already taken';
    }
    throw error;
  }
  const user = presentUser(req.user);
  req.app.get('io')?.to(req.user._id.toString()).emit('user:updated', user);
  res.json({ user });
});
