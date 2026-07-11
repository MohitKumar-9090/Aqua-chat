const INVALID_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

const TOKEN_BATCH_SIZE = 500;
const MAX_FCM_SEND_ATTEMPTS = 3;
const FCM_RETRY_DELAY_MS = 250;

const asString = (value) => String(value ?? '');

const RETRYABLE_FCM_ERRORS = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
  'messaging/device-message-rate-exceeded',
  'messaging/topics-message-rate-exceeded'
]);

const notificationPreview = (message) => {
  const body = asString(message.body).trim();
  if (body) return body.slice(0, 180);

  switch (message.type) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'audio': return '🎵 Voice message';
    case 'file': return `📎 ${asString(message.fileName).trim() || 'File'}`;
    default: return 'New message';
  }
};

const tokenList = (value) => [...new Set(
  (Array.isArray(value) ? value : [value])
    .filter((token) => typeof token === 'string' && token.trim())
    .map((token) => token.trim())
)];

const chunks = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const removeInvalidTokens = async (admin, userRef, tokens) => {
  if (!tokens.length) return;
  await userRef.update({
    fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens)
  });
  console.info(`[Notifications] Removed ${tokens.length} invalid FCM token(s) from ${userRef.id}.`);
};

/**
 * Retries only the tokens that FCM explicitly reports as transient failures.
 * Successful tokens are never resent, which prevents retry-induced duplicates.
 */
const sendBatchWithRetry = async (admin, uid, tokens, message) => {
  const invalidTokens = [];
  let pendingTokens = tokens;

  for (let attempt = 1; pendingTokens.length && attempt <= MAX_FCM_SEND_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await admin.messaging().sendEachForMulticast({
        tokens: pendingTokens,
        ...message
      });
    } catch (error) {
      if (attempt === MAX_FCM_SEND_ATTEMPTS) {
        console.error(`[Notifications] FCM batch send failed for ${uid} after ${attempt} attempt(s):`, error.message);
        break;
      }
      console.warn(`[Notifications] FCM batch send failed for ${uid}; retrying (${attempt}/${MAX_FCM_SEND_ATTEMPTS}):`, error.message);
      await wait(FCM_RETRY_DELAY_MS * attempt);
      continue;
    }

    const retryTokens = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;

      const token = pendingTokens[index];
      const errorCode = result.error?.code;
      if (INVALID_TOKEN_ERRORS.has(errorCode)) {
        invalidTokens.push(token);
      } else if (RETRYABLE_FCM_ERRORS.has(errorCode) && attempt < MAX_FCM_SEND_ATTEMPTS) {
        retryTokens.push(token);
      } else {
        console.warn(`[Notifications] FCM delivery failed for ${uid}:`, errorCode || result.error?.message);
      }
    });

    pendingTokens = retryTokens;
    if (pendingTokens.length) await wait(FCM_RETRY_DELAY_MS * attempt);
  }

  return invalidTokens;
};

const sendToUser = async (admin, firestore, uid, { title, body, data, isCall = false }) => {
  const userRef = firestore.collection('users').doc(uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) return;

  const tokens = tokenList(userSnapshot.get('fcmTokens'));
  if (!tokens.length) return;

  const message = {
    // Data messages are handled by the existing foreground listener and service
    // worker, so the same payload works while the app is open, backgrounded, or
    // launched from a terminated state.
    data: Object.fromEntries(Object.entries({
      ...data,
      title,
      body,
      message: body,
      messagePreview: body
    }).map(([key, value]) => [key, asString(value)])),
    android: {
      priority: 'high'
    },
    webpush: {
      headers: {
        Urgency: isCall ? 'high' : 'normal',
        TTL: isCall ? '60' : '86400'
      }
    }
  };

  const invalidTokens = [];
  for (const batch of chunks(tokens, TOKEN_BATCH_SIZE)) {
    invalidTokens.push(...await sendBatchWithRetry(admin, uid, batch, message));
  }

  try {
    await removeInvalidTokens(admin, userRef, invalidTokens);
  } catch (error) {
    console.error(`[Notifications] Could not clean invalid FCM tokens for ${uid}:`, error.message);
  }
};

