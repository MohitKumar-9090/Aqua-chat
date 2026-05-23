import { onValue, push, ref as dbRef, remove, set, update } from 'firebase/database';
import { realtimeDb } from '../firebase.js';

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export const createPeerConnection = (onRemoteTrack, onIceCandidate) => {
  const pc = new RTCPeerConnection({ iceServers });
  pc.ontrack = (event) => onRemoteTrack(event.streams[0]);
  pc.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate(event.candidate);
  };
  return pc;
};

export const subscribeIncomingCalls = (uid, handler) => {
  const callsRef = dbRef(realtimeDb, 'calls');
  return onValue(callsRef, (snap) => {
    const all = snap.val() || {};
    const incoming = Object.entries(all)
      .map(([id, data]) => ({ id, ...data }))
      .find((call) => call.to === uid && call.status === 'ringing');
    handler(incoming || null);
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
};

export const pushIceCandidate = async (callId, uid, candidate) => {
  const candidateRef = push(dbRef(realtimeDb, `calls/${callId}/candidates/${uid}`));
  await set(candidateRef, JSON.parse(JSON.stringify(candidate)));
};

export const subscribeIceCandidates = (callId, uid, handler) => {
  return onValue(dbRef(realtimeDb, `calls/${callId}/candidates/${uid}`), (snap) => {
    const value = snap.val() || {};
    Object.values(value).forEach((candidate) => handler(candidate));
  });
};

export const sendCallAnswer = async (callId, answer) => {
  await update(dbRef(realtimeDb, `calls/${callId}`), {
    answer: JSON.parse(JSON.stringify(answer)),
    status: 'active'
  });
};

export const endCallRoom = async (callId) => {
  await remove(dbRef(realtimeDb, `calls/${callId}`));
};
