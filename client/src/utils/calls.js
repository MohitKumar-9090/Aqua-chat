import { get, onValue, push, ref as dbRef, remove, set, update } from 'firebase/database';
import { realtimeDb } from '../firebase.js';
import { getIceServers } from './iceServers.js';

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
        const roomSnap = await get(dbRef(realtimeDb, `calls/${callId}`));
        const room = roomSnap.val();
        if (!room || room.status !== 'ringing' || room.to !== uid) return null;
        return { id: callId, ...room };
      })
    );

    handler(rooms.find(Boolean) || null);
  });
};

export const subscribeCallRoom = (callId, handler) => {
  return onValue(dbRef(realtimeDb, `calls/${callId}`), (snap) => handler(snap.val() || null));
};

export const startOutgoingCall = async ({ callId, from, to, callType, offer }) => {
  await set(dbRef(realtimeDb, `calls/${callId}`), {
    from,
    to,
    callType,
    status: 'ringing',
    offer: offer ? JSON.parse(JSON.stringify(offer)) : null,
    answer: null,
    createdAt: Date.now()
  });
  await set(dbRef(realtimeDb, `userIncoming/${to}/${callId}`), {
    from,
    callType,
    createdAt: Date.now()
  });
};

export const pushIceCandidate = async (callId, uid, candidate) => {
  const candidateRef = push(dbRef(realtimeDb, `calls/${callId}/candidates/${uid}`));
  await set(candidateRef, JSON.parse(JSON.stringify(candidate)));
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

export const sendCallAnswer = async (callId, to, answer) => {
  await update(dbRef(realtimeDb, `calls/${callId}`), {
    answer: JSON.parse(JSON.stringify(answer)),
    status: 'active'
  });
  await remove(dbRef(realtimeDb, `userIncoming/${to}/${callId}`));
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
