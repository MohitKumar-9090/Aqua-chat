import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { compressProfilePhoto, prepareUploadFile, detectMessageType } from './utils/messageMedia.js';
import { uploadToCloudinary, uploadImageToCloudinary } from './services/cloudinary.js';
import { pruneStatusViewedLocal } from './utils/statusViewed.js';
import { onAuthStateChanged } from 'firebase/auth';
import { onValue, ref as dbRef, serverTimestamp as rtdbTimestamp, set } from 'firebase/database';
import { auth, firestore, realtimeDb, storage } from './firebase.js';

const cleanUsername = (value) => {
  if (value == null) return '';
  return value.toString().trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
};
const normalize = (value) => {
  if (value == null) return '';
  return value.toString().trim().toLowerCase();
};
const normalizePhone = (value) => {
  if (value == null) return '';
  return value.toString().replace(/[^\d+]/g, '');
};
const toId = (uid) => uid;

const prefixes = (value) => {
  const clean = normalize(value);
  if (!clean) return [];
  return Array.from({ length: clean.length }, (_, index) => clean.slice(0, index + 1));
};

const buildKeywords = (profile) => {
  const values = [
    profile.displayName,
    profile.username,
    profile.email,
    profile.phoneNumber,
    profile.phone,
    normalizePhone(profile.phoneNumber || profile.phone)
  ].filter(Boolean);

  return [...new Set(values.flatMap((value) => [normalize(value), ...prefixes(value)]))];
};

const safeIsoString = (val) => {
  if (!val) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch (e) {
      return null;
    }
  }
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val === 'object') {
    if (typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000).toISOString();
    }
    if (typeof val._seconds === 'number') {
      return new Date(val._seconds * 1000).toISOString();
    }
  }
  return null;
};

const currentUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be logged in.');
  return String(uid).trim();
};

const presentUser = (id, data = {}) => {
  const cleanId = String(id || '').trim();
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const statusPrivacy = settings.statusPrivacy && typeof settings.statusPrivacy === 'object'
    ? settings.statusPrivacy
    : {};
  return {
    _id: cleanId,
    uid: cleanId,
    firebaseUid: cleanId,
    displayName: data.displayName || data.name || data.email || data.phoneNumber || 'AquaChat user',
    name: data.displayName || data.name || '',
    username: data.username || '',
    email: data.email || '',
    phoneNumber: (data.phoneNumber || data.phone || '').trim(),
    phone: (data.phoneNumber || data.phone || '').trim(),
    photoURL: data.photoURL || data.profilePic || data.profilePicture || '',
    profilePic: data.photoURL || data.profilePic || '',
    profilePicture: data.photoURL || data.profilePicture || '',
    bio: data.bio || 'Hey there! I am using AquaChat.',
    about: data.about || data.bio || 'Hey there! I am using AquaChat.',
    verified: Boolean(data.verified),
    isOnline: Boolean(data.isOnline || data.online),
    lastSeen: safeIsoString(data.lastSeen) || '',
    connectionStatus: data.connectionStatus || 'none',
    connections: (data.connections || []).map(cId => String(cId || '').trim()),
    settings: {
      theme: settings.theme === 'dark' ? 'dark' : 'light',
      statusPrivacy: {
        mode: ['everyone', 'connections', 'selected'].includes(statusPrivacy.mode) ? statusPrivacy.mode : 'everyone',
        selectedIds: Array.isArray(statusPrivacy.selectedIds)
          ? statusPrivacy.selectedIds.map((uid) => String(uid || '').trim()).filter(Boolean)
          : []
      }
    },
    isFollowing: Boolean(data.isFollowing),
    followsMe: Boolean(data.followsMe)
  };
};

const userCache = {
  store: new Map(),
  get(uid) {
    const entry = this.store.get(uid);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > 180000) { // 3 minutes TTL
      this.store.delete(uid);
      return null;
    }
    return entry.user;
  },
  set(uid, user) {
    this.store.set(uid, { user, timestamp: Date.now() });
  },
  has(uid) {
    const entry = this.store.get(uid);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > 180000) {
      this.store.delete(uid);
      return false;
    }
    return true;
  },
  delete(uid) {
    this.store.delete(uid);
  },
  clear() {
    this.store.clear();
  }
};

const readUser = async (uid) => {
  const snap = await getDoc(doc(firestore, 'users', uid));
  return snap.exists() ? presentUser(snap.id, snap.data()) : null;
};

const readUserCached = async (uid) => {
  if (userCache.has(uid)) return userCache.get(uid);
  const user = await readUser(uid);
  if (user) userCache.set(uid, user);
  return user;
};

const normalizeUid = (uid) => String(uid || '').trim();

const readUsersByIds = async (ids = []) => {
  const cleanIds = [...new Set(ids.map(normalizeUid).filter(Boolean))];
  if (!cleanIds.length) return [];
  const users = await Promise.all(cleanIds.map((id) => readUserCached(id)));
  return users.filter(Boolean);
};

const uploadFileWithTimeout = async (ref, file, { onProgress, timeoutMs = 45000 } = {}) => {
  const isSmallFile = file.size < 2 * 1024 * 1024; // 2MB

  // For small files, use the faster, single-request uploadBytes (no resumable session overhead)
  if (isSmallFile) {
    let mockInterval;
    if (onProgress) {
      onProgress(10);
      let progress = 10;
      mockInterval = setInterval(() => {
        progress = Math.min(90, progress + 15);
        onProgress(progress);
      }, 300);
    }

    try {
      const uploadPromise = uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Upload timed out. Check your internet connection and Firebase Storage rules.')), timeoutMs);
      });
      await Promise.race([uploadPromise, timeoutPromise]);
      if (onProgress) onProgress(100);
    } catch (error) {
      if (error?.code === 'storage/unauthorized') {
        throw new Error('Upload is blocked by Firebase Storage permissions. Deploy storage rules and try again.');
      }
      throw error;
    } finally {
      if (mockInterval) clearInterval(mockInterval);
    }
    return;
  }

  // For larger files, use uploadBytesResumable but throttle the progress callback
  const task = uploadBytesResumable(ref, file, { contentType: file.type || 'application/octet-stream' });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        task.cancel();
        reject(new Error('Upload timed out. Check your internet connection and Firebase Storage rules.'));
      }, timeoutMs);

      let lastProgress = 0;
      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes) {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            // Throttle progress updates to prevent choking the main rendering thread
            if (progress === 100 || progress - lastProgress >= 8) {
              lastProgress = progress;
              onProgress(progress);
            }
          }
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        () => {
          clearTimeout(timeout);
          resolve();
        }
      );
    });
  } catch (error) {
    if (error?.code === 'storage/canceled') {
      throw new Error('Upload timed out. Check your internet connection and Firebase Storage rules.');
    }
    if (error?.code === 'storage/unauthorized') {
      throw new Error('Upload is blocked by Firebase Storage permissions. Deploy storage rules and try again.');
    }
    throw error;
  }
};

export const primeUserCache = (user) => {
  if (user?._id) userCache.set(user._id, user);
};

const usersByIds = async (ids = []) => {
  const pairs = await Promise.all([...new Set(ids)].map(async (id) => [id, await readUserCached(id)]));
  return Object.fromEntries(pairs.filter(([, user]) => user));
};

const chatDocToObject = async (snap) => {
  const data = snap.data();
  const userMap = await usersByIds(data.participantIds || []);
  return buildChatObject(snap, data, userMap);
};

/** Synchronous fast-path: use only cached user data, no Firestore reads. */
const chatDocToObjectFast = (snap) => {
  const data = snap.data();
  const userMap = {};
  (data.participantIds || []).forEach((id) => {
    userMap[id] = userCache.get(id) || { _id: id, displayName: 'AquaChat user' };
  });
  return buildChatObject(snap, data, userMap);
};