const sendMessageNotification = async (admin, firestore, messageSnapshot) => {
  const message = messageSnapshot.data();
  if (message.deletedForEveryone || !message.senderId) return;

  const chatRef = messageSnapshot.ref.parent.parent;
  if (!chatRef) return;
  const chatSnapshot = await chatRef.get();
  if (!chatSnapshot.exists) return;

  const chat = chatSnapshot.data();
  const senderId = asString(message.senderId).trim();
  const recipients = [...new Set((chat.participantIds || [])
    .map((participantId) => asString(participantId).trim())
    .filter((participantId) => participantId && participantId !== senderId))];
  if (!recipients.length) return;

  const senderName = asString(message.senderName || message.sender?.displayName || 'AquaChat user').trim();
  const isGroup = chat.type === 'group';
  const title = isGroup
    ? `${senderName} in ${asString(chat.name || 'Group chat').trim()}`
    : senderName;
  const chatId = chatRef.id;
  const body = notificationPreview(message);

  await Promise.all(recipients.map((recipientId) =>
    sendToUser(admin, firestore, recipientId, {
      title,
      body,
      data: {
        type: 'message',
        chatId,
        messageId: messageSnapshot.id,
        senderId,
        senderName,
        receiverId: recipientId,
        message: body,
        messageType: message.type || 'text',
        tag: `message-${chatId}`,
        url: `/?chat=${encodeURIComponent(chatId)}`
      }
    })
  ));
};

const startMessageListener = async (admin, firestore) => {
  // Use a Firestore-issued read time as the listener watermark. The previous
  // implementation used Render's local clock, which can differ from Firestore
  // time and exclude legitimate message documents from the query.
  const watermarkSnapshot = await firestore.collection('chats').limit(1).get();
  const watermark = watermarkSnapshot.readTime;
  const deliveredMessagePaths = new Map();
  let processedSincePrune = 0;

  const wasDelivered = (messagePath) => {
    const now = Date.now();
    processedSincePrune += 1;
    if (processedSincePrune >= 100) {
      processedSincePrune = 0;
      const expiresAt = now - 24 * 60 * 60 * 1000;
      deliveredMessagePaths.forEach((sentAt, path) => {
        if (sentAt < expiresAt) deliveredMessagePaths.delete(path);
      });
    }
    if (deliveredMessagePaths.has(messagePath)) return true;
    deliveredMessagePaths.set(messagePath, now);
    return false;
  };

  // Unlike an RTDB child listener, Firestore requires a query. The watermark
  // excludes history without relying on Render's clock; every document created
  // after it, including initial query results, is a message event to deliver.
  return firestore.collectionGroup('messages').where('createdAt', '>=', watermark).onSnapshot(
    (snapshot) => {
      const additions = snapshot.docChanges().filter((change) => change.type === 'added');
      additions.forEach((change) => {
        if (wasDelivered(change.doc.ref.path)) return;
        sendMessageNotification(admin, firestore, change.doc).catch((error) => {
          console.error(`[Notifications] Message notification failed for ${change.doc.id}:`, error.message);
        });
      });
    },
    (error) => console.error('[Notifications] Firestore message listener failed:', error.message)
  );
};

const startIncomingCallListener = async (admin, firestore) => {
  const incomingRoot = admin.database().ref('userIncoming');
  const knownEntries = new Set();
  const attachedUsers = new Map();

  // Seed the dedupe set before listening so a deployment/restart never rings
  // users again for calls that were already waiting in RTDB.
  const existing = await incomingRoot.once('value');
  existing.forEach((userSnapshot) => {
    userSnapshot.forEach((callSnapshot) => {
      knownEntries.add(`${userSnapshot.key}/${callSnapshot.key}`);
    });
  });

  const attachUser = (uid) => {
    if (attachedUsers.has(uid)) return;
    const userRef = incomingRoot.child(uid);
    const handler = (callSnapshot) => {
      const entryKey = `${uid}/${callSnapshot.key}`;
      if (knownEntries.has(entryKey)) return;
      knownEntries.add(entryKey);

      const call = callSnapshot.val() || {};
      const callerId = asString(call.from).trim();
      if (!callerId) return;

      firestore.collection('users').doc(callerId).get()
        .then((callerSnapshot) => {
          const caller = callerSnapshot.exists ? callerSnapshot.data() : {};
          const callerName = asString(caller.displayName || caller.name || 'AquaChat user').trim();
          const isVideo = call.callType === 'video';
          const timestamp = call.createdAt || Date.now();
          return sendToUser(admin, firestore, uid, {
            title: `${callerName} is calling`,
            body: isVideo ? 'Incoming video call' : 'Incoming voice call',
            isCall: true,
            data: {
              type: 'call',
              notificationType: 'incoming_call',
              callType: isVideo ? 'video' : 'voice',
              callId: callSnapshot.key,
              chatId: asString(call.chatId),
              callerId,
              callerName,
              senderId: callerId,
              senderName: callerName,
              receiverId: uid,
              isVideo,
              timestamp,
              tag: `call-${callSnapshot.key}`,
              url: call.chatId
                ? `/?chat=${encodeURIComponent(call.chatId)}&callId=${encodeURIComponent(callSnapshot.key)}`
                : `/?callId=${encodeURIComponent(callSnapshot.key)}`
            }
          });
        })
        .catch((error) => console.error(`[Notifications] Call notification failed for ${callSnapshot.key}:`, error.message));
    };
    const removalHandler = (callSnapshot) => {
      knownEntries.delete(`${uid}/${callSnapshot.key}`);
    };
    userRef.on('child_added', handler);
    userRef.on('child_removed', removalHandler);
    attachedUsers.set(uid, { userRef, handler, removalHandler });
  };

  const rootHandler = (userSnapshot) => attachUser(userSnapshot.key);
  incomingRoot.on('child_added', rootHandler);
  console.info(`[Notifications] Incoming-call listener ready; ignored ${knownEntries.size} existing call(s).`);

  return () => {
    incomingRoot.off('child_added', rootHandler);
    attachedUsers.forEach(({ userRef, handler, removalHandler }) => {
      userRef.off('child_added', handler);
      userRef.off('child_removed', removalHandler);
    });
  };
};

