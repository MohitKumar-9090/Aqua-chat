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
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { compressProfilePhoto, prepareUploadFile } from './utils/messageMedia.js';
import { pruneStatusViewedLocal } from './utils/statusViewed.js';
import { onAuthStateChanged } from 'firebase/auth';
import { onValue, ref as dbRef, serverTimestamp as rtdbTimestamp, set } from 'firebase/database';
import { auth, firestore, realtimeDb, storage } from './firebase.js';

const cleanUsername = (value = '') => value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
const normalize = (value = '') => value.toString().trim().toLowerCase();
const normalizePhone = (value = '') => value.toString().replace(/[^\d+]/g, '');
const toId = (uid) => uid;

const prefixes = (value = '') => {
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

const currentUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be logged in.');
  return uid;
};

const presentUser = (id, data = {}) => ({
  _id: id,
  uid: id,
  firebaseUid: id,
  displayName: data.displayName || data.name || data.email || data.phoneNumber || 'AquaChat user',
  name: data.displayName || data.name || '',
  username: data.username || '',
  email: data.email || '',
  phoneNumber: data.phoneNumber || data.phone || '',
  phone: data.phoneNumber || data.phone || '',
  photoURL: data.photoURL || data.profilePic || data.profilePicture || '',
  profilePic: data.photoURL || data.profilePic || '',
  profilePicture: data.photoURL || data.profilePicture || '',
  bio: data.bio || 'Hey there! I am using AquaChat.',
  verified: Boolean(data.verified),
  isOnline: Boolean(data.isOnline || data.online),
  lastSeen: data.lastSeen?.toDate?.()?.toISOString?.() || data.lastSeen || '',
  connectionStatus: data.connectionStatus || 'none',
  isFollowing: Boolean(data.isFollowing),
  followsMe: Boolean(data.followsMe)
});

const readUser = async (uid) => {
  const snap = await getDoc(doc(firestore, 'users', uid));
  return snap.exists() ? presentUser(snap.id, snap.data()) : null;
};

const usersByIds = async (ids = []) => {
  const pairs = await Promise.all([...new Set(ids)].map(async (id) => [id, await readUser(id)]));
  return Object.fromEntries(pairs.filter(([, user]) => user));
};

