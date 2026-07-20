import { createHash } from 'node:crypto';

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

const TOKEN_BATCH_SIZE = 500;
const MAX_FCM_SEND_ATTEMPTS = 3;
const FCM_RETRY_DELAY_MS = 250;

const asString = (value) => String(value ?? '');
const MAX_TOKENS_PER_USER = 20;
const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const isUid = (value) => {
  const uid = asString(value).trim();
  return uid.length > 0 && uid.length <= 128 && !/[\s/]/.test(uid);
};

const isFcmToken = (value) =>
  typeof value === 'string' && value.length >= 20 && value.length <= 4096 && !/\s/.test(value);

const eventDocumentId = (eventKey) =>
  createHash('sha256').update(eventKey).digest('base64url');

const logEvent = (event, details = {}) => {
  console.info(`[Notifications] ${event}`, JSON.stringify(details));
};

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
    .filter(isFcmToken)
    .map((token) => token.trim())
)].slice(0, MAX_TOKENS_PER_USER);

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
      // A thrown multicast request has an unknown delivery outcome. Retrying the
      // whole batch could redeliver to tokens FCM already accepted, so only
      // explicit per-token transient failures below are retried.
      console.error(`[Notifications] FCM batch outcome unknown for ${uid}:`, error.message);
      break;
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
  const safeTitle = asString(title).trim().slice(0, 160);
  const safeBody = asString(body).trim().slice(0, 512);
  if (!isUid(uid) || !safeTitle || !safeBody || !data?.type) {
    throw new Error('Rejected an invalid notification payload.');
  }
  const userRef = firestore.collection('users').doc(uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists || userSnapshot.get('deletedAt') || userSnapshot.get('accountStatus') === 'deleted') {
    logEvent('recipient_skipped', { uid, reason: 'missing_or_deleted' });
    return { delivered: 0, reason: 'missing_or_deleted' };
  }

  const tokens = tokenList(userSnapshot.get('fcmTokens'));
  if (!tokens.length) {
    logEvent('recipient_skipped', { uid, reason: 'no_valid_tokens' });
    return { delivered: 0, reason: 'no_valid_tokens' };
  }

  const message = {
    // Data messages are handled by the existing foreground listener and service
    // worker, so the same payload works while the app is open, backgrounded, or
    // launched from a terminated state.
    data: Object.fromEntries(Object.entries({
      ...data,
      title: safeTitle,
      body: safeBody,
      message: safeBody,
      messagePreview: safeBody
    }).filter(([key]) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key))
      .map(([key, value]) => [key, asString(value).slice(0, 1024)])),
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
  logEvent('fcm_send_complete', { uid, tokenCount: tokens.length, invalidTokenCount: invalidTokens.length, type: data.type });
  return { delivered: tokens.length - invalidTokens.length };
};

/**
 * The listener may run on more than one Render instance.  Claiming the event in
 * Firestore before calling FCM makes the event idempotent across instances and
 * process restarts.  The claim is deliberately never re-sent after an unknown
 * process crash: FCM has no exactly-once acknowledgement, so retrying an
 * uncertain delivery would create the duplicate notifications we must avoid.
 */
const claimNotificationEvent = async (admin, firestore, { type, eventId, recipientId }) => {
  const eventKey = `${type}:${eventId}:${recipientId}`;
  const ref = firestore.collection('notificationEvents').doc(eventDocumentId(eventKey));
  const claimed = await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists) return false;
    transaction.create(ref, {
      eventKey,
      type,
      eventId,
      recipientId,
      state: 'claimed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + EVENT_RETENTION_MS))
    });
    return true;
  });
  if (!claimed) logEvent('duplicate_suppressed', { type, eventId, recipientId });
  return claimed ? ref : null;
};

const completeNotificationEvent = async (admin, eventRef, state, details = {}) => {
  await eventRef.set({ state, completedAt: admin.firestore.FieldValue.serverTimestamp(), ...details }, { merge: true });
};

const purgeExpiredNotificationEvents = async (firestore) => {
  const expired = await firestore.collection('notificationEvents')
    .where('expiresAt', '<=', new Date())
    .limit(400)
    .get();
  if (expired.empty) return;
  const batch = firestore.batch();
  expired.docs.forEach((snapshot) => batch.delete(snapshot.ref));
  await batch.commit();
  logEvent('event_ledger_pruned', { count: expired.size });
};

