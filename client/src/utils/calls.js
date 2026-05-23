import { get, onValue, push, ref as dbRef, remove, set, update } from 'firebase/database';
import { auth, realtimeDb } from '../firebase.js';
import { getIceServers } from './iceServers.js';

const signalingUid = () => {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in to place or answer a call.');
  return uid;
};

const callParticipants = (from, to) => ({ [from]: true, [to]: true });

const toCallError = (error, fallback) => {
  const code = error?.code || '';
  if (code === 'PERMISSION_DENIED') {
    return new Error(
      'Call signaling was blocked by server permissions. Sign out and back in, then redeploy Firebase Realtime Database rules.'
    );
  }
  return new Error(error?.message || fallback);
};

export const createPeerConnection = async (onRemoteTrack, onIceCandidate) => {
  const iceServers = await getIceServers();
  const pc = new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 10
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

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) onRemoteTrack(stream);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate);
  };

  return pc;
};

export const subscribeIncomingCalls = (uid, handler) => {
  const incomingRef = dbRef(realtimeDb, `userIncoming/${uid}`);
  return onValue(incomingRef, async (snap) => {
    const index = snap.val() || {};
    const callIds = Object.keys(index);
    if (!callIds.length) {
      handler(null);
      return;
    }

    const rooms = await Promise.all(
      callIds.map(async (callId) => {
        try {
          const roomSnap = await get(dbRef(realtimeDb, `calls/${callId}`));
          const room = roomSnap.val();
          if (!room || room.status !== 'ringing' || room.to !== uid) return null;
          return { id: callId, ...room };
        } catch (error) {
          console.error('Incoming call room read failed:', callId, error);
          return null;
        }
      })
    );

    handler(rooms.find(Boolean) || null);
  });
};

export const subscribeCallRoom = (callId, handler) => {
  return onValue(dbRef(realtimeDb, `calls/${callId}`), (snap) => handler(snap.val() || null));
};

/** Create call metadata before ICE/SDP so RTDB rules always see from/to/participants. */
export const createCallRoom = async ({ callId, from, to, callType }) => {
  const callerUid = from || signalingUid();
  await set(dbRef(realtimeDb, `calls/${callId}`), {
    from: callerUid,
    to,
    callType,
    status: 'ringing',
    offer: null,
    answer: null,
    participants: callParticipants(callerUid, to),
    createdAt: Date.now()
  });
};

export const ringCallee = async ({ callId, from, to, callType }) => {
  const callerUid = from || signalingUid();
  await set(dbRef(realtimeDb, `userIncoming/${to}/${callId}`), {
    from: callerUid,
    callType,
    createdAt: Date.now()
  });
};

export const publishCallOffer = async (callId, offer) => {
  try {
    await update(dbRef(realtimeDb, `calls/${callId}`), {
      offer: offer ? JSON.parse(JSON.stringify(offer)) : null
    });
  } catch (error) {
    throw toCallError(error, 'Could not publish call offer.');
  }
};

export const startOutgoingCall = async ({ callId, from, to, callType, offer }) => {
  const callerUid = from || signalingUid();
  try {
    await createCallRoom({ callId, from: callerUid, to, callType });
    if (offer) await publishCallOffer(callId, offer);
    await ringCallee({ callId, from: callerUid, to, callType });
  } catch (error) {
    throw toCallError(error, 'Could not start outgoing call.');
  }
};

export const pushIceCandidate = async (callId, uid, candidate) => {
  const writerUid = uid || signalingUid();
  const candidateRef = push(dbRef(realtimeDb, `calls/${callId}/candidates/${writerUid}`));
  try {
    await set(candidateRef, JSON.parse(JSON.stringify(candidate)));
  } catch (error) {
    throw toCallError(error, 'Could not send connection details for the call.');
  }
};

export const subscribeIceCandidates = (callId, uid, handler) => {
  const seen = new Set();
  return onValue(dbRef(realtimeDb, `calls/${callId}/candidates/${uid}`), (snap) => {
    const value = snap.val() || {};
    Object.values(value).forEach((candidate) => {
      if (!candidate?.candidate) return;
      const key = `${candidate.sdpMid || ''}:${candidate.sdpMLineIndex || 0}:${candidate.candidate}`;
      if (seen.has(key)) return;
      seen.add(key);
      handler(candidate);
    });
  });
};

export const sendCallAnswer = async (callId, calleeUid, answer) => {
  const uid = calleeUid || signalingUid();
  try {
    await update(dbRef(realtimeDb, `calls/${callId}`), {
      answer: JSON.parse(JSON.stringify(answer)),
      status: 'active'
    });
    await remove(dbRef(realtimeDb, `userIncoming/${uid}/${callId}`));
  } catch (error) {
    throw toCallError(error, 'Could not send call answer.');
  }
};

export const endCallRoom = async (callId, from, to) => {
  try {
    await update(dbRef(realtimeDb, `calls/${callId}`), { status: 'ended', endedAt: Date.now() });
  } catch {
    // Room may already be gone.
  }
  await Promise.all([
    remove(dbRef(realtimeDb, `userIncoming/${to}/${callId}`)).catch(() => {}),
    remove(dbRef(realtimeDb, `userIncoming/${from}/${callId}`)).catch(() => {}),
    remove(dbRef(realtimeDb, `calls/${callId}`)).catch(() => {})
  ]);
};