const buildChatObject = (snap, data, userMap) => {
  const normalizedParticipantIds = (data.participantIds || []).map(id => String(id || '').trim());
  const normalizedAdminIds = (data.adminIds || []).map(id => String(id || '').trim());
  const normalizedCreatedBy = data.createdBy ? String(data.createdBy).trim() : '';
  const myUid = currentUid();
  return {
    _id: snap.id,
    id: snap.id,
    type: data.type || 'direct',
    name: data.name || '',
    avatarUrl: data.avatarUrl || '',
    participantIds: normalizedParticipantIds,
    adminIds: normalizedAdminIds,
    participants: normalizedParticipantIds.map((uid) => {
      const userObj = userMap[uid] || { _id: uid, uid: uid, firebaseUid: uid, displayName: 'AquaChat user' };
      const cleanUid = String(uid).trim();
      const role = normalizedAdminIds.includes(cleanUid) ? 'admin' : 'member';
      return {
        user: {
          ...userObj,
          _id: String(userObj._id || userObj.uid || cleanUid).trim(),
          uid: String(userObj.uid || userObj._id || cleanUid).trim(),
          firebaseUid: String(userObj.firebaseUid || userObj.uid || cleanUid).trim()
        },
        role,
        joinedAt: safeIsoString(data.createdAt) || ''
      };
    }),
    createdBy: normalizedCreatedBy,
    lastMessage: data.lastMessage || null,
    unreadCount: data.unreadCounts?.[myUid] || 0,
    updatedAt: safeIsoString(data.updatedAt) || safeIsoString(data.lastMessage?.createdAt) || safeIsoString(data.createdAt) || new Date().toISOString()
  };
};

const directChatId = (a, b) => `direct_${[a, b].sort().join('_')}`;

const normalizeLastSeen = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === 'object') {
    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000).toISOString();
    }
    if (typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000).toISOString();
    }
    if (value['.sv'] === 'timestamp') return '';
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString();
};

export const normalizePresenceMap = (presence = {}) => {
  const normalized = {};
  Object.entries(presence).forEach(([uid, data]) => {
    if (!data || typeof data !== 'object') return;
    const online = Boolean(data.online ?? data.isOnline);
    normalized[uid] = {
      online,
      isOnline: online,
      lastSeen: normalizeLastSeen(data.lastSeen)
    };
  });
  return normalized;
};

export const subscribePresence = (handler) => {
  if (!realtimeDb || !auth) {
    console.warn('Realtime Database is not configured.');
    return () => {};
  }

  let presenceUnsubscribe = null;

  const attachPresenceListener = () => {
    presenceUnsubscribe?.();
    presenceUnsubscribe = onValue(
      dbRef(realtimeDb, 'presence'),
      (snap) => handler(normalizePresenceMap(snap.val() || {})),
      (error) => console.error('Presence listener error:', error?.message || error)
    );
  };

  const authUnsubscribe = onAuthStateChanged(auth, (user) => {
    presenceUnsubscribe?.();
    presenceUnsubscribe = null;
    if (!user?.uid) {
      handler({});
      return;
    }
    attachPresenceListener();
  });

  return () => {
    authUnsubscribe();
    presenceUnsubscribe?.();
  };
};

/** @deprecated Use startPresenceSession from services/presence.js */
export { startPresenceSession as setCurrentPresence, touchPresence } from './services/presence.js';

const mergeChatObjects = (existing, next) => {
  if (!existing) return next;
  
  // Safely merge participants list, keeping rich profiles if present
  let mergedParticipants = next.participants;
  if (existing.participantIds.join(',') === next.participantIds.join(',')) {
    mergedParticipants = existing.participants.map((p) => {
      const updatedUser = next.participants.find((np) => np.user._id === p.user._id)?.user;
      return {
        ...p,
        user: updatedUser ? { ...p.user, ...updatedUser } : p.user
      };
    });
  }

  // Robustly determine newest updatedAt and lastMessage
  const existingMsgTime = existing.lastMessage?.createdAt ? new Date(existing.lastMessage.createdAt).getTime() : 0;
  const nextMsgTime = next.lastMessage?.createdAt ? new Date(next.lastMessage.createdAt).getTime() : 0;
  const useExistingMsg = existingMsgTime > nextMsgTime;

  const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  const nextTime = next.updatedAt ? new Date(next.updatedAt).getTime() : 0;
  const useExistingTime = existingTime > nextTime;

  return {
    ...existing,
    ...next,
    participants: mergedParticipants,
    lastMessage: useExistingMsg ? (existing.lastMessage || next.lastMessage) : (next.lastMessage || existing.lastMessage),
    updatedAt: useExistingTime ? existing.updatedAt : next.updatedAt
  };
};

export const subscribeChats = (handler) => {
  const uid = currentUid();
  const q = query(collection(firestore, 'chats'), where('participantIds', 'array-contains', uid));
  const chatCache = new Map();
  let isSubscribed = true;

  const parseDate = (val) => {
    if (!val) return 0;
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const emit = () => {
    if (!isSubscribed) return;
    const sorted = [...chatCache.values()].sort((a, b) => {
      const tA = parseDate(a.updatedAt);
      const tB = parseDate(b.updatedAt);
      return tB - tA;
    });
    handler(sorted);
  };

  let unsubscribe;
  const startListener = () => {
    if (!isSubscribed) return;
    unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (!isSubscribed) return;
        const changes = snap.docChanges();

        if (!changes.length) {
          chatCache.clear();
          snap.docs.forEach((docSnap) => {
            chatCache.set(docSnap.id, chatDocToObjectFast(docSnap));
          });
          emit();

          Promise.all(snap.docs.map((docSnap) => chatDocToObject(docSnap))).then((chats) => {
            if (!isSubscribed) return;
            let changed = false;
            chats.forEach((chat) => {
              const existing = chatCache.get(chat._id);
              if (existing) {
                const merged = mergeChatObjects(existing, chat);
                chatCache.set(chat._id, merged);
                changed = true;
              }
            });
            if (changed) emit();
          });
          return;
        }

        changes.forEach((change) => {
          if (change.type === 'removed') {
            chatCache.delete(change.doc.id);
            return;
          }
          const fastChat = chatDocToObjectFast(change.doc);
          const existing = chatCache.get(change.doc.id);
          chatCache.set(change.doc.id, mergeChatObjects(existing, fastChat));
        });
        emit();

        const added = changes.filter((c) => c.type !== 'removed');
        if (added.length) {
          Promise.all(added.map((c) => chatDocToObject(c.doc))).then((chats) => {
            if (!isSubscribed) return;
            let changed = false;
            chats.forEach((chat) => {
              const existing = chatCache.get(chat._id);
              if (existing) {
                const merged = mergeChatObjects(existing, chat);
                chatCache.set(chat._id, merged);
                changed = true;
              }
            });
            if (changed) emit();
          });
        }
      },
      (error) => {
        console.warn('[subscribeChats] Firestore listener error, restarting:', error.message);
        if (unsubscribe) unsubscribe();
        if (isSubscribed) {
          setTimeout(() => {
            startListener();
          }, 300);
        }
      }
    );
  };

  startListener();

  return () => {
    isSubscribed = false;
    if (unsubscribe) unsubscribe();
  };
};

const messageCreatedAt = (data) => {
  const parsed = safeIsoString(data.createdAt);
  if (parsed) return parsed;
  if (data.clientCreatedAt) return new Date(data.clientCreatedAt).toISOString();
  return new Date().toISOString();
};

