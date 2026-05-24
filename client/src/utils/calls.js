import { get, onValue, push, ref as dbRef, remove, set, update } from 'firebase/database';
import { auth, realtimeDb } from '../firebase.js';
import { getIceServers } from './iceServers.js';

const RTDB_DEBUG = import.meta.env.DEV;

const logRtdb = (operation, path, detail = {}) => {
  if (!RTDB_DEBUG) return;
  console.info(`[RTDB] ${operation}`, path, {
    uid: auth?.currentUser?.uid ?? null,
    ...detail
  });
};

const logRtdbError = (operation, path, error) => {
  console.error(`[RTDB] ${operation} FAILED`, path, {
    code: error?.code,
    message: error?.message,
    uid: auth?.currentUser?.uid ?? null
  });
};

/** Wait until Firebase Auth has restored the session (critical on mobile accept). */
export const waitForAuthReady = (maxMs = 8000) =>
  new Promise((resolve, reject) => {
    if (!auth) {
      reject(new Error('Firebase Auth is not initialized.'));
      return;
    }
    if (auth.currentUser?.uid) {
      resolve(auth.currentUser.uid);
      return;
    }

    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Auth session not ready. Wait a moment and try again.'));
    }, maxMs);

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user?.uid) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(user.uid);
    });
  });

const signalingUid = async () => {
  const uid = auth?.currentUser?.uid || (await waitForAuthReady());
  if (!uid) throw new Error('You must be signed in to place or answer a call.');
  return uid;
};

const buildParticipants = (ids = []) =>
  ids.reduce((acc, uid) => ({
    ...acc,
    [uid]: true
  }), {});

const callParticipants = (from, to) => {
  if (Array.isArray(to)) {
    return buildParticipants([from, ...to]);
  }
  return { [from]: true, [to]: true };
};

const isParticipant = (room, uid) =>
  Boolean(room && (room.from === uid || room.to === uid || room.participants?.[uid]));

const toCallError = (error, fallback, path = '') => {
  const code = error?.code || '';
  if (code === 'PERMISSION_DENIED') {
    const hint = path ? ` Path: ${path}.` : '';
    return new Error(
      `Call signaling was blocked by Firebase permissions.${hint} Deploy database.rules.json (firebase deploy --only database).`
    );
  }
  return new Error(error?.message || fallback);
};

const rtdbSet = async (path, value, operation = 'set') => {
  logRtdb(operation, path);
  try {
    await set(dbRef(realtimeDb, path), value);
  } catch (error) {
    logRtdbError(operation, path, error);
    throw toCallError(error, `Could not write call data.`, path);
  }
};

const rtdbUpdate = async (path, value, operation = 'update') => {
  logRtdb(operation, path);
  try {
    await update(dbRef(realtimeDb, path), value);
  } catch (error) {
    logRtdbError(operation, path, error);
    throw toCallError(error, `Could not update call data.`, path);
  }
};

const rtdbRemove = async (path, operation = 'remove') => {
  logRtdb(operation, path);
  try {
    await remove(dbRef(realtimeDb, path));
  } catch (error) {
    logRtdbError(operation, path, error);
    throw error;
  }
};

/** Ensure callee/caller is allowed on this call before accept/ICE writes. */
export const verifyCallAccess = async (callId, uid) => {
  const path = `calls/${callId}`;
  logRtdb('get', path, { verifyUid: uid });
  const snap = await get(dbRef(realtimeDb, path));
  const room = snap.val();
  if (!room) throw new Error('Call session not found or already ended.');
  if (!isParticipant(room, uid)) {
    throw new Error('You are not a participant in this call.');
  }
  return room;
};