const sendMessageNotification = async (admin, firestore, messageSnapshot) => {
  const message = messageSnapshot.data();
  if (message.deletedForEveryone || !isUid(message.senderId)) return;

  const chatRef = messageSnapshot.ref.parent.parent;
  if (!chatRef) return;
  const chatSnapshot = await chatRef.get();
  if (!chatSnapshot.exists) return;

  const chat = chatSnapshot.data();
  const senderId = asString(message.senderId).trim();
  if (!Array.isArray(chat.participantIds) || !chat.participantIds.map(asString).map((id) => id.trim()).includes(senderId)) {
    logEvent('message_skipped', { messageId: messageSnapshot.id, reason: 'sender_not_a_participant' });
    return;
  }
  const senderSnapshot = await firestore.collection('users').doc(senderId).get();
  if (!senderSnapshot.exists || senderSnapshot.get('deletedAt') || senderSnapshot.get('accountStatus') === 'deleted') {
    logEvent('message_skipped', { messageId: messageSnapshot.id, reason: 'missing_or_deleted_sender' });
    return;
  }
  const recipients = [...new Set((chat.participantIds || [])
    .map((participantId) => asString(participantId).trim())
    .filter((participantId) => participantId && participantId !== senderId))];
  if (!recipients.length) return;

  // Sender-controlled message fields are never used for notification identity.
  const senderName = asString(senderSnapshot.get('displayName') || senderSnapshot.get('name') || 'AquaChat user').trim();
  const isGroup = chat.type === 'group';
  const title = isGroup
    ? `${senderName} in ${asString(chat.name || 'Group chat').trim()}`
    : senderName;
  const chatId = chatRef.id;
  const body = notificationPreview(message);

  await Promise.all(recipients.map(async (recipientId) => {
    if (!isUid(recipientId)) return;
    const eventRef = await claimNotificationEvent(admin, firestore, {
      type: 'message', eventId: messageSnapshot.ref.path, recipientId
    });
    if (!eventRef) return;
    try {
      const result = await sendToUser(admin, firestore, recipientId, {
      title,
      body,
      data: {
        type: 'message',
        channel: isGroup ? 'group_chats' : 'messages',
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
      });
      await completeNotificationEvent(admin, eventRef, 'completed', result);
    } catch (error) {
      await completeNotificationEvent(admin, eventRef, 'failed', { error: error.message }).catch(() => {});
      throw error;
    }
  }));
};

const getMessageListenerWatermark = async (firestore) => {
  const stateRef = firestore.collection('notificationServiceState').doc('messageListener');
  const [stateSnapshot, readSnapshot] = await Promise.all([
    stateRef.get(),
    firestore.collection('chats').limit(1).get()
  ]);
  const currentWatermark = readSnapshot.readTime;
  const previousWatermark = stateSnapshot.get('lastStartedAt');

  // First deployment deliberately starts "now" so historical messages are not
  // announced. Subsequent starts replay only the downtime window. Durable event
  // claims suppress anything the previous process already delivered.
  await stateRef.set({ lastStartedAt: currentWatermark }, { merge: true });
  return previousWatermark || currentWatermark;
};

const startMessageListener = async (admin, firestore) => {
  // Use Firestore-issued timestamps, never Render's local clock. The persisted
  // checkpoint recovers notifications created during a Render restart.
  const watermark = await getMessageListenerWatermark(firestore);

  // Unlike an RTDB child listener, Firestore requires a query. The watermark
  // excludes history without relying on Render's clock; every document created
  // after it, including initial query results, is a message event to deliver.
  // Durable notificationEvents claims, rather than an unbounded in-memory map,
  // provide deduplication across reconnects and Render instances.
  return firestore.collectionGroup('messages').where('createdAt', '>=', watermark).onSnapshot(
    (snapshot) => {
      const additions = snapshot.docChanges().filter((change) => change.type === 'added');
      additions.forEach((change) => {
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

  const attachUser = (uid) => {
    if (attachedUsers.has(uid)) return;
    const userRef = incomingRoot.child(uid);
    const handler = async (callSnapshot) => {
      const entryKey = `${uid}/${callSnapshot.key}`;
      if (knownEntries.has(entryKey)) return;
      knownEntries.add(entryKey);

      const call = callSnapshot.val() || {};
      const callerId = asString(call.from).trim();
      if (!isUid(callerId) || !isUid(uid)) return;

      try {
        // userIncoming is only an index. Validate it against the canonical call
        // room before trusting it as a notification trigger.
        const roomSnapshot = await admin.database().ref(`calls/${callSnapshot.key}`).once('value');
        const room = roomSnapshot.val();
        const participants = room?.participants || {};
        const intendedForUser = room && (
          asString(room.to).trim() === uid ||
          (Array.isArray(room.to) && room.to.map(asString).map((id) => id.trim()).includes(uid)) ||
          Object.prototype.hasOwnProperty.call(participants, uid)
        );
        if (!room || room.status !== 'ringing' || asString(room.from).trim() !== callerId || !intendedForUser) {
          logEvent('call_skipped', { callId: callSnapshot.key, uid, reason: 'invalid_or_inactive_room' });
          return;
        }

        const eventRef = await claimNotificationEvent(admin, firestore, {
          type: 'call', eventId: callSnapshot.key, recipientId: uid
        });
        if (!eventRef) return;

        const callerSnapshot = await firestore.collection('users').doc(callerId).get();
        const caller = callerSnapshot.exists ? callerSnapshot.data() : {};
        if (!callerSnapshot.exists || caller.deletedAt || caller.accountStatus === 'deleted') {
          await completeNotificationEvent(admin, eventRef, 'skipped', { reason: 'missing_or_deleted_caller' });
          return;
        }
        const callerName = asString(caller.displayName || caller.name || 'AquaChat user').trim();
        const isVideo = room.callType === 'video';
        const chatId = asString(room.chatId).trim();
        const timestamp = room.createdAt || call.createdAt || Date.now();
        const result = await sendToUser(admin, firestore, uid, {
            title: `${callerName} is calling`,
            body: isVideo ? 'Incoming video call' : 'Incoming voice call',
            isCall: true,
            data: {
              type: 'call',
              channel: 'calls',
              notificationType: 'incoming_call',
              callType: isVideo ? 'video' : 'voice',
              callId: callSnapshot.key,
              chatId,
              callerId,
              callerName,
              senderId: callerId,
              senderName: callerName,
              receiverId: uid,
              isVideo,
              timestamp,
              tag: `call-${callSnapshot.key}`,
              url: chatId
                ? `/?chat=${encodeURIComponent(chatId)}&callId=${encodeURIComponent(callSnapshot.key)}`
                : `/?callId=${encodeURIComponent(callSnapshot.key)}`
            }
          });
        await completeNotificationEvent(admin, eventRef, 'completed', result);
      } catch (error) {
        console.error(`[Notifications] Call notification failed for ${callSnapshot.key}:`, error.message);
      }
    };
    const removalHandler = (callSnapshot) => {
      knownEntries.delete(`${uid}/${callSnapshot.key}`);
    };
    userRef.on('child_added', handler);
    userRef.on('child_removed', removalHandler);
    attachedUsers.set(uid, { userRef, handler, removalHandler });
  };

  const rootHandler = (userSnapshot) => attachUser(userSnapshot.key);
  const rootRemovalHandler = (userSnapshot) => {
    const uid = userSnapshot.key;
    const attached = attachedUsers.get(uid);
    if (!attached) return;
    attached.userRef.off('child_added', attached.handler);
    attached.userRef.off('child_removed', attached.removalHandler);
    attachedUsers.delete(uid);
  };
  incomingRoot.on('child_added', rootHandler);
  incomingRoot.on('child_removed', rootRemovalHandler);
  // Existing ringing entries are intentionally checked at startup. The durable
  // claim suppresses entries already sent before a restart, while an active call
  // created during Render downtime still receives its first notification.
  console.info('[Notifications] Incoming-call listener ready.');

  return () => {
    incomingRoot.off('child_added', rootHandler);
    incomingRoot.off('child_removed', rootRemovalHandler);
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
let serviceStartPromise = null;

export const startNotificationService = async (admin) => {
  if (stopService) return stopService;
  if (serviceStartPromise) return serviceStartPromise;

  serviceStartPromise = (async () => {

  const firestore = admin.firestore();
  const messageListenerPromise = startMessageListener(admin, firestore);
  let stopMessageListener = () => {};
  let stopCallListener = () => {};
  let stopCallCleanupListener = () => {};
  const purgeTimer = setInterval(() => {
    purgeExpiredNotificationEvents(firestore)
      .catch((error) => console.error('[Notifications] Event ledger cleanup failed:', error.message));
  }, 6 * 60 * 60 * 1000);
  purgeTimer.unref?.();
  purgeExpiredNotificationEvents(firestore)
    .catch((error) => console.error('[Notifications] Initial event ledger cleanup failed:', error.message));

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
    clearInterval(purgeTimer);
    stopService = null;
  };
  console.info('[Notifications] FCM notification service started.');
  return stopService;
  })();

  try {
    return await serviceStartPromise;
  } finally {
    serviceStartPromise = null;
  }
};