const mapMessageDoc = (messageSnap, chatId) => {
  const data = messageSnap.data();
  const sender = data.sender && typeof data.sender === 'object'
    ? data.sender
    : { _id: data.senderId, displayName: 'AquaChat user' };

  return {
    _id: messageSnap.id,
    id: messageSnap.id,
    chat: chatId,
    sender,
    senderId: data.senderId || sender._id,
    type: data.type || 'text',
    body: data.body || '',
    mediaUrl: data.mediaUrl || '',
    storagePath: data.storagePath || '',
    fileName: data.fileName || '',
    fileSize: data.fileSize || 0,
    mimeType: data.mimeType || '',
    duration: data.duration || 0,
    replyTo: data.replyTo || null,
    deletedFor: data.deletedFor || [],
    deletedForEveryone: Boolean(data.deletedForEveryone),
    deletedAt: safeIsoString(data.deletedAt) || null,
    status: data.status || 'sent',
    seenBy: data.seenBy || [],
    deliveredTo: data.deliveredTo || [],
    clientCreatedAt: data.clientCreatedAt || (safeIsoString(data.createdAt) ? new Date(safeIsoString(data.createdAt)).getTime() : 0),
    createdAt: messageCreatedAt(data)
  };
};

export const filterVisibleMessages = (messages, uid) =>
  messages.filter((message) => !message.deletedFor?.includes(uid));

const lastMessageLabel = (message) => {
  if (message.deletedForEveryone) return 'This message was deleted';
  if (message.type === 'image') return 'Photo';
  if (message.type === 'video') return 'Video';
  if (message.type === 'voice' || message.type === 'audio') return 'Voice message';
  if (message.type === 'file') return message.fileName || 'File';
  return message.body || '';
};

const buildLastMessagePreview = (messageId, message, clientCreatedAt) => ({
  _id: messageId,
  chat: message.chat,
  sender: message.sender,
  senderId: message.senderId,
  type: message.type,
  body: lastMessageLabel(message),
  mediaUrl: message.mediaUrl || '',
  status: 'sent',
  createdAt: new Date(clientCreatedAt).toISOString(),
  clientCreatedAt
});

const sortMessages = (messages) =>
  [...messages].sort((a, b) => {
    const aTime = a.clientCreatedAt || new Date(a.createdAt).getTime() || 0;
    const bTime = b.clientCreatedAt || new Date(b.createdAt).getTime() || 0;
    return aTime - bTime;
  });

const mapStatusDoc = async (statusSnap) => {
  const data = statusSnap.data();
  const createdAt = safeIsoString(data.createdAt) || '';
  const expiresAt = safeIsoString(data.expiresAt) || '';
  return {
    _id: statusSnap.id,
    ...data,
    statusText: data.statusText || data.caption || '',
    statusMedia: data.statusMedia || data.mediaUrl || '',
    mediaUrl: data.statusMedia || data.mediaUrl || '',
    caption: data.statusText || data.caption || '',
    user: await readUser(data.userId),
    createdAt,
    expiresAt
  };
};

export const messagesListEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x._id !== y._id || x.pending !== y.pending) return false;
    if (x.body !== y.body || x.mediaUrl !== y.mediaUrl || x.type !== y.type) return false;
    if (x.fileName !== y.fileName || x.deletedForEveryone !== y.deletedForEveryone) return false;
    if ((x.replyTo?.messageId || '') !== (y.replyTo?.messageId || '')) return false;
    // Compare delivery status so tick updates propagate correctly
    if ((x.seenBy?.length || 0) !== (y.seenBy?.length || 0)) return false;
    if ((x.deliveredTo?.length || 0) !== (y.deliveredTo?.length || 0)) return false;
  }
  return true;
};

export const subscribeMessages = (chatId, handler) => {
  let unsubscribe = () => {};
  let activeChatId = chatId;
  const messageMap = new Map();
  let lastEmitted = null;
  const primaryQuery = query(
    collection(firestore, 'chats', chatId, 'messages'),
    orderBy('clientCreatedAt', 'asc'),
    limit(100)
  );

  const shouldEmit = (newMessages) => {
    if (!lastEmitted) return true;
    if (newMessages.length !== lastEmitted.length) return true;
    for (let i = 0; i < newMessages.length; i++) {
      const n = newMessages[i];
      const l = lastEmitted[i];
      if (n._id !== l._id || n.clientCreatedAt !== l.clientCreatedAt) return true;
      if (n.body !== l.body || n.mediaUrl !== l.mediaUrl || n.type !== l.type) return true;
      if (n.deletedForEveryone !== l.deletedForEveryone) return true;
      if ((n.replyTo?.messageId || '') !== (l.replyTo?.messageId || '')) return true;
      if (n.status !== l.status) return true;
      if ((n.seenBy || []).join(',') !== (l.seenBy || []).join(',') || (n.deliveredTo || []).join(',') !== (l.deliveredTo || []).join(',')) return true;
    }
    return false;
  };

  const emit = () => {
    const messages = sortMessages([...messageMap.values()]);
    if (shouldEmit(messages)) {
      lastEmitted = messages;
      handler(messages);
    }
  };

  const attach = (q) => {
    unsubscribe = onSnapshot(
      q,
      (snap) => {
        if (activeChatId !== chatId) return;
        let hasChanges = false;
        if (!snap.docChanges().length) {
          const ids = new Set(snap.docs.map((docSnap) => docSnap.id));
          snap.docs.forEach((docSnap) => messageMap.set(docSnap.id, mapMessageDoc(docSnap, chatId)));
          for (const id of [...messageMap.keys()]) {
            if (!ids.has(id)) {
              messageMap.delete(id);
              hasChanges = true;
            }
          }
        } else {
          snap.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              messageMap.delete(change.doc.id);
              hasChanges = true;
              return;
            }
            messageMap.set(change.doc.id, mapMessageDoc(change.doc, chatId));
            hasChanges = true;
          });
        }
        if (hasChanges) emit();
      },
      (error) => {
        console.error('Message listener error:', error);
        if (q === primaryQuery) {
          attach(query(collection(firestore, 'chats', chatId, 'messages'), limit(100)));
        }
      }
    );
  };

  attach(primaryQuery);
  return () => {
    activeChatId = null;
    messageMap.clear();
    lastEmitted = null;
    unsubscribe();
  };
};

const matchesPendingMessage = (pending, server) => {
  if (server.senderId !== pending.senderId || server.type !== pending.type) return false;
  // Widen time tolerance to 300s for slow networks / Cloudinary upload latency
  if (Math.abs((server.clientCreatedAt || 0) - (pending.clientCreatedAt || 0)) >= 300000) return false;
  if (pending.type === 'text') return (server.body || '') === (pending.body || '');
  const bodyMatch = (server.body || '') === (pending.body || '');
  // Relaxed media matching: if senderId + type + time match and bodies match,
  // accept even if mediaUrl differs (optimistic has local blob, server has Cloudinary URL)
  const mediaMatch =
    (server.mediaUrl || '') === (pending.mediaUrl || '') ||
    (!pending.mediaUrl && Boolean(server.mediaUrl)) ||
    (pending.mediaUrl?.startsWith('blob:') && Boolean(server.mediaUrl));
  return bodyMatch && mediaMatch;
};

export const mergeWithPendingMessages = (serverMessages, currentMessages) => {
  const pending = currentMessages.filter((item) => item.pending);
  if (!pending.length) return serverMessages;

  const merged = new Map();
  const claimedPending = new Set();
  let hasChanges = false;

  // Build a quick lookup: localKey → pending message for explicit dedup
  const pendingByLocalKey = new Map();
  pending.forEach((item) => pendingByLocalKey.set(item.localKey || item._id, item));

  serverMessages.forEach((server) => {
    // Explicit dedup: if server message was reconciled and has a localKey matching a pending message
    const explicitMatch = server.localKey && pendingByLocalKey.has(server.localKey) && !claimedPending.has(server.localKey);
    if (explicitMatch) {
      claimedPending.add(server.localKey);
      merged.set(server._id, { ...server, pending: false });
      return;
    }
    // Fuzzy matching for messages not yet reconciled
    const match = pending.find((item) => !claimedPending.has(item._id) && matchesPendingMessage(item, server));
    if (match) {
      claimedPending.add(match._id);
      merged.set(server._id, {
        ...server,
        localKey: match.localKey || match._id,
        pending: false
      });
      return;
    }
    merged.set(server._id, server);
  });

  pending.forEach((item) => {
    if (!claimedPending.has(item._id)) {
      merged.set(item._id, item);
      hasChanges = true;
    }
  });

  if (!hasChanges && merged.size === serverMessages.length) {
    return serverMessages;
  }

  return sortMessages([...merged.values()]);
};