export const createPeerConnection = async (onRemoteTrack, onIceCandidate) => {
  const iceServers = await getIceServers();
  const hasTurn = iceServers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:'));
  });
  const pc = new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
  });

  const pendingRemoteCandidates = [];

  pc.addRemoteIceCandidate = async (candidate) => {
    if (!candidate?.candidate) return;
    if (!pc.remoteDescription) {
      pendingRemoteCandidates.push(candidate);
      return;
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  };

  pc.flushRemoteIceCandidates = async () => {
    while (pendingRemoteCandidates.length) {
      const candidate = pendingRemoteCandidates.shift();
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
  };

  const remoteStream = new MediaStream();
  let emitScheduled = false;

  const emitRemote = () => {
    if (remoteStream.getTracks().length) {
      onRemoteTrack(remoteStream);
    }
  };

  const scheduleEmit = () => {
    if (emitScheduled) return;
    emitScheduled = true;
    Promise.resolve().then(() => {
      emitScheduled = false;
      emitRemote();
    });
  };

  pc.ontrack = (event) => {
    console.log('[WebRTC] ontrack fired — kind:', event.track?.kind, 'readyState:', event.track?.readyState, 'muted:', event.track?.muted);
    
    const incomingStream = event.streams[0] || remoteStream;
    
    if (event.track && !incomingStream.getTracks().some((existing) => existing.id === event.track.id)) {
      incomingStream.addTrack(event.track);
      console.log('[WebRTC] Added remote track:', event.track.kind, 'id:', event.track.id, '— total tracks:', incomingStream.getTracks().length);
    }

    const emitRemoteLocal = () => {
      if (incomingStream.getTracks().length) {
        onRemoteTrack(incomingStream);
      }
    };

    let emitScheduledLocal = false;
    const scheduleEmitLocal = () => {
      if (emitScheduledLocal) return;
      emitScheduledLocal = true;
      Promise.resolve().then(() => {
        emitScheduledLocal = false;
        emitRemoteLocal();
      });
    };

    if (event.track) {
      event.track.onunmute = () => {
        console.log('[WebRTC] Remote track unmuted:', event.track.kind);
        scheduleEmitLocal();
      };
      event.track.onended = () => {
        console.log('[WebRTC] Remote track ended:', event.track.kind);
        scheduleEmitLocal();
      };
    }
    
    scheduleEmitLocal();
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate);
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      // Connection established
    }
  };

  return pc;
};

export const subscribeIncomingCalls = (uid, handler) => {
  const incomingRef = dbRef(realtimeDb, `userIncoming/${uid}`);
  let roomUnsubscribe = null;
  let watchedCallId = null;

  const clearRoomWatch = () => {
    roomUnsubscribe?.();
    roomUnsubscribe = null;
    watchedCallId = null;
  };

  const watchCallRoom = (callId, ringEntry = {}) => {
    if (watchedCallId === callId && roomUnsubscribe) return;
    clearRoomWatch();
    watchedCallId = callId;
    logRtdb('listen', `calls/${callId}`, { incomingFor: uid });

    roomUnsubscribe = onValue(
      dbRef(realtimeDb, `calls/${callId}`),
      (roomSnap) => {
        const room = roomSnap.val();
        if (!room || !isParticipant(room, uid)) {
          handler(null);
          return;
        }
        if (room.status === 'ended') {
          handler(null);
          return;
        }
        if (room.status !== 'ringing' && room.status !== 'active') {
          return;
        }
        logRtdb('incoming:ring', `calls/${callId}`, {
          hasOffer: Boolean(room.offer || room.offers?.[uid] || ringEntry.offer),
          status: room.status
        });
        handler({
          id: callId,
          from: room.from || ringEntry.from,
          to: uid,
          callType: room.callType || ringEntry.callType || 'voice',
          status: room.status,
          offer: room.offer || room.offers?.[uid] || ringEntry.offer || null,
          answer: room.answer || room.answers?.[uid] || null
        });
      },
      (error) => logRtdbError('onValue', `calls/${callId}`, error)
    );
  };

  const incomingUnsubscribe = onValue(
    incomingRef,
    (snap) => {
      const index = snap.val() || {};
      const callIds = Object.keys(index);
      logRtdb('incoming:index', `userIncoming/${uid}`, { callIds });
      if (!callIds.length) {
        clearRoomWatch();
        handler(null);
        return;
      }
      const callId = callIds[callIds.length - 1];
      const entry = index[callId] || {};
      handler({
        id: callId,
        from: entry.from,
        to: uid,
        callType: entry.callType || 'voice',
        status: 'ringing',
        offer: null
      });
      watchCallRoom(callId, entry);
    },
    (error) => logRtdbError('onValue', `userIncoming/${uid}`, error)
  );

  return () => {
    incomingUnsubscribe();
    clearRoomWatch();
  };
};

export const subscribeCallRoom = (callId, handler) => {
  return onValue(
    dbRef(realtimeDb, `calls/${callId}`),
    (snap) => handler(snap.val() || null),
    (error) => logRtdbError('onValue', `calls/${callId}`, error)
  );
};

export const createCallRoom = async ({ callId, from, to, callType, participantIds = null }) => {
  const callerUid = from || (await signalingUid());
  const path = `calls/${callId}`;
  const participants = participantIds ? callParticipants(callerUid, participantIds) : callParticipants(callerUid, to);
  await rtdbSet(path, {
    from: callerUid,
    to,
    callType,
    status: 'ringing',
    offer: null,
    answer: null,
    offers: null,
    answers: null,
    participants,
    createdAt: Date.now()
  }, 'createCallRoom');
};