/**
 * Clients can only remove incoming indexes they are authorized to write. In a
 * group call, that can leave an index behind for another recipient after a
 * participant ends the room. The backend cleans those indexes whenever a room
 * ends or is deleted, keeping a stale room from being treated as a new call.
 */
const startCallCleanupListener = async (admin) => {
  const database = admin.database();
  const callsRoot = database.ref('calls');

  const clearIncomingIndexes = async (callSnapshot) => {
    const call = callSnapshot.val() || {};
    const recipients = new Set([
      asString(call.from).trim(),
      ...(Array.isArray(call.to) ? call.to : [call.to]),
      ...Object.keys(call.participants || {})
    ].map((uid) => asString(uid).trim()).filter(Boolean));

    if (!recipients.size) return;

    const updates = {};
    recipients.forEach((uid) => {
      updates[`userIncoming/${uid}/${callSnapshot.key}`] = null;
    });
    await database.ref().update(updates);
  };

  const changedHandler = (callSnapshot) => {
    if (callSnapshot.child('status').val() !== 'ended') return;

    clearIncomingIndexes(callSnapshot)
      .then(() => callSnapshot.ref.remove())
      .catch((error) => console.error(`[Notifications] Could not clean ended call ${callSnapshot.key}:`, error.message));
  };
  const removedHandler = (callSnapshot) => {
    clearIncomingIndexes(callSnapshot)
      .catch((error) => console.error(`[Notifications] Could not clean incoming indexes for ${callSnapshot.key}:`, error.message));
  };

  callsRoot.on('child_changed', changedHandler);
  callsRoot.on('child_removed', removedHandler);

  // Clean up sessions that were marked ended before this process restarted.
  const existingCalls = await callsRoot.once('value');
  const staleCleanups = [];
  existingCalls.forEach((callSnapshot) => {
    if (callSnapshot.child('status').val() !== 'ended') return;
    staleCleanups.push(
      clearIncomingIndexes(callSnapshot)
        .then(() => callSnapshot.ref.remove())
    );
  });
  const cleanupResults = await Promise.allSettled(staleCleanups);
  cleanupResults.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('[Notifications] Could not clean a stale ended call:', result.reason?.message || result.reason);
    }
  });

  return () => {
    callsRoot.off('child_changed', changedHandler);
    callsRoot.off('child_removed', removedHandler);
  };
};

let stopService = null;

export const startNotificationService = async (admin) => {
  if (stopService) return stopService;

  const firestore = admin.firestore();
  const messageListenerPromise = startMessageListener(admin, firestore);
  let stopMessageListener = () => {};
  let stopCallListener = () => {};
  let stopCallCleanupListener = () => {};

  try {
    stopCallListener = await startIncomingCallListener(admin, firestore);
  } catch (error) {
    console.error('[Notifications] RTDB call listener was not started:', error.message);
  }

  try {
    stopCallCleanupListener = await startCallCleanupListener(admin);
  } catch (error) {
    console.error('[Notifications] RTDB call cleanup listener was not started:', error.message);
  }

  try {
    stopMessageListener = await messageListenerPromise;
    console.info('[Notifications] Message listener ready.');
  } catch (error) {
    console.error('[Notifications] Firestore message listener was not started:', error.message);
  }

  stopService = () => {
    stopMessageListener();
    stopCallListener();
    stopCallCleanupListener();
    stopService = null;
  };
  console.info('[Notifications] FCM notification service started.');
  return stopService;
};