/** Replace optimistic message in-place without dropping the rest of the thread. */
export const reconcileSentMessage = (current, tempId, serverMessage) => {
  // Also remove any message with localKey === tempId to prevent duplicates from prior snapshot merges
  const filtered = current.filter((item) => item._id !== tempId && item.localKey !== tempId);
  const serverIdx = filtered.findIndex((item) => item._id === serverMessage._id);
  const merged = { ...serverMessage, localKey: tempId, pending: false };
  
  if (serverIdx >= 0) {
    const next = [...filtered];
    next[serverIdx] = merged;
    return next;
  }
  
  return sortMessages([...filtered, merged]);
};

const typingUserCache = new Map();

export const subscribeTyping = (chatId, handler) => {
  const uid = currentUid();
  return onValue(dbRef(realtimeDb, `typing/${chatId}`), async (snap) => {
    const typing = snap.val() || {};
    const otherUid = Object.keys(typing).find((id) => id !== uid && typing[id]?.isTyping);
    if (!otherUid) {
      handler(null);
      return;
    }
    if (typingUserCache.has(otherUid)) {
      handler(typingUserCache.get(otherUid));
      return;
    }
    const user = await readUserCached(otherUid);
    if (user) typingUserCache.set(otherUid, user);
    handler(user);
  });
};

export const setTyping = (chatId, isTyping) => {
  const uid = currentUid();
  return set(dbRef(realtimeDb, `typing/${chatId}/${uid}`), {
    isTyping,
    updatedAt: rtdbTimestamp()
  });
};

export const canContactUser = (blockState, peerId) => {
  const cleanPeerId = normalizeUid(peerId);
  if (!cleanPeerId || !blockState) return true;
  return !blockState.blocked?.has(cleanPeerId) && !blockState.blockedBy?.has(cleanPeerId);
};

export const subscribeBlockState = (uid, handler) => {
  if (!uid) return () => {};
  const state = { blocked: new Set(), blockedBy: new Set() };
  const emit = () => handler({ blocked: new Set(state.blocked), blockedBy: new Set(state.blockedBy) });

  const unsubBlocked = onSnapshot(collection(firestore, 'users', uid, 'blocked'), (snap) => {
    state.blocked = new Set(snap.docs.map((docSnap) => normalizeUid(docSnap.id)));
    emit();
  });
  const unsubBlockedBy = onSnapshot(collection(firestore, 'users', uid, 'blockedBy'), (snap) => {
    state.blockedBy = new Set(snap.docs.map((docSnap) => normalizeUid(docSnap.id)));
    emit();
  });

  return () => {
    unsubBlocked();
    unsubBlockedBy();
  };
};

const assertContactAllowed = async (transaction, uid, otherUids) => {
  for (const otherUid of otherUids) {
    const theyBlock = await transaction.get(doc(firestore, 'users', otherUid, 'blocked', uid));
    if (theyBlock.exists()) throw new Error('You cannot contact this user.');
    const iBlock = await transaction.get(doc(firestore, 'users', uid, 'blocked', otherUid));
    if (iBlock.exists()) throw new Error('Unblock this user to continue.');
  }
};

const ensureContactAllowed = async (uidInput, otherUidInput) => {
  const uid = normalizeUid(uidInput);
  const otherUid = normalizeUid(otherUidInput);
  if (!uid || !otherUid || uid === otherUid) return;
  const [theyBlock, iBlock] = await Promise.all([
    getDoc(doc(firestore, 'users', otherUid, 'blocked', uid)),
    getDoc(doc(firestore, 'users', uid, 'blocked', otherUid))
  ]);
  if (theyBlock.exists()) throw new Error('You cannot contact this user.');
  if (iBlock.exists()) throw new Error('Unblock this user to continue.');
};

