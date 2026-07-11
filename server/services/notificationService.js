const INVALID_TOKEN_ERRORS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

const TOKEN_BATCH_SIZE = 500;

const asString = (value) => String(value ?? '');

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

const removeInvalidTokens = async (admin, userRef, tokens) => {
  if (!tokens.length) return;
  await userRef.update({
    fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens)
  });
  console.info(`[Notifications] Removed ${tokens.length} invalid FCM token(s) from ${userRef.id}.`);
};

const sendToUser = async (admin, firestore, uid, { title, body, data, isCall = false }) => {
  const userRef = firestore.collection('users').doc(uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) return;

  const tokens = tokenList(userSnapshot.get('fcmTokens'));
  if (!tokens.length) return;

  const invalidTokens = [];
  for (const batch of chunks(tokens, TOKEN_BATCH_SIZE)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      // Data-only messages let the existing service worker control foreground,
      // background, and Android PWA notification presentation consistently.
      data: Object.fromEntries(Object.entries({
        ...data,
        title,
        body,
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
    });

    response.responses.forEach((result, index) => {
      if (!result.success && INVALID_TOKEN_ERRORS.has(result.error?.code)) {
        invalidTokens.push(batch[index]);
      }
      if (!result.success && !INVALID_TOKEN_ERRORS.has(result.error?.code)) {
        console.warn(`[Notifications] FCM delivery failed for ${uid}:`, result.error?.code || result.error?.message);
      }
    });
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
        messageType: message.type || 'text',
        tag: `message-${chatId}`,
        url: `/?chat=${encodeURIComponent(chatId)}`
      }
    })
  ));
};

const startMessageListener = (admin, firestore) => {
  // Only messages committed after this process starts are notification events.
  // This avoids scanning or re-notifying the complete message history on each
  // Render restart while preserving the existing Firestore schema.
  const startedAt = admin.firestore.Timestamp.now();

  return firestore.collectionGroup('messages').where('createdAt', '>=', startedAt).onSnapshot(
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
          return sendToUser(admin, firestore, uid, {
            title: `${callerName} is calling`,
            body: isVideo ? 'Incoming video call' : 'Incoming voice call',
            isCall: true,
            data: {
              type: 'call',
              callType: isVideo ? 'video' : 'voice',
              callId: callSnapshot.key,
              chatId: asString(call.chatId),
              senderId: callerId,
              senderName: callerName,
              receiverId: uid,
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

let stopService = null;

export const startNotificationService = async (admin) => {
  if (stopService) return stopService;

  const firestore = admin.firestore();
  const stopMessageListener = startMessageListener(admin, firestore);
  let stopCallListener = () => {};

  try {
    stopCallListener = await startIncomingCallListener(admin, firestore);
  } catch (error) {
    console.error('[Notifications] RTDB call listener was not started:', error.message);
  }

  stopService = () => {
    stopMessageListener();
    stopCallListener();
    stopService = null;
  };
  console.info('[Notifications] FCM notification service started.');
  return stopService;
};
