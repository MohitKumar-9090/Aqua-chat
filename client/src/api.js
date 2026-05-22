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
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { onDisconnect, onValue, ref as dbRef, serverTimestamp as rtdbTimestamp, set } from 'firebase/database';
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

export const subscribePresence = (handler) => {
  const presenceRef = dbRef(realtimeDb, 'presence');
  return onValue(presenceRef, (snap) => {
    const value = snap.val() || {};
    handler(value);
  });
};

export const setCurrentPresence = (uid) => {
  const ref = dbRef(realtimeDb, `presence/${uid}`);
  set(ref, { isOnline: true, lastSeen: rtdbTimestamp() });
  onDisconnect(ref).set({ isOnline: false, lastSeen: rtdbTimestamp() });
};

export const subscribeChats = (handler) => {
  const uid = currentUid();
  const q = query(collection(firestore, 'chats'), where('participantIds', 'array-contains', uid));
  return onSnapshot(q, async (snap) => {
    const chats = await Promise.all(snap.docs.map(chatDocToObject));
    handler(chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
  });
};

export const subscribeMessages = (chatId, handler) => {
  const q = query(collection(firestore, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(100));
  return onSnapshot(q, (snap) => {
    handler(snap.docs.map((messageSnap) => {
      const data = messageSnap.data();
      return {
        _id: messageSnap.id,
        id: messageSnap.id,
        chat: chatId,
        sender: data.sender,
        type: data.type || 'text',
        body: data.body || '',
        mediaUrl: data.mediaUrl || '',
        status: data.status || 'sent',
        seenBy: data.seenBy || [],
        deliveredTo: data.deliveredTo || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || new Date().toISOString()
      };
    }));
  });
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

    await setDoc(doc(firestore, 'users', user.uid), {
      ...profile,
      searchableKeywords: buildKeywords(profile),
      createdAt: serverTimestamp()
    }, { merge: true });
    setCurrentPresence(user.uid);
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
      const q = query(collection(firestore, 'users'), limit(80));
      snaps = (await getDocs(q)).docs;
    }

    const allDocs = clean && snaps.length < 10 ? (await getDocs(query(collection(firestore, 'users'), limit(120)))).docs : snaps;
    const totalSnap = await getDocs(query(collection(firestore, 'users'), limit(120)));
    const totalUsers = totalSnap.docs.filter((snap) => snap.id !== uid).length;
    const seen = new Set();
    const users = allDocs
      .filter((snap) => snap.id !== uid)
      .map((snap) => presentUser(snap.id, snap.data()))
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
    const snap = await getDocs(query(collection(firestore, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'), limit(100)));
    return {
      messages: snap.docs.map((docSnap) => ({ _id: docSnap.id, chat: chatId, ...docSnap.data(), createdAt: docSnap.data().createdAt?.toDate?.()?.toISOString?.() || new Date().toISOString() }))
    };
  },

  sendMessage: async ({ chatId, ...payload }) => {
    const uid = currentUid();
    const chatRef = doc(firestore, 'chats', chatId);
    const messageRef = doc(collection(firestore, 'chats', chatId, 'messages'));
    const sender = await readUser(uid);
    const message = {
      chat: chatId,
      sender,
      senderId: uid,
      type: payload.type || 'text',
      body: payload.body || '',
      mediaUrl: payload.mediaUrl || '',
      status: 'sent',
      seenBy: [uid],
      deliveredTo: [uid],
      createdAt: serverTimestamp()
    };

    await runTransaction(firestore, async (transaction) => {
      transaction.set(messageRef, message);
      transaction.update(chatRef, {
        lastMessage: { ...message, _id: messageRef.id, createdAt: new Date().toISOString() },
        updatedAt: serverTimestamp()
      });
    });
    return { message: { ...message, _id: messageRef.id, createdAt: new Date().toISOString() } };
  },

  seen: async (chatId) => {
    const uid = currentUid();
    const snap = await getDocs(query(collection(firestore, 'chats', chatId, 'messages'), limit(100)));
    const batch = writeBatch(firestore);
    snap.docs.forEach((messageDoc) => {
      const data = messageDoc.data();
      if (data.senderId !== uid && !data.seenBy?.includes(uid)) {
        batch.update(messageDoc.ref, { seenBy: arrayUnion(uid), status: 'seen' });
      }
    });
    await batch.commit();
    return { ok: true };
  },

  upload: async (file) => {
    const uid = currentUid();
    const path = `uploads/${uid}/${Date.now()}-${file.name}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    return {
      url: await getDownloadURL(ref),
      publicId: path,
      resourceType: file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image'
    };
  },

  statuses: async () => {
    const snap = await getDocs(query(collection(firestore, 'statuses'), orderBy('createdAt', 'desc'), limit(30)));
    const statuses = await Promise.all(snap.docs.map(async (statusSnap) => {
      const data = statusSnap.data();
      return { _id: statusSnap.id, ...data, user: await readUser(data.userId), createdAt: data.createdAt?.toDate?.()?.toISOString?.() || '' };
    }));
    return { statuses };
  },

  createStatus: async (body) => {
    const uid = currentUid();
    const ref = await addDoc(collection(firestore, 'statuses'), {
      ...body,
      userId: uid,
      createdAt: serverTimestamp(),
      seenBy: []
    });
    return { status: { _id: ref.id, ...body, user: await readUser(uid) } };
  },

  markStatusSeen: async (statusId) => {
    await updateDoc(doc(firestore, 'statuses', statusId), { seenBy: arrayUnion(currentUid()) });
    return { ok: true };
  },

  connectUser: async (userId) => ({ status: 'connected', chatId: (await api.createDirectChat(userId)).chat._id }),
  acceptConnection: async (userId) => ({ status: 'connected', chatId: (await api.createDirectChat(userId)).chat._id }),
  followUser: async (userId) => {
    const uid = currentUid();
    const snap = await getDoc(doc(firestore, 'users', uid));
    const following = snap.data()?.following || [];
    const isFollowing = following.includes(userId);
    await updateDoc(doc(firestore, 'users', uid), { following: isFollowing ? arrayRemove(userId) : arrayUnion(userId) });
    return { isFollowing: !isFollowing };
  }
};