export const api = {
  sync: async (body = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in.');
    const userRef = doc(firestore, 'users', user.uid);
    const existing = await getDoc(userRef);
    const existingData = existing.exists() ? existing.data() : null;
    const pendingName = body.name || body.displayName || user.displayName;
    const defaults = {
      displayName: pendingName || user.email || user.phoneNumber || 'AquaChat user',
      username: cleanUsername(body.username || user.email?.split('@')[0] || user.phoneNumber || `user_${user.uid.slice(0, 6)}`),
      email: normalize(user.email || body.email),
      phoneNumber: (user.phoneNumber || body.phoneNumber || body.phone || '').trim(),
      photoURL: body.photoURL || body.profilePicture || user.photoURL || '',
      bio: body.bio || 'Hey there! I am using AquaChat.',
      settings: {
        theme: 'light',
        statusPrivacy: {
          mode: 'everyone',
          selectedIds: []
        }
      }
    };
    const profile = existingData
      ? {
          email: existingData.email || normalize(user.email || body.email),
          phoneNumber: existingData.phoneNumber || (user.phoneNumber || body.phoneNumber || body.phone || '').trim(),
          settings: existingData.settings || defaults.settings,
          updatedAt: serverTimestamp()
        }
      : {
          ...defaults,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        };
    const keywordSource = existingData ? { ...existingData, ...profile } : profile;

    await setDoc(
      userRef,
      {
        ...profile,
        searchableKeywords: buildKeywords(keywordSource)
      },
      { merge: true }
    );
    // Presence session is started by usePresenceSession in ChatShell / useAuth.
    return { user: await readUser(user.uid), isNewUser: false };
  },

  me: async () => ({ user: await readUser(currentUid()) }),

  updateProfile: async (body = {}) => {
    const uid = currentUid();
    const current = await readUser(uid) || {};
    const updates = {
      displayName: body.name !== undefined ? body.name : (body.displayName !== undefined ? body.displayName : current.displayName),
      username: body.username !== undefined ? cleanUsername(body.username) : current.username,
      photoURL: body.profilePic !== undefined ? body.profilePic : (body.profilePicture !== undefined ? body.profilePicture : (body.photoURL !== undefined ? body.photoURL : current.photoURL)),
      phoneNumber: body.phone !== undefined ? body.phone : (body.phoneNumber !== undefined ? body.phoneNumber : current.phoneNumber),
      email: body.email !== undefined ? normalize(body.email) : current.email,
      bio: body.bio !== undefined ? body.bio : current.bio,
      about: body.about !== undefined ? body.about : (body.bio !== undefined ? body.bio : current.about),
      updatedAt: serverTimestamp()
    };
    await updateDoc(doc(firestore, 'users', uid), {
      ...updates,
      searchableKeywords: buildKeywords(updates)
    });
    // Return optimistic merged data to avoid stale Firestore reads
    const merged = presentUser(uid, { ...current, ...updates });
    userCache.set(uid, merged);
    return { user: merged };
  },

  updateSettings: async (settings = {}) => {
    const uid = currentUid();
    const current = await readUser(uid) || {};
    const currentSettings = current?.settings || {};
    const statusPrivacy = settings.statusPrivacy || currentSettings.statusPrivacy || {};
    const nextSettings = {
      ...currentSettings,
      ...settings,
      theme: settings.theme === 'dark' ? 'dark' : (settings.theme === 'light' ? 'light' : currentSettings.theme || 'light'),
      statusPrivacy: {
        mode: ['everyone', 'connections', 'selected'].includes(statusPrivacy.mode) ? statusPrivacy.mode : 'everyone',
        selectedIds: Array.isArray(statusPrivacy.selectedIds)
          ? statusPrivacy.selectedIds.map(normalizeUid).filter(Boolean)
          : []
      }
    };
    await updateDoc(doc(firestore, 'users', uid), {
      settings: nextSettings,
      updatedAt: serverTimestamp()
    });
    const merged = presentUser(uid, { ...current, settings: nextSettings });
    userCache.set(uid, merged);
    return { user: merged };
  },

  updateTheme: async (theme) => api.updateSettings({ theme }),

  updateStatusPrivacy: async ({ mode, selectedIds = [] }) => {
    const uid = currentUid();
    const cleanMode = ['everyone', 'connections', 'selected'].includes(mode) ? mode : 'everyone';
    const cleanSelectedIds = selectedIds.map(normalizeUid).filter(Boolean);
    const current = await readUser(uid);
    const result = await api.updateSettings({
      ...(current?.settings || {}),
      statusPrivacy: { mode: cleanMode, selectedIds: cleanSelectedIds }
    });
    const activeStatuses = await getDocs(query(collection(firestore, 'statuses'), where('userId', '==', uid), limit(30)));
    if (!activeStatuses.empty) {
      const batch = writeBatch(firestore);
      activeStatuses.docs.forEach((statusDoc) => {
        batch.update(statusDoc.ref, {
          visibility: cleanMode,
          selectedViewerIds: cleanMode === 'selected' ? cleanSelectedIds : []
        });
      });
      await batch.commit();
    }
    return result;
  },

  usersByIds: async (ids = []) => ({ users: await readUsersByIds(ids) }),

  users: async (search = '') => {
    const uid = currentUid();
    const clean = normalize(search).replace(/^@/, '');
    const phone = normalizePhone(search);
    let snaps = [];

    if (clean) {
      const q = query(collection(firestore, 'users'), where('searchableKeywords', 'array-contains', phone || clean), limit(40));
      snaps = (await getDocs(q)).docs;
    } else {
      const q = query(collection(firestore, 'users'), limit(40));
      snaps = (await getDocs(q)).docs;
    }

    const [mySnap, incomingRequestsSnap, sentRequestsSnap, allDocsSource] = await Promise.all([
      getDoc(doc(firestore, 'users', uid)),
      getDocs(query(collection(firestore, 'connectionRequests'), where('receiverId', '==', uid), where('status', '==', 'pending'))).catch(() => ({ docs: [] })),
      getDocs(query(collection(firestore, 'connectionRequests'), where('senderId', '==', uid), where('status', '==', 'pending'))).catch(() => ({ docs: [] })),
      clean && snaps.length < 10 ? getDocs(query(collection(firestore, 'users'), limit(60))) : Promise.resolve(null)
    ]);

    const allDocs = allDocsSource?.docs || snaps;
    const totalSnap = await getDocs(query(collection(firestore, 'users'), limit(60)));
    const totalUsers = totalSnap.docs.filter((snap) => snap.id !== uid).length;
    const connectedIds = new Set(mySnap.data()?.connections || []);
    const incomingIds = new Set(incomingRequestsSnap.docs.map((docSnap) => docSnap.data().senderId));
    const requestedIds = new Set(sentRequestsSnap.docs.map((docSnap) => docSnap.data().receiverId));

    const seen = new Set();
    const users = allDocs
      .filter((snap) => snap.id !== uid)
      .map((snap) => {
        const user = presentUser(snap.id, snap.data());
        const connectionStatus = connectedIds.has(user._id)
          ? 'connected'
          : incomingIds.has(user._id)
            ? 'incoming'
            : requestedIds.has(user._id)
              ? 'requested'
              : user.connectionStatus;
        return {
          ...user,
          connectionStatus
        };
      })
      .filter((user) => {
        if (seen.has(user._id)) return false;
        seen.add(user._id);
        if (!clean) return true;
        return [user.username, user.email, user.phoneNumber, user.displayName].some((value) => normalize(value).includes(clean)) ||
          Boolean(phone && normalizePhone(user.phoneNumber).includes(phone));
      });

    return { users, totalUsers, query: clean };
  },

  chats: async () => {
    const q = query(collection(firestore, 'chats'), where('participantIds', 'array-contains', currentUid()));
    const snap = await getDocs(q);
    const chats = await Promise.all(snap.docs.map(chatDocToObject));
    return { chats: chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)) };
  },

  createDirectChat: async (userIdInput) => {
    const uid = currentUid();
    const userId = String(userIdInput || '').trim();
    if (userId === uid) throw new Error('You cannot message yourself.');
    await ensureContactAllowed(uid, userId);
    const chatId = directChatId(uid, userId);
    const ref = doc(firestore, 'chats', chatId);
    await setDoc(ref, {
      type: 'direct',
      participantIds: [uid, userId],
      adminIds: [uid],
      createdBy: uid,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    }, { merge: true });
    return { chat: await chatDocToObject(await getDoc(ref)) };
  },

  createGroupChat: async ({ name, avatarUrl = '', memberIds = [] }) => {
    const uid = currentUid();
    const normalizedUid = String(uid).trim();
    const trimmedMemberIds = memberIds.map((id) => String(id || '').trim());
    const participantIds = [...new Set([normalizedUid, ...trimmedMemberIds])];
    const ref = await addDoc(collection(firestore, 'chats'), {
      type: 'group',
      name: name.trim(),
      avatarUrl,
      participantIds,
      adminIds: [normalizedUid],
      createdBy: normalizedUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { chat: await chatDocToObject(await getDoc(ref)) };
  },

  updateGroup: async (chatId, body) => {
    await updateDoc(doc(firestore, 'chats', chatId), { ...body, updatedAt: serverTimestamp() });
    return { chat: await chatDocToObject(await getDoc(doc(firestore, 'chats', chatId))) };
  },

  deleteGroupChat: async (chatId) => {
    const uid = currentUid();
    const chatRef = doc(firestore, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
      throw new Error('Group not found.');
    }
    const chatData = chatSnap.data();
    if (chatData.type !== 'group') {
      throw new Error('Only groups can be deleted.');
    }
    const normalizedUid = String(uid).trim();
    const isCreator = String(chatData.createdBy || '').trim() === normalizedUid;
    const adminIds = Array.isArray(chatData.adminIds) ? chatData.adminIds.map(id => String(id || '').trim()) : [];
    const isAdmin = adminIds.includes(normalizedUid);
    if (!isCreator && !isAdmin) {
      throw new Error('Only the group creator or admins can delete the group.');
    }

    // 0. Ensure adminIds field exists and includes the creator so Firestore
    //    security rules don't fail on missing/malformed adminIds.
    const needsAdminFix = !Array.isArray(chatData.adminIds) || (isCreator && !adminIds.includes(normalizedUid));
    if (needsAdminFix) {
      const fixedAdminIds = Array.isArray(chatData.adminIds) 
        ? [...new Set([...adminIds, normalizedUid])] 
        : [normalizedUid];
      await updateDoc(chatRef, { adminIds: fixedAdminIds });
    }

    // 1. Delete all messages first (subcollection)
    const messagesQuery = query(collection(firestore, 'chats', chatId, 'messages'));
    const messagesSnap = await getDocs(messagesQuery);
    
    const batchSize = 400;
    for (let i = 0; i < messagesSnap.docs.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = messagesSnap.docs.slice(i, i + batchSize);
      chunk.forEach((messageDoc) => {
        batch.delete(messageDoc.ref);
      });
      await batch.commit();
    }

    // 2. Delete parent chat document
    await deleteDoc(chatRef);

    // 3. Clean up RTDB call sessions
    try {
      const { get, update } = await import('firebase/database');
      const callsRef = dbRef(realtimeDb, 'calls');
      const snapshot = await get(callsRef);
      if (snapshot.exists()) {
        const callsData = snapshot.val();
        const updates = {};
        Object.keys(callsData).forEach((callId) => {
          if (callId.startsWith(`group_call_${chatId}`)) {
            updates[`calls/${callId}`] = null;
            const callData = callsData[callId];
            if (callData?.participants) {
              Object.keys(callData.participants).forEach((pId) => {
                updates[`userIncoming/${pId}/${callId}`] = null;
              });
            }
          }
        });
        if (Object.keys(updates).length > 0) {
          await update(dbRef(realtimeDb), updates);
        }
      }
    } catch (error) {
      console.warn('[WebRTC] RTDB group call cleanup failed or skipped:', error.message);
    }

    return { ok: true };
  },

  addMembers: async (chatId, memberIds) => {
    const trimmedIds = memberIds.map((id) => String(id || '').trim());
    await updateDoc(doc(firestore, 'chats', chatId), { participantIds: arrayUnion(...trimmedIds), updatedAt: serverTimestamp() });
    return { chat: await chatDocToObject(await getDoc(doc(firestore, 'chats', chatId))) };
  },

  removeMember: async (chatId, userId) => {
    const uid = currentUid();
    const trimmedId = String(userId || '').trim();
    const chatRef = doc(firestore, 'chats', chatId);
    // Self-removal (exit group) is always allowed; removing others requires admin
    if (trimmedId !== uid) {
      const chatSnap = await getDoc(chatRef);
      if (!chatSnap.exists()) throw new Error('Group not found.');
      const chatData = chatSnap.data();
      const normalizedUid = String(uid).trim();
      const isCreator = String(chatData.createdBy || '').trim() === normalizedUid;
      const adminIds = Array.isArray(chatData.adminIds) ? chatData.adminIds.map(id => String(id || '').trim()) : [];
      if (!isCreator && !adminIds.includes(normalizedUid)) {
        throw new Error('Only admins can remove members.');
      }
    }
    // Remove from both participantIds and adminIds (if they were an admin)
    await updateDoc(chatRef, {
      participantIds: arrayRemove(trimmedId),
      adminIds: arrayRemove(trimmedId),
      updatedAt: serverTimestamp()
    });
    return { chat: await chatDocToObject(await getDoc(chatRef)) };
  },

  makeAdmin: async (chatId, userId) => {
    const uid = currentUid();
    const trimmedId = String(userId || '').trim();
    const chatRef = doc(firestore, 'chats', chatId);
    // Verify caller is creator or existing admin
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) throw new Error('Group not found.');
    const chatData = chatSnap.data();
    const normalizedUid = String(uid).trim();
    const isCreator = String(chatData.createdBy || '').trim() === normalizedUid;
    const adminIds = Array.isArray(chatData.adminIds) ? chatData.adminIds.map(id => String(id || '').trim()) : [];
    if (!isCreator && !adminIds.includes(normalizedUid)) {
      throw new Error('Only admins can promote members.');
    }
    await updateDoc(chatRef, { adminIds: arrayUnion(trimmedId), updatedAt: serverTimestamp() });
    return { chat: await chatDocToObject(await getDoc(chatRef)) };
  },

  transferAdmin: async (chatId, newAdminId) => {
    const chatRef = doc(firestore, 'chats', chatId);
    const snap = await getDoc(chatRef);
    if (!snap.exists()) throw new Error('Group not found');
    const data = snap.data();
    const currentAdminIds = (data.adminIds || []).map((id) => String(id || '').trim());
    const uid = currentUid();
    const cleanNewAdminId = String(newAdminId || '').trim();
    const updatedAdminIds = [...new Set([...currentAdminIds.filter((id) => id !== uid), cleanNewAdminId])];
    await updateDoc(chatRef, { adminIds: updatedAdminIds, updatedAt: serverTimestamp() });
    return { chat: await chatDocToObject(await getDoc(chatRef)) };
  },

  deletePersonalChat: async (chatId) => {
    const uid = currentUid();
    const chatRef = doc(firestore, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
      throw new Error('Chat not found.');
    }
    const chatData = chatSnap.data();
    if (chatData.type === 'group') {
      throw new Error('Groups must be deleted via group deletion.');
    }

    // 1. Delete all messages first (subcollection)
    const messagesQuery = query(collection(firestore, 'chats', chatId, 'messages'));
    const messagesSnap = await getDocs(messagesQuery);
    
    const batchSize = 400;
    for (let i = 0; i < messagesSnap.docs.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = messagesSnap.docs.slice(i, i + batchSize);
      chunk.forEach((messageDoc) => {
        batch.delete(messageDoc.ref);
      });
      await batch.commit();
    }

    // 2. Delete parent chat document
    await deleteDoc(chatRef);
    return { ok: true };
  },

  messages: async (chatId) => {
    const snap = await getDocs(query(collection(firestore, 'chats', chatId, 'messages'), orderBy('clientCreatedAt', 'asc'), limit(100)));
    return {
      messages: snap.docs.map((docSnap) => ({ _id: docSnap.id, chat: chatId, ...docSnap.data(), createdAt: safeIsoString(docSnap.data().createdAt) || new Date().toISOString() }))
    };
  },

  sendMessage: async ({ chatId, sender: senderInput, ...payload }) => {
    const uid = currentUid();
    const chatRef = doc(firestore, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) throw new Error('Chat not found.');
    const chatData = chatSnap.data();
    const participantIds = (chatData.participantIds || []).map(normalizeUid);
    if (!participantIds.includes(uid)) throw new Error('You do not have access to this chat.');
    if (chatData.type === 'direct') {
      const peerId = participantIds.find((id) => id !== uid);
      if (peerId) await ensureContactAllowed(uid, peerId);
    }
    const messageRef = doc(collection(firestore, 'chats', chatId, 'messages'));
    const sender = senderInput || (await readUserCached(uid));
    const clientCreatedAt = Date.now();
    const message = {
      chat: chatId,
      sender,
      senderId: uid,
      type: payload.type || 'text',
      body: payload.body || '',
      mediaUrl: payload.mediaUrl || '',
      storagePath: payload.storagePath || '',
      fileName: payload.fileName || '',
      fileSize: payload.fileSize || 0,
      mimeType: payload.mimeType || '',
      duration: payload.duration || 0,
      replyTo: payload.replyTo || null,
      deletedFor: [],
      deletedForEveryone: false,
      status: 'sent',
      seenBy: [uid],
      deliveredTo: [uid],
      clientCreatedAt,
      createdAt: serverTimestamp()
    };

    const preview = buildLastMessagePreview(messageRef.id, message, clientCreatedAt);

    // Use writeBatch instead of runTransaction — eliminates 2-3 round trips.
    // Block check is done at the UI layer (canContactUser) before calling sendMessage.
    const batch = writeBatch(firestore);
    batch.set(messageRef, message);
    batch.update(chatRef, {
      lastMessage: preview,
      updatedAt: serverTimestamp()
    });
    await batch.commit();

    return {
      message: {
        _id: messageRef.id,
        id: messageRef.id,
        ...message,
        createdAt: new Date(clientCreatedAt).toISOString(),
        pending: false
      }
    };
  },

  deleteMessageForMe: async (chatId, messageId) => {
    const uid = currentUid();
    const messageRef = doc(firestore, 'chats', chatId, 'messages', messageId);
    await updateDoc(messageRef, { deletedFor: arrayUnion(uid) });
    return { ok: true };
  },

  deleteMessageForEveryone: async (chatId, messageId) => {
    const uid = currentUid();
    const messageRef = doc(firestore, 'chats', chatId, 'messages', messageId);
    const snap = await getDoc(messageRef);
    if (!snap.exists()) throw new Error('Message not found.');
    if (snap.data().senderId !== uid) throw new Error('Only the sender can delete this message for everyone.');

    await updateDoc(messageRef, {
      deletedForEveryone: true,
      body: '',
      mediaUrl: '',
      deletedAt: serverTimestamp(),
      deletedBy: uid
    });

    const chatRef = doc(firestore, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.data()?.lastMessage?._id === messageId) {
      await updateDoc(chatRef, {
        lastMessage: {
          _id: messageId,
          type: 'text',
          body: 'This message was deleted',
          senderId: uid,
          deletedForEveryone: true,
          createdAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      });
    }
    return { ok: true };
  },

  deleteMessagesForMe: async (chatId, messageIds = []) => {
    const uid = currentUid();
    const batch = writeBatch(firestore);
    messageIds.forEach((messageId) => {
      batch.update(doc(firestore, 'chats', chatId, 'messages', messageId), { deletedFor: arrayUnion(uid) });
    });
    await batch.commit();
    return { ok: true };
  },

  upload: async (file, { onProgress } = {}) => {
    const uid = currentUid();
    const prepared = await prepareUploadFile(file);
    const msgType = detectMessageType(prepared);
    const resourceType = msgType === 'image' ? 'image' : msgType === 'video' ? 'video' : 'auto';

    const result = await uploadToCloudinary(prepared, {
      folder: `aquachat/uploads/${uid}`,
      resourceType,
      onProgress
    });

    return {
      url: result.secureUrl,
      publicId: result.publicId,
      storagePath: result.publicId,
      resourceType: result.resourceType || resourceType,
      fileName: prepared.name,
      fileSize: result.bytes || prepared.size,
      mimeType: prepared.type || ''
    };
  },

  uploadStatusMedia: async (file, { onProgress } = {}) => {
    const uid = currentUid();
    // Compress status images (previously uploaded raw)
    const prepared = await prepareUploadFile(file);
    const resourceType = prepared.type?.startsWith('video/') ? 'video' : 'image';

    const result = await uploadToCloudinary(prepared, {
      folder: `aquachat/statuses/${uid}`,
      resourceType,
      onProgress
    });

    return {
      url: result.secureUrl,
      storagePath: result.publicId,
      resourceType: result.resourceType || resourceType
    };
  },

  uploadProfilePhoto: async (file, { onProgress } = {}) => {
    const uid = currentUid();
    const prepared = await compressProfilePhoto(file);

    const result = await uploadImageToCloudinary(prepared, {
      folder: `aquachat/profiles/${uid}`,
      onProgress
    });

    const url = result.secureUrl;

    // Update Firestore immediately — don't await readUser afterwards
    const userRef = doc(firestore, 'users', uid);
    const userData = {
      photoURL: url,
      updatedAt: serverTimestamp()
    };

    // Fire-and-forget the Firestore update — the UI already has the URL
    const updatePromise = updateDoc(userRef, userData).catch(() =>
      setDoc(userRef, userData, { merge: true })
    );

    // Start the Firestore write but don't block the return
    await updatePromise;

    // Bust userCache so other components pick up the new photo URL
    userCache.delete(uid);

    return {
      url,
      user: {
        _id: uid,
        firebaseUid: uid,
        photoURL: url
      }
    };
  },

  saveMessagingToken: async (token) => {
    if (!token) throw new Error('Missing messaging token');
    const uid = currentUid();
    const userRef = doc(firestore, 'users', uid);
    try {
      await updateDoc(userRef, {
        fcmTokens: arrayUnion(token),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      await setDoc(userRef, {
        fcmTokens: [token],
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    return { ok: true };
  },

  subscribeUser: (uid, handler) => {
    if (!uid) return () => {};
    return onSnapshot(doc(firestore, 'users', uid), (snap) => {
      handler(snap.exists() ? presentUser(snap.id, snap.data()) : null);
    });
  },

  seen: async (chatId) => {
    const uid = currentUid();
    // Only query messages not yet seen by this user to reduce read overhead
    const q = query(
      collection(firestore, 'chats', chatId, 'messages'),
      orderBy('clientCreatedAt', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(firestore);
    let count = 0;
    snap.docs.forEach((messageDoc) => {
      const data = messageDoc.data();
      if (data.senderId !== uid && !data.seenBy?.includes(uid) && !data.deletedForEveryone) {
        batch.update(messageDoc.ref, { seenBy: arrayUnion(uid) });
        count += 1;
      }
    });
    if (count > 0) await batch.commit();
    return { ok: true };
  },

  deliver: async (chatId) => {
    const uid = currentUid();
    const q = query(
      collection(firestore, 'chats', chatId, 'messages'),
      orderBy('clientCreatedAt', 'desc'),
      limit(30)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(firestore);
    let count = 0;
    snap.docs.forEach((messageDoc) => {
      const data = messageDoc.data();
      if (data.senderId !== uid && !data.deliveredTo?.includes(uid) && !data.seenBy?.includes(uid) && !data.deletedForEveryone) {
        batch.update(messageDoc.ref, { deliveredTo: arrayUnion(uid) });
        count += 1;
      }
    });
    if (count > 0) await batch.commit();
    return { ok: true };
  },

  markMessageDelivered: async (chatId, messageId) => {
    const uid = currentUid();
    const ref = doc(firestore, 'chats', chatId, 'messages', messageId);
    await updateDoc(ref, { deliveredTo: arrayUnion(uid) });
    return { ok: true };
  },

  statuses: async () => {
    const snap = await getDocs(query(collection(firestore, 'statuses'), orderBy('createdAt', 'desc'), limit(60)));
    const now = Date.now();
    const statuses = (
      await Promise.all(snap.docs.map((statusSnap) => mapStatusDoc(statusSnap)))
    ).filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now);
    pruneStatusViewedLocal(statuses.map((item) => item._id));
    return { statuses };
  },

  subscribeStatuses: (handler) => {
    const q = query(collection(firestore, 'statuses'), orderBy('createdAt', 'desc'), limit(60));
    return onSnapshot(q, async (snap) => {
      const now = Date.now();
      const statuses = (
        await Promise.all(snap.docs.map((statusSnap) => mapStatusDoc(statusSnap)))
      ).filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now);
      pruneStatusViewedLocal(statuses.map((item) => item._id));
      handler(statuses);
    });
  },

  createStatus: async (body) => {
    const uid = currentUid();
    const user = await readUser(uid);
    const statusPrivacy = user?.settings?.statusPrivacy || { mode: 'everyone', selectedIds: [] };
    const expiresAtDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiresAt = Timestamp.fromDate(expiresAtDate);
    const payload = {
      type: body.type || 'text',
      statusText: body.statusText || body.caption || '',
      statusMedia: body.statusMedia || body.mediaUrl || '',
      caption: body.statusText || body.caption || '',
      mediaUrl: body.statusMedia || body.mediaUrl || '',
      userId: uid,
      ownerId: uid,
      visibility: statusPrivacy.mode || 'everyone',
      selectedViewerIds: statusPrivacy.mode === 'selected' ? (statusPrivacy.selectedIds || []).map(normalizeUid).filter(Boolean) : [],
      createdAt: serverTimestamp(),
      expiresAt,
      seenBy: []
    };
    const ref = await addDoc(collection(firestore, 'statuses'), payload);
    return {
      status: {
        _id: ref.id,
        ...payload,
        expiresAt: expiresAtDate.toISOString(),
        user: await readUser(uid),
        createdAt: new Date().toISOString()
      }
    };
  },

  markStatusSeen: async (statusId) => {
    await updateDoc(doc(firestore, 'statuses', statusId), { seenBy: arrayUnion(currentUid()) });
    return { ok: true };
  },

  deleteStatus: async (statusIdInput) => {
    const uid = currentUid();
    const statusId = String(statusIdInput || '').trim();
    if (!statusId) throw new Error('Missing status id.');
    const statusRef = doc(firestore, 'statuses', statusId);
    const snap = await getDoc(statusRef);
    if (!snap.exists()) return { ok: true };
    const data = snap.data();
    const owner = normalizeUid(data.ownerId || data.userId || data.user?.uid || data.user?._id);
    if (owner !== uid) throw new Error('You can delete only your own status.');
    await deleteDoc(statusRef);
    return { ok: true };
  },

  connectUser: async (userIdInput) => {
    const uid = currentUid();
    const userId = String(userIdInput || '').trim();
    if (userId === uid) throw new Error('You cannot connect with yourself.');
    await ensureContactAllowed(uid, userId);
    await updateDoc(doc(firestore, 'users', uid), { connections: arrayUnion(userId) });
    const { chat } = await api.createDirectChat(userId);
    return { status: 'connected', chatId: chat._id, chat };
  },
  sendConnectionRequest: async (userIdInput) => {
    const uid = currentUid();
    const userId = String(userIdInput || '').trim();
    if (userId === uid) throw new Error('You cannot connect with yourself.');
    await ensureContactAllowed(uid, userId);
    const requestId = `${uid}_${userId}`;
    await setDoc(doc(firestore, 'connectionRequests', requestId), {
      senderId: uid,
      receiverId: userId,
      status: 'pending',
      createdAt: serverTimestamp()
    }, { merge: true });
    return { status: 'requested' };
  },
  acceptConnectionRequest: async (requestIdInput) => {
    const uid = currentUid();
    const requestId = String(requestIdInput || '').trim();
    const snap = await getDoc(doc(firestore, 'connectionRequests', requestId));
    if (!snap.exists()) throw new Error('Connection request not found.');
    const data = snap.data();
    const senderId = String(data.senderId || '').trim();
    const receiverId = String(data.receiverId || '').trim();
    if (receiverId !== uid) throw new Error('You can only accept requests sent to you.');
    if (data.status !== 'pending') throw new Error('Request is not pending.');
    
    await updateDoc(doc(firestore, 'connectionRequests', requestId), { status: 'accepted' });
    await updateDoc(doc(firestore, 'users', uid), { connections: arrayUnion(senderId) });
    await updateDoc(doc(firestore, 'users', senderId), { connections: arrayUnion(uid) });
    
    const { chat } = await api.createDirectChat(senderId);
    return { status: 'connected', chatId: chat._id, chat };
  },
  rejectConnectionRequest: async (requestIdInput) => {
    const uid = currentUid();
    const requestId = String(requestIdInput || '').trim();
    const snap = await getDoc(doc(firestore, 'connectionRequests', requestId));
    if (!snap.exists()) throw new Error('Connection request not found.');
    const data = snap.data();
    const receiverId = String(data.receiverId || '').trim();
    if (receiverId !== uid) throw new Error('You can only reject requests sent to you.');
    
    await updateDoc(doc(firestore, 'connectionRequests', requestId), { status: 'rejected' });
    return { status: 'rejected' };
  },
  disconnectUser: async (userIdInput) => {
    const uid = currentUid();
    const userId = String(userIdInput || '').trim();
    if (userId === uid) throw new Error('You cannot disconnect from yourself.');
    await updateDoc(doc(firestore, 'users', uid), { connections: arrayRemove(userId) });
    await updateDoc(doc(firestore, 'users', userId), { connections: arrayRemove(uid) }).catch((error) => {
      console.error('[Disconnect Peer Error] userId:', userId, '| UID:', uid, '| Error:', error);
      if (error?.code !== 'permission-denied') throw error;
    });
    return { status: 'disconnected' };
  },
  subscribeConnectionRequests: (uid, handler) => {
    const incomingQuery = query(
      collection(firestore, 'connectionRequests'),
      where('receiverId', '==', uid),
      where('status', '==', 'pending')
    );
    const sentQuery = query(
      collection(firestore, 'connectionRequests'),
      where('senderId', '==', uid),
      where('status', '==', 'pending')
    );
    
    const state = { incoming: [], sent: [] };
    const emit = () => handler({ incoming: state.incoming, sent: state.sent });

    const incomingUnsub = onSnapshot(
      incomingQuery,
      async (snap) => {
        const requests = await Promise.all(
          snap.docs.map(async (docSnap) => {
            const data = docSnap.data();
            const sender = await readUserCached(data.senderId);
            return {
              _id: docSnap.id,
              ...data,
              sender,
              type: 'incoming'
            };
          })
        );
        state.incoming = requests;
        emit();
      },
      () => {
        state.incoming = [];
        emit();
      }
    );
    
    const sentUnsub = onSnapshot(
      sentQuery,
      async (snap) => {
        const requests = await Promise.all(
          snap.docs.map(async (docSnap) => {
            const data = docSnap.data();
            const receiver = await readUserCached(data.receiverId);
            return {
              _id: docSnap.id,
              ...data,
              receiver,
              type: 'sent'
            };
          })
        );
        state.sent = requests;
        emit();
      },
      () => {
        state.sent = [];
        emit();
      }
    );
    
    return () => {
      incomingUnsub();
      sentUnsub();
    };
  },
  acceptConnection: async (userId) => api.connectUser(userId),
  followUser: async (userId) => {
    const uid = currentUid();
    const snap = await getDoc(doc(firestore, 'users', uid));
    const following = snap.data()?.following || [];
    const isFollowing = following.includes(userId);
    await updateDoc(doc(firestore, 'users', uid), { following: isFollowing ? arrayRemove(userId) : arrayUnion(userId) });
    return { isFollowing: !isFollowing };
  },

  blockUser: async (blockedUid) => {
    const uid = currentUid();
    const blockedId = normalizeUid(blockedUid);
    if (blockedId === uid) throw new Error('You cannot block yourself.');
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'users', uid, 'blocked', blockedId), {
      blockedUid: blockedId,
      blockedAt: serverTimestamp()
    });
    batch.set(doc(firestore, 'users', blockedId, 'blockedBy', uid), {
      blockerId: uid,
      blockedAt: serverTimestamp()
    });
    await batch.commit();
    return { ok: true };
  },

  unblockUser: async (blockedUid) => {
    const uid = currentUid();
    const blockedId = normalizeUid(blockedUid);
    const batch = writeBatch(firestore);
    batch.delete(doc(firestore, 'users', uid, 'blocked', blockedId));
    batch.delete(doc(firestore, 'users', blockedId, 'blockedBy', uid));
    await batch.commit();
    return { ok: true };
  },

  subscribeBlockedUsers: (uidInput, handler) => {
    const uid = normalizeUid(uidInput);
    if (!uid) return () => {};
    return onSnapshot(collection(firestore, 'users', uid, 'blocked'), async (snap) => {
      const rows = await Promise.all(snap.docs.map(async (docSnap) => {
        const blockedUid = normalizeUid(docSnap.id || docSnap.data()?.blockedUid);
        const user = await readUserCached(blockedUid);
        return {
          _id: blockedUid,
          blockedAt: safeIsoString(docSnap.data()?.blockedAt),
          user: user || { _id: blockedUid, displayName: 'AquaChat user', username: '' }
        };
      }));
      handler(rows.filter((row) => row._id));
    });
  },

  isUserBlocked: async (blockedUid) => {
    const uid = currentUid();
    const snap = await getDoc(doc(firestore, 'users', uid, 'blocked', blockedUid));
    return snap.exists();
  },

  exportChatHistory: async (chatId) => {
    const uid = currentUid();
    const chatSnap = await getDoc(doc(firestore, 'chats', chatId));
    if (!chatSnap.exists() || !chatSnap.data()?.participantIds?.includes(uid)) {
      throw new Error('You do not have access to this chat.');
    }
    const snap = await getDocs(
      query(collection(firestore, 'chats', chatId, 'messages'), orderBy('clientCreatedAt', 'asc'), limit(500))
    );
    return {
      chat: { _id: chatId, ...chatSnap.data() },
      messages: snap.docs.map((docSnap) => mapMessageDoc(docSnap, chatId)).filter((m) => !m.deletedFor?.includes(uid))
    };
  },

  getSharedMedia: async (chatId) => {
    const uid = currentUid();
    const snap = await getDocs(
      query(
        collection(firestore, 'chats', chatId, 'messages'),
        orderBy('clientCreatedAt', 'desc'),
        limit(200)
      )
    );
    const all = snap.docs
      .map((d) => mapMessageDoc(d, chatId))
      .filter((m) => !m.deletedFor?.includes(uid) && !m.deletedForEveryone);

    return {
      media: all.filter((m) => (m.type === 'image' || m.type === 'video') && m.mediaUrl),
      links: all.filter((m) => m.type === 'text' && m.body && /https?:\/\/\S+/i.test(m.body)),
      docs: all.filter((m) => m.type === 'file' && m.mediaUrl)
    };
  }
};