export const ringCallee = async ({ callId, from, to, callType, offer = null }) => {
  const callerUid = from || (await signalingUid());
  const entries = Array.isArray(to) ? to : [to];
  await Promise.all(entries.map(async (recipient) => {
    const path = `userIncoming/${recipient}/${callId}`;
    await rtdbSet(path, {
      from: callerUid,
      callType,
      offer: offer ? JSON.parse(JSON.stringify(offer)) : null,
      createdAt: Date.now()
    }, 'ringCallee');
  }));
};

export const publishCallOffer = async (callId, offer, targetUid = null) => {
  const path = targetUid ? `calls/${callId}/offers/${targetUid}` : `calls/${callId}/offer`;
  await rtdbSet(path, offer ? JSON.parse(JSON.stringify(offer)) : null, 'publishCallOffer');
};

export const startOutgoingCall = async ({ callId, from, to, callType, offer }) => {
  const callerUid = from || (await signalingUid());
  await createCallRoom({ callId, from: callerUid, to, callType });
  if (offer) await publishCallOffer(callId, offer);
  await ringCallee({ callId, from: callerUid, to, callType });
};

export const pushIceCandidate = async (callId, uid, candidate) => {
  const writerUid = uid || (await signalingUid());
  await verifyCallAccess(callId, writerUid).catch((error) => {
    if (RTDB_DEBUG) console.warn('[RTDB] pushIceCandidate skipped verify:', error.message);
  });
  const path = `calls/${callId}/candidates/${writerUid}`;
  const candidateRef = push(dbRef(realtimeDb, path));
  try {
    logRtdb('set', `${path}/${candidateRef.key}`);
    await set(candidateRef, JSON.parse(JSON.stringify(candidate)));
  } catch (error) {
    logRtdbError('pushIceCandidate', path, error);
    throw toCallError(error, 'Could not send connection details for the call.', path);
  }
};

export const subscribeIceCandidates = (callId, uid, handler) => {
  const seen = new Set();
  const path = `calls/${callId}/candidates/${uid}`;
  return onValue(
    dbRef(realtimeDb, path),
    (snap) => {
      const value = snap.val() || {};
      Object.values(value).forEach((candidate) => {
        if (!candidate?.candidate) return;
        const key = `${candidate.sdpMid || ''}:${candidate.sdpMLineIndex || 0}:${candidate.candidate}`;
        if (seen.has(key)) return;
        seen.add(key);
        handler(candidate);
      });
    },
    (error) => logRtdbError('onValue', path, error)
  );
};

/**
 * Callee accept: update answer on calls/{callId}, then clear userIncoming/{calleeUid}/{callId}.
 * Operations are split so a failing remove does not mask a successful answer.
 */
export const sendCallAnswer = async (callId, calleeUid, answer, targetUid = null) => {
  const uid = calleeUid || (await signalingUid());
  await waitForAuthReady();
  await verifyCallAccess(callId, uid);

  const incomingPath = `userIncoming/${uid}/${callId}`;
  const answerPath = targetUid ? `calls/${callId}/answers/${targetUid}` : `calls/${callId}/answer`;

  await rtdbSet(answerPath, JSON.parse(JSON.stringify(answer)), 'sendCallAnswer:answer');
  await rtdbSet(`calls/${callId}/status`, 'active', 'sendCallAnswer:status');

  try {
    await rtdbRemove(incomingPath, 'sendCallAnswer:removeIncoming');
  } catch (error) {
    logRtdbError('sendCallAnswer:removeIncoming', incomingPath, error);
    if (error?.code === 'PERMISSION_DENIED') {
      console.warn(
        '[RTDB] Answer was saved but clearing the ring index failed. Add userIncoming rules and redeploy database rules.'
      );
    }
  }
};

export const endCallRoom = async (callId, from, to) => {
  try {
    await rtdbSet(`calls/${callId}/status`, 'ended', 'endCallRoom:status');
    await rtdbSet(`calls/${callId}/endedAt`, Date.now(), 'endCallRoom:endedAt');
  } catch {
    // Room may already be gone.
  }
  const removals = [
    remove(dbRef(realtimeDb, `calls/${callId}`)).catch((e) => logRtdbError('remove', `calls/${callId}`, e))
  ];
  if (to) {
    removals.push(remove(dbRef(realtimeDb, `userIncoming/${to}/${callId}`)).catch((e) => logRtdbError('remove', `userIncoming/${to}/${callId}`, e)));
  }
  if (from) {
    removals.push(remove(dbRef(realtimeDb, `userIncoming/${from}/${callId}`)).catch((e) => logRtdbError('remove', `userIncoming/${from}/${callId}`, e)));
  }
  await Promise.all(removals);
};

export const updateParticipantCallState = async (callId, targetUid, state) => {
  const path = `calls/${callId}/participantsState/${targetUid}`;
  await rtdbUpdate(path, state, 'updateParticipantCallState');
};