const chatDocToObject = async (snap) => {
  const data = snap.data();
  const userMap = await usersByIds(data.participantIds || []);
  return {
    _id: snap.id,
    id: snap.id,
    type: data.type || 'direct',
    name: data.name || '',
    avatarUrl: data.avatarUrl || '',
    participantIds: data.participantIds || [],
    participants: (data.participantIds || []).map((uid) => ({
      user: userMap[uid] || { _id: uid, displayName: 'AquaChat user' },
      role: data.adminIds?.includes(uid) ? 'admin' : 'member',
      joinedAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || ''
    })),
    createdBy: data.createdBy,
    lastMessage: data.lastMessage || null,
    unreadCount: data.unreadCounts?.[currentUid()] || 0,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || new Date().toISOString()
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

export const subscribeChats = (handler) => {
  const uid = currentUid();
  const q = query(collection(firestore, 'chats'), where('participantIds', 'array-contains', uid));
  return onSnapshot(q, async (snap) => {
    const chats = await Promise.all(snap.docs.map(chatDocToObject));
    handler(chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
  });
};

const messageCreatedAt = (data) => {
  if (data.createdAt?.toDate) return data.createdAt.toDate().toISOString();
  if (typeof data.createdAt === 'string' && data.createdAt) return data.createdAt;
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
    deletedAt: data.deletedAt?.toDate?.()?.toISOString?.() || data.deletedAt || null,
    status: data.status || 'sent',
    seenBy: data.seenBy || [],
    deliveredTo: data.deliveredTo || [],
    clientCreatedAt: data.clientCreatedAt || (data.createdAt?.toDate?.() ? data.createdAt.toDate().getTime() : 0),
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
  const createdAt = data.createdAt?.toDate?.()?.toISOString?.() || '';
  const expiresAt = data.expiresAt?.toDate?.()?.toISOString?.() || data.expiresAt || '';
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

const applySnapshot = (snap, chatId, handler) => {
  const unique = new Map();
  snap.docs.forEach((docSnap) => {
    unique.set(docSnap.id, mapMessageDoc(docSnap, chatId));
  });
  handler(sortMessages([...unique.values()]));
};

export const subscribeMessages = (chatId, handler) => {
  let unsubscribe = () => {};
  let activeChatId = chatId;
  const queries = [
    query(collection(firestore, 'chats', chatId, 'messages'), orderBy('clientCreatedAt', 'asc'), limit(100)),
    query(collection(firestore, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(100)),
    query(collection(firestore, 'chats', chatId, 'messages'), limit(100))
  ];

  const attachAt = (index = 0) => {
    if (index >= queries.length) return;
    unsubscribe = onSnapshot(
      queries[index],
      (snap) => {
        if (activeChatId !== chatId) return;
        applySnapshot(snap, chatId, handler);
      },
      (error) => {
        console.error('Message listener error:', error);
        if (index + 1 < queries.length) attachAt(index + 1);
      }
    );
  };

  attachAt(0);
  return () => {
    activeChatId = null;
    unsubscribe();
  };
};

export const mergeWithPendingMessages = (serverMessages, currentMessages) => {
  const pending = currentMessages.filter((item) => item.pending);
  const merged = new Map();
  serverMessages.forEach((item) => merged.set(item._id, item));

  pending.forEach((item) => {
    const matched = serverMessages.some(
      (server) =>
        server.senderId === item.senderId &&
        server.type === item.type &&
        server.body === item.body &&
        server.mediaUrl === item.mediaUrl &&
        Math.abs((server.clientCreatedAt || 0) - (item.clientCreatedAt || 0)) < 60000
    );
    if (!matched) merged.set(item._id, item);
  });

  return sortMessages([...merged.values()]);
};

export const subscribeTyping = (chatId, handler) => {
  const uid = currentUid();
  return onValue(dbRef(realtimeDb, `typing/${chatId}`), async (snap) => {
    const typing = snap.val() || {};
    const otherUid = Object.keys(typing).find((id) => id !== uid && typing[id]?.isTyping);
    handler(otherUid ? await readUser(otherUid) : null);
  });
};

export const setTyping = (chatId, isTyping) => {
  const uid = currentUid();
  return set(dbRef(realtimeDb, `typing/${chatId}/${uid}`), {
    isTyping,
    updatedAt: rtdbTimestamp()
  });
};

export const api = {
  sync: async (body = {}) => {
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in.');
    const pendingName = body.name || body.displayName || user.displayName;
    const profile = {
      displayName: pendingName || user.email || user.phoneNumber || 'AquaChat user',
      username: cleanUsername(body.username || user.email?.split('@')[0] || user.phoneNumber || `user_${user.uid.slice(0, 6)}`),
      email: normalize(user.email || body.email),
      phoneNumber: (user.phoneNumber || body.phoneNumber || body.phone || '').trim(),
      photoURL: body.photoURL || body.profilePicture || user.photoURL || '',
      bio: body.bio || 'Hey there! I am using AquaChat.',
      updatedAt: serverTimestamp()
    };

    const userRef = doc(firestore, 'users', user.uid);
    const existing = await getDoc(userRef);
    await setDoc(
      userRef,
      {
        ...profile,
        searchableKeywords: buildKeywords(profile),
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() })
      },
      { merge: true }
    );
    // Presence session is started by usePresenceSession in ChatShell / useAuth.
    return { user: await readUser(user.uid), isNewUser: false };
  },

  me: async () => ({ user: await readUser(currentUid()) }),

  updateProfile: async (body = {}) => {
    const uid = currentUid();
    const current = await readUser(uid);
    const updates = {
      displayName: body.name || body.displayName || current.displayName,
      username: cleanUsername(body.username || current.username),
      photoURL: body.profilePic || body.profilePicture || body.photoURL || current.photoURL,
      phoneNumber: body.phone || body.phoneNumber || current.phoneNumber,
      email: normalize(body.email || current.email),
      bio: body.bio ?? current.bio,
      updatedAt: serverTimestamp()
    };
    await updateDoc(doc(firestore, 'users', uid), {
      ...updates,
      searchableKeywords: buildKeywords(updates)
    });
    return { user: await readUser(uid) };
  },

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

    const [mySnap, chatsSnap, allDocsSource] = await Promise.all([
      getDoc(doc(firestore, 'users', uid)),
      getDocs(query(collection(firestore, 'chats'), where('participantIds', 'array-contains', uid))),
      clean && snaps.length < 10 ? getDocs(query(collection(firestore, 'users'), limit(60))) : Promise.resolve(null)
    ]);

    const allDocs = allDocsSource?.docs || snaps;
    const totalSnap = await getDocs(query(collection(firestore, 'users'), limit(60)));
    const totalUsers = totalSnap.docs.filter((snap) => snap.id !== uid).length;
    const connectedIds = new Set(mySnap.data()?.connections || []);
    chatsSnap.docs.forEach((chatDoc) => {
      (chatDoc.data().participantIds || []).filter((id) => id !== uid).forEach((id) => connectedIds.add(id));
    });

    const seen = new Set();
    const users = allDocs
      .filter((snap) => snap.id !== uid)
      .map((snap) => {
        const user = presentUser(snap.id, snap.data());
        return {
          ...user,
          connectionStatus: connectedIds.has(user._id) ? 'connected' : user.connectionStatus
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

  createDirectChat: async (userId) => {
    const uid = currentUid();
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
    const participantIds = [...new Set([uid, ...memberIds])];
    const ref = await addDoc(collection(firestore, 'chats'), {
      type: 'group',
      name: name.trim(),
      avatarUrl,
      participantIds,
      adminIds: [uid],
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { chat: await chatDocToObject(await getDoc(ref)) };
  },

  updateGroup: async (chatId, body) => {
    await updateDoc(doc(firestore, 'chats', chatId), { ...body, updatedAt: serverTimestamp() });
    return { chat: await chatDocToObject(await getDoc(doc(firestore, 'chats', chatId))) };
  },

  addMembers: async (chatId, memberIds) => {
    await updateDoc(doc(firestore, 'chats', chatId), { participantIds: arrayUnion(...memberIds), updatedAt: serverTimestamp() });
    return { chat: await chatDocToObject(await getDoc(doc(firestore, 'chats', chatId))) };
  },

  removeMember: async (chatId, userId) => {
    await updateDoc(doc(firestore, 'chats', chatId), { participantIds: arrayRemove(userId), updatedAt: serverTimestamp() });
    return { chat: await chatDocToObject(await getDoc(doc(firestore, 'chats', chatId))) };
  },

  messages: async (chatId) => {
    const snap = await getDocs(query(collection(firestore, 'chats', chatId, 'messages'), orderBy('clientCreatedAt', 'asc'), limit(100)));
    return {
      messages: snap.docs.map((docSnap) => ({ _id: docSnap.id, chat: chatId, ...docSnap.data(), createdAt: docSnap.data().createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString() }))
    };
  },

  sendMessage: async ({ chatId, ...payload }) => {
    const uid = currentUid();
    const chatRef = doc(firestore, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists() || !chatSnap.data()?.participantIds?.includes(uid)) {
      throw new Error('Chat not found or you are not a participant.');
    }

    const messageRef = doc(collection(firestore, 'chats', chatId, 'messages'));
    const sender = await readUser(uid);
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

    await runTransaction(firestore, async (transaction) => {
      transaction.set(messageRef, message);
      transaction.update(chatRef, {
        lastMessage: preview,
        updatedAt: serverTimestamp()
      });
    });
    return { message: { ...preview, seenBy: [uid], deliveredTo: [uid], deletedFor: [], deletedForEveryone: false } };
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
    const path = `uploads/${uid}/${Date.now()}-${prepared.name}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, prepared, { contentType: prepared.type || 'application/octet-stream' });

    await new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes) {
            onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          }
        },
        reject,
        resolve
      );
    });

    return {
      url: await getDownloadURL(ref),
      publicId: path,
      storagePath: path,
      resourceType: prepared.type.startsWith('video/') ? 'video' : prepared.type.startsWith('audio/') ? 'audio' : prepared.type.startsWith('image/') ? 'image' : 'file',
      fileName: prepared.name,
      fileSize: prepared.size,
      mimeType: prepared.type || ''
    };
  },

  uploadProfilePhoto: async (file, { onProgress } = {}) => {
    const uid = currentUid();
    const prepared = await compressProfilePhoto(file);
    const path = `profiles/${uid}/avatar-${Date.now()}.jpg`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, prepared, { contentType: 'image/jpeg' });

    await new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes) {
            onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          }
        },
        reject,
        resolve
      );
    });

    const url = await getDownloadURL(ref);
    await updateDoc(doc(firestore, 'users', uid), {
      photoURL: url,
      profilePic: url,
      profilePicture: url,
      updatedAt: serverTimestamp()
    });
    return { url, user: await readUser(uid) };
  },

  subscribeUser: (uid, handler) => {
    if (!uid) return () => {};
    return onSnapshot(doc(firestore, 'users', uid), (snap) => {
      handler(snap.exists() ? presentUser(snap.id, snap.data()) : null);
    });
  },

  seen: async (chatId) => {
    const uid = currentUid();
    const snap = await getDocs(query(collection(firestore, 'chats', chatId, 'messages'), limit(100)));
    const batch = writeBatch(firestore);
    snap.docs.forEach((messageDoc) => {
      const data = messageDoc.data();
      if (data.senderId !== uid && !data.seenBy?.includes(uid) && !data.deletedForEveryone) {
        batch.update(messageDoc.ref, { seenBy: arrayUnion(uid), status: 'seen' });
      }
    });
    await batch.commit();
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
    const expiresAtDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiresAt = Timestamp.fromDate(expiresAtDate);
    const payload = {
      type: body.type || 'text',
      statusText: body.statusText || body.caption || '',
      statusMedia: body.statusMedia || body.mediaUrl || '',
      caption: body.statusText || body.caption || '',
      mediaUrl: body.statusMedia || body.mediaUrl || '',
      userId: uid,
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

  connectUser: async (userId) => {
    const uid = currentUid();
    if (userId === uid) throw new Error('You cannot connect with yourself.');
    await updateDoc(doc(firestore, 'users', uid), { connections: arrayUnion(userId) });
    const { chat } = await api.createDirectChat(userId);
    return { status: 'connected', chatId: chat._id, chat };
  },
  acceptConnection: async (userId) => api.connectUser(userId),
  followUser: async (userId) => {
    const uid = currentUid();
    const snap = await getDoc(doc(firestore, 'users', uid));
    const following = snap.data()?.following || [];
    const isFollowing = following.includes(userId);
    await updateDoc(doc(firestore, 'users', uid), { following: isFollowing ? arrayRemove(userId) : arrayUnion(userId) });
    return { isFollowing: !isFollowing };
  }
};
