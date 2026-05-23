import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Home, LogOut, Search, Settings, Users, WifiOff } from 'lucide-react';
import EmailVerificationPanel from './components/auth/EmailVerificationPanel.jsx';
import Avatar from './components/Avatar.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import {
  api,
  canContactUser,
  mergeWithPendingMessages,
  messagesListEqual,
  primeUserCache,
  reconcileSentMessage,
  setTyping as setFirebaseTyping,
  subscribeBlockState,
  subscribeChats,
  subscribeMessages,
  subscribePresence,
  subscribeTyping
} from './api.js';
import { playIncomingRing, stopIncomingRing, unlockCallAudio } from './utils/callRingtone.js';
import { error as toastError, success as toastSuccess } from './utils/toast.js';
import { initError } from './firebase.js';
import { useAuth } from './hooks/useAuth.js';
import { registerBackgroundSync, requestNotificationPermission } from './pwa.js';
import { usePwaInstall } from './hooks/usePwaInstall.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import { getCallRuntime } from './utils/callRuntime.js';
import { getCallMediaStream } from './utils/media.js';
import { scheduleIdle } from './utils/scheduleIdle.js';
import { auth } from './firebase.js';
import { chatImage, chatTitle, directPeer, formatTime, statusText } from './utils/chat.js';
import { buildStatusContactIds, filterStatusesForContacts, userHasUnviewedStatus } from './utils/statusHelpers.js';
import EmptyState from './features/chat/EmptyState.jsx';
import PeopleSearchRow from './features/people/PeopleSearchRow.jsx';

const AuthScreen = lazy(() => import('./components/AuthScreen.jsx'));
const InstallAppPrompt = lazy(() => import('./features/install/InstallAppPrompt.jsx'));
const StatusTray = lazy(() => import('./features/status/StatusTray.jsx'));
const ChatPanel = lazy(() => import('./features/chat/ChatPanel.jsx'));
const GroupModal = lazy(() => import('./features/settings/GroupModal.jsx'));
const GroupStrip = lazy(() => import('./features/chat/GroupStrip.jsx'));
const ProfileSettings = lazy(() => import('./features/settings/ProfileSettings.jsx'));
const CallModal = lazy(() => import('./features/calls/CallModal.jsx'));

export default function App() {
  if (initError) {
    return (
      <main className="grid min-h-screen place-items-center bg-gradient-to-br from-rose-50 to-rose-100 p-4">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-2xl font-black text-rose-700 mb-4 font-sans">Configuration Error</h1>
          <p className="text-sm text-slate-600 mb-6 font-sans">{initError}</p>
          <div className="rounded-2xl bg-slate-50 p-4 text-xs text-left text-slate-500 border border-slate-200 font-sans">
            <p className="font-bold mb-1 text-slate-700">To fix this on Vercel:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Go to your Vercel Dashboard</li>
              <li>Select your project &rarr; Settings &rarr; Environment Variables</li>
              <li>Add the missing keys:</li>
              <ul className="list-disc pl-4 mt-1 font-mono text-[10px] text-slate-600">
                <li>VITE_FIREBASE_API_KEY</li>
                <li>VITE_FIREBASE_AUTH_DOMAIN</li>
                <li>VITE_FIREBASE_PROJECT_ID</li>
                <li>VITE_FIREBASE_APP_ID</li>
              </ul>
              <li className="mt-2 text-slate-500">Redeploy your project to apply the changes</li>
            </ol>
          </div>
        </div>
        <ToastContainer />
      </main>
    );
  }

  const authState = useAuth();

  if (authState.loading) {
    return (
      <>
        <LoadingSpinner />
        <ToastContainer />
      </>
    );
  }

  if (authState.needsEmailVerification) {
    return (
      <>
        <main className="grid min-h-dvh place-items-center px-3 py-6 bg-gradient-to-br from-aqua-25 via-white to-aqua-50">
          <EmailVerificationPanel
            email={authState.firebaseUser?.email || ''}
            onVerified={() => window.location.reload()}
            onBackToLogin={authState.logout}
          />
        </main>
        <ToastContainer />
      </>
    );
  }

  if (!authState.firebaseUser) return (
    <>
      <Suspense fallback={<LoadingSpinner />}>
        <AuthScreen />
      </Suspense>
      <ToastContainer />
    </>
  );

  if (!authState.profile) {
    return (
      <>
        <main className="grid min-h-screen place-items-center px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white/90 p-6 text-center shadow-soft">
            <h1 className="text-2xl font-black text-cyan-950">Loading your chats</h1>
            <p className="mt-2 text-sm text-slate-500">{authState.error || 'Preparing your profile...'}</p>
            {authState.error && (
              <button onClick={authState.logout} className="mt-4 rounded-2xl bg-cyan-500 px-5 py-3 font-bold text-white">
                Back to login
              </button>
            )}
          </div>
        </main>
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<LoadingSpinner />}>
        <ChatShell {...authState} />
      </Suspense>
      <ToastContainer />
    </>
  );
}

function ChatShell({ firebaseUser, profile, setProfile, logout }) {
  const isMobile = useIsMobile();
  const [chats, setChats] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [statuses, setStatuses] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sendEpoch, setSendEpoch] = useState(0);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(null);
  const [blockState, setBlockState] = useState({ blocked: new Set(), blockedBy: new Set() });
  const [panel, setPanel] = useState(() => new URLSearchParams(window.location.search).get('panel') || 'chats');
  const [groupOpen, setGroupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callState, setCallState] = useState(null);
  const [remoteMediaEpoch, setRemoteMediaEpoch] = useState(0);
  const [activeCallId, setActiveCallId] = useState(null);
  const [connectingUserId, setConnectingUserId] = useState(null);
  const {
    canInstall,
    showInstallButton,
    isStandalone,
    isIos,
    isDesktopChromium,
    showPrompt: showInstall,
    installInstructions,
    install: installApp,
    dismissPrompt: dismissInstallPrompt,
    openPrompt: openInstallPrompt
  } = usePwaInstall();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const callUnsubscribersRef = useRef([]);
  const hasAutoSelectedChatRef = useRef(false);
  const selectedChatRef = useRef(selectedChat);
  const activeMessagesChatRef = useRef(null);
  const seenTimerRef = useRef(null);
  const callStateRef = useRef(callState);
  const usersRef = useRef(users);
  const blockStateRef = useRef(blockState);
  selectedChatRef.current = selectedChat;
  callStateRef.current = callState;
  usersRef.current = users;
  blockStateRef.current = blockState;

  const isBlockedUser = (userId) => {
    if (!userId) return false;
    const state = blockStateRef.current;
    return state.blocked?.has(userId) || state.blockedBy?.has(userId);
  };

  const selectedPeer = useMemo(() => directPeer(selectedChat, profile), [selectedChat, profile]);

  const statusContactIds = useMemo(
    () => buildStatusContactIds(profile?._id, chats, profile?.connections),
    [profile?._id, profile?.connections, chats]
  );

  const visibleStatuses = useMemo(
    () => filterStatusesForContacts(statuses, statusContactIds),
    [statuses, statusContactIds]
  );

  const loadUsers = async (searchText = query) => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await api.users(searchText);
      setUsers(data.users || []);
      setTotalUsers(data.totalUsers || 0);
      return data;
    } catch (error) {
      setUsersError(error.message || 'Could not search users.');
      setUsers([]);
      setTotalUsers(0);
      return null;
    } finally {
      setUsersLoading(false);
    }
  };

  const maybeAutoSelectChat = (chatList) => {
    if (selectedChatRef.current || isMobile || hasAutoSelectedChatRef.current || !chatList[0]) return;
    hasAutoSelectedChatRef.current = true;
    setSelectedChat(chatList[0]);
  };

  const refreshStatuses = async () => {
    const { statuses: next } = await api.statuses();
    setStatuses(next);
  };

  useEffect(() => {
    const unsubscribe = api.subscribeStatuses(setStatuses);
    return () => unsubscribe?.();
  }, []);

  const refresh = async () => {
    if (panel === 'people' || query.trim()) {
      await loadUsers(query);
    }
    await refreshStatuses();
  };

  const closeChat = () => {
    setSelectedChat(null);
    setMessages([]);
    setTyping(null);
  };

  useEffect(() => {
    const cancel = scheduleIdle(() => {
      refreshStatuses().catch(console.error);
    });
    return cancel;
  }, []);

  const presenceRef = useRef({});

  useEffect(() => {
    const uid = profile?._id || firebaseUser?.uid;
    if (!uid) return undefined;
    return subscribeBlockState(uid, setBlockState);
  }, [profile?._id, firebaseUser?.uid]);

  const mergePresence = (user, presence) => {
    if (isBlockedUser(user._id)) {
      return { ...user, isOnline: false, online: false, lastSeen: null };
    }
    const live = presence[user._id];
    if (!live) {
      return { ...user, isOnline: false, online: false };
    }
    const isOnline = Boolean(live.isOnline ?? live.online);
    return {
      ...user,
      isOnline,
      online: isOnline,
      lastSeen: live.lastSeen || user.lastSeen
    };
  };

  const applyPresenceToUsers = (items, presence) => items.map((user) => mergePresence(user, presence));

  const applyPresenceToChats = (items, presence) =>
    items.map((chat) => ({
      ...chat,
      participants: chat.participants.map((participant) => ({
        ...participant,
        user: mergePresence(participant.user, presence)
      }))
    }));

  useEffect(() => {
    const presence = presenceRef.current;
    setUsers((current) => applyPresenceToUsers(current, presence));
    setChats((current) => applyPresenceToChats(current, presence));
  }, [blockState]);

  useEffect(() => {
    const unsubscribePresence = subscribePresence((presence) => {
      presenceRef.current = presence;
      setUsers((current) => applyPresenceToUsers(current, presence));
      setChats((current) => applyPresenceToChats(current, presence));
    });

    const unsubscribeChats = subscribeChats((nextChats) => {
      setChats(applyPresenceToChats(nextChats, presenceRef.current));
      maybeAutoSelectChat(nextChats);
    });

    return () => {
      unsubscribePresence?.();
      unsubscribeChats?.();
    };
  }, [profile?._id]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    const unlockAudio = () => unlockCallAudio();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    registerBackgroundSync().catch(() => {});
    unlockCallAudio();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (panel !== 'people' && !query.trim()) return undefined;

    let cancelled = false;
    const timeout = setTimeout(() => {
      loadUsers(query).finally(() => {
        if (cancelled) setUsersLoading(false);
      });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [panel, query]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      setTyping(null);
      return;
    }

    const chatId = selectedChat._id;
    activeMessagesChatRef.current = chatId;
    setSendEpoch(0);
    setTyping(null);

    const unsubscribeMessages = subscribeMessages(chatId, (nextMessages) => {
      if (activeMessagesChatRef.current !== chatId) return;
      setMessages((current) => {
        let next = nextMessages;
        const hasPending = current.some((item) => item.pending);
        if (hasPending) {
          next = mergeWithPendingMessages(nextMessages, current);
        }
        return messagesListEqual(current, next) ? current : next;
      });
      clearTimeout(seenTimerRef.current);
      seenTimerRef.current = setTimeout(() => api.seen(chatId).catch(console.error), 1200);
    });
    const unsubscribeTyping = subscribeTyping(chatId, (next) => {
      if (next?._id && isBlockedUser(next._id)) {
        setTyping(null);
        return;
      }
      setTyping(next);
    });
    return () => {
      if (activeMessagesChatRef.current === chatId) activeMessagesChatRef.current = null;
      clearTimeout(seenTimerRef.current);
      unsubscribeMessages?.();
      unsubscribeTyping?.();
    };
  }, [selectedChat?._id]);

  const openDirect = async (userId) => {
    const { chat } = await api.createDirectChat(userId);
    setChats((current) => [chat, ...current.filter((item) => item._id !== chat._id)]);
    setSelectedChat(chat);
    setPanel('chats');
  };

  const updateUser = (userId, patch) => {
    setUsers((current) => current.map((user) => (user._id === userId ? { ...user, ...patch } : user)));
  };

  const openChat = (chat) => {
    setChats((current) => [chat, ...current.filter((item) => item._id !== chat._id)]);
    setSelectedChat(chat);
    setPanel('chats');
  };

  const connectWithUser = async (user) => {
    setConnectingUserId(user._id);
    try {
      const data = await api.connectUser(user._id);
      updateUser(user._id, { connectionStatus: data.status, directChatId: data.chatId });
      if (data.chat) {
        openChat(data.chat);
        toastSuccess(`Connected with ${user.displayName}`);
      } else {
        await refresh();
      }
    } catch (err) {
      toastError(err.message || 'Could not connect with this user.');
    } finally {
      setConnectingUserId(null);
    }
  };

  const acceptUser = async (user) => {
    setConnectingUserId(user._id);
    try {
      const data = await api.acceptConnection(user._id);
      updateUser(user._id, { connectionStatus: data.status, directChatId: data.chatId });
      if (data.chat) {
        openChat(data.chat);
      } else {
        await refresh();
      }
      toastSuccess(`Connected with ${user.displayName}`);
    } catch (err) {
      toastError(err.message || 'Could not accept connection.');
    } finally {
      setConnectingUserId(null);
    }
  };

  const followUser = async (user) => {
    const data = await api.followUser(user._id);
    updateUser(user._id, { isFollowing: data.isFollowing });
  };

  const handleInstall = async () => {
    const choice = await installApp();
    if (choice?.outcome === 'accepted') {
      await requestNotificationPermission();
    }
  };

  const sendPayload = async (payload) => {
    if (!selectedChat) return;
    if (selectedChat.type === 'direct' && selectedPeer && !canContactUser(blockStateRef.current, selectedPeer._id)) {
      toastError('You cannot message this user.');
      return;
    }
    const chatId = selectedChat._id;
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      _id: tempId,
      localKey: tempId,
      pending: true,
      chat: chatId,
      sender: profile,
      senderId: profile._id || firebaseUser?.uid,
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
      status: 'sending',
      createdAt: new Date().toISOString(),
      clientCreatedAt: Date.now()
    };

    setSendEpoch((epoch) => epoch + 1);
    setMessages((current) => [...current, optimistic]);
    setFirebaseTyping(chatId, false).catch(console.error);

    try {
      const { message } = await api.sendMessage({ chatId, sender: profile, ...payload });
      if (activeMessagesChatRef.current !== chatId) return;
      setMessages((current) => {
        const next = reconcileSentMessage(current, tempId, message);
        return messagesListEqual(current, next) ? current : next;
      });
      setChats((current) =>
        current.map((chat) =>
          chat._id === chatId
            ? { ...chat, lastMessage: message, updatedAt: message.createdAt }
            : chat
        )
      );
    } catch (error) {
      setMessages((current) => current.filter((item) => item._id !== tempId));
      toastError(error.message || 'Message failed to send.');
      console.error(error);
    }
  };

  const createStatus = async (payload) => {
    try {
      if (payload.type === 'text') {
        await api.createStatus({
          type: 'text',
          statusText: payload.statusText,
          caption: payload.statusText
        });
        toastSuccess('Status posted');
        return;
      }
      const upload = await api.uploadStatusMedia(payload.file, { onProgress: payload.onProgress });
      await api.createStatus({
        type: payload.type,
        statusText: payload.statusText || '',
        caption: payload.statusText || '',
        statusMedia: upload.url,
        mediaUrl: upload.url
      });
      toastSuccess('Status posted');
    } catch (error) {
      toastError(error.message || 'Could not post status.');
      throw error;
    }
  };

  const cleanupCallListeners = () => {
    callUnsubscribersRef.current.forEach((unsubscribe) => unsubscribe?.());
    callUnsubscribersRef.current = [];
  };

  const attachLocalStream = (stream, callType) => {
    localStreamRef.current = stream;
    const video = localVideoRef.current;
    if (video) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    setCallState((current) => ({
      ...current,
      active: true,
      callType,
      muted: false,
      cameraOff: callType === 'voice',
      speakerOn: true
    }));
  };

  const toggleCallMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCallState((current) => (current ? { ...current, muted: !track.enabled } : current));
  };

  const toggleCallCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCallState((current) => (current ? { ...current, cameraOff: !track.enabled } : current));
    if (localVideoRef.current) {
      localVideoRef.current.style.opacity = track.enabled ? '1' : '0.3';
    }
  };

  const toggleCallSpeaker = () => {
    setCallState((current) => {
      if (!current) return current;
      const speakerOn = !current.speakerOn;
      const audio = remoteAudioRef.current;
      const video = remoteVideoRef.current;
      if (audio) audio.muted = !speakerOn;
      if (video) video.muted = !speakerOn;
      return { ...current, speakerOn };
    });
  };

  const attachRemoteMedia = () => {
    const stream = remoteStreamRef.current;
    const video = remoteVideoRef.current;
    const audio = remoteAudioRef.current;
    
    if (stream) {
      if (video && stream.getVideoTracks().length) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
      if (audio) {
        audio.srcObject = stream;
        audio.play().catch(() => {});
      }
    }
  };

  const signalingUid = () => {
    const uid = auth?.currentUser?.uid || profile?._id;
    if (!uid) throw new Error('You must be signed in to place or answer a call.');
    return uid;
  };

  const setupPeer = async ({ callId, remoteUid, callType, isCaller, remoteOffer = null }) => {
    const calls = await getCallRuntime();
    const uid = await calls.waitForAuthReady();
    setCallState((current) => ({ ...current, preparing: true }));

    try {
      if (isCaller) {
        await calls.createCallRoom({ callId, from: uid, to: remoteUid, callType });
        await calls.ringCallee({ callId, from: uid, to: remoteUid, callType });
      } else {
        await calls.verifyCallAccess(callId, uid);
      }

      const [stream, pc] = await Promise.all([
        getCallMediaStream(callType),
        calls.createPeerConnection(
          (remoteStream) => {
            remoteStreamRef.current = remoteStream;
            setRemoteMediaEpoch((n) => n + 1);
          },
          (candidate) => {
            calls.pushIceCandidate(callId, uid, candidate).catch((error) => {
              console.error('[Call] ICE write failed:', error.message);
            });
          }
        )
      ]);

      attachLocalStream(stream, callType);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      peerConnectionRef.current = pc;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setRemoteMediaEpoch((n) => n + 1);
      };

      const remoteCandidates = calls.subscribeIceCandidates(callId, remoteUid, (candidate) => {
        if (!candidate || !peerConnectionRef.current) return;
        peerConnectionRef.current.addRemoteIceCandidate(candidate).catch(console.error);
      });
      callUnsubscribersRef.current.push(remoteCandidates);

      const roomListener = calls.subscribeCallRoom(callId, async (room) => {
        if (!room || !peerConnectionRef.current) return;
        const answer = room.answer;
        if (isCaller && answer && !peerConnectionRef.current.currentRemoteDescription) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          await peerConnectionRef.current.flushRemoteIceCandidates();
        }
        if (room.status === 'ended') endCall();
      });
      callUnsubscribersRef.current.push(roomListener);

      if (isCaller) {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video'
        });
        await pc.setLocalDescription(offer);
        await calls.publishCallOffer(callId, offer);
      } else if (remoteOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
        await pc.flushRemoteIceCandidates();
        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video'
        });
        await pc.setLocalDescription(answer);
        await calls.sendCallAnswer(callId, uid, answer);
      }
    } finally {
      setCallState((current) => (current ? { ...current, preparing: false } : current));
    }
  };

  useEffect(() => {
    if (!callState?.active) return;
    attachRemoteMedia();
  }, [remoteMediaEpoch]);

  useEffect(() => {
    if (callState?.active && callState?.incoming) {
      playIncomingRing();
    } else {
      stopIncomingRing();
    }
    return () => stopIncomingRing();
  }, [callState?.active, callState?.incoming, callState?.callId]);

  const startCall = async (callType) => {
    if (!selectedPeer || callState?.active) return;
    if (!canContactUser(blockStateRef.current, selectedPeer._id)) {
      toastError('You cannot call this user.');
      return;
    }
    const calls = await getCallRuntime();
    const uid = await calls.waitForAuthReady();
    const callId = `call_${[uid, selectedPeer._id].sort().join('_')}_${Date.now()}`;
    setActiveCallId(callId);
    setCallState({
      active: true,
      incoming: false,
      callId,
      callType,
      caller: selectedPeer,
      from: uid,
      to: selectedPeer._id,
      muted: false,
      cameraOff: callType === 'voice',
      speakerOn: true
    });

    try {
      await setupPeer({ callId, remoteUid: selectedPeer._id, callType, isCaller: true });
    } catch (error) {
      console.error(error);
      toastError(error.message || 'Could not start call. Check microphone/camera permissions.');
      endCall();
    }
  };

  const answerCall = async () => {
    if (!callState?.callId || !callState?.offer) return;
    stopIncomingRing();
    setCallState((current) => (current ? { ...current, incoming: false, preparing: true } : current));
    try {
      const calls = await getCallRuntime();
      const uid = await calls.waitForAuthReady();
      if (callState.to && uid && callState.to !== uid) {
        toastError('This call is for another account. Sign in with the correct user and try again.');
        return;
      }
      await setupPeer({
        callId: callState.callId,
        remoteUid: callState.from,
        callType: callState.callType,
        isCaller: false,
        remoteOffer: callState.offer
      });
    } catch (error) {
      console.error(error);
      toastError(error.message || 'Could not answer call.');
      endCall();
    }
  };

  const endCall = () => {
    stopIncomingRing();
    const endingCallId = activeCallId || callState?.callId;
    const from = callState?.from || auth?.currentUser?.uid || profile?._id;
    const to = callState?.to || selectedPeer?._id;
    cleanupCallListeners();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (endingCallId && to) {
      getCallRuntime().then((calls) => calls.endCallRoom(endingCallId, from, to)).catch(console.error);
    }
    setActiveCallId(null);
    setCallState(null);
  };

  useEffect(() => {
    const uid = auth?.currentUser?.uid || profile?._id;
    if (!uid) return undefined;

    let cancelled = false;
    let unsubscribe = () => {};

    getCallRuntime().then((calls) => {
      if (cancelled) return;
      unsubscribe = calls.subscribeIncomingCalls(uid, (incoming) => {
        if (!incoming) {
          const current = callStateRef.current;
          if (current?.incoming && !current?.preparing) {
            stopIncomingRing();
            setActiveCallId(null);
            setCallState(null);
          }
          return;
        }
        if (!canContactUser(blockStateRef.current, incoming.from)) return;

        const current = callStateRef.current;
        if (current?.active && !current?.incoming) return;
        if (current?.incoming && current?.callId === incoming.id) {
          if (incoming.offer && !current.offer) {
            setCallState((prev) => (prev ? { ...prev, offer: incoming.offer } : prev));
          }
          return;
        }

        const caller =
          usersRef.current.find((user) => user._id === incoming.from) ||
          { _id: incoming.from, displayName: 'Incoming call' };
        playIncomingRing();
        setActiveCallId(incoming.id);
        setCallState({
          active: true,
          incoming: true,
          callId: incoming.id,
          callType: incoming.callType || 'voice',
          caller,
          from: incoming.from,
          to: incoming.to,
          offer: incoming.offer || null,
          muted: false,
          cameraOff: (incoming.callType || 'voice') === 'voice',
          speakerOn: true
        });
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [profile?._id, firebaseUser?.uid]);

  return (
    <main className="app-shell bg-gradient-to-br from-aqua-25 via-white to-aqua-50 overflow-hidden p-0 sm:p-2 md:p-3 lg:p-4">
      {!isOnline && (
        <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 shadow-soft">
          <WifiOff size={18} />
          Offline mode. Cached chats stay available.
        </div>
      )}
      <div className="mx-auto grid h-full max-w-7xl overflow-hidden border-0 sm:border border-white/60 bg-white/80 shadow-soft-xl backdrop-blur-sm sm:rounded-[2rem] lg:rounded-[2.5rem] lg:grid-cols-[minmax(280px,360px)_1fr]">
        {/* Sidebar */}
        <aside className={`${selectedChat && isMobile ? 'hidden' : 'flex'} min-h-0 w-full flex-col border-r border-aqua-100/60 bg-gradient-to-b from-white/95 to-aqua-25/50 lg:flex`}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-aqua-100/40 px-4 py-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSettingsOpen(true)} className="rounded-2xl ring-1 ring-aqua-100/50 transition hover:ring-aqua-200" title="Profile settings">
                <Avatar user={profile} online size="md" />
              </button>
              <div>
                <h2 className="text-sm font-black text-cyan-950">AquaChat</h2>
                <p className="text-xs font-medium text-slate-500">@{profile.username || 'set-username'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {showInstallButton && (
                <button
                  onClick={() => (canInstall ? handleInstall() : openInstallPrompt())}
                  className={`rounded-2xl p-2.5 transition duration-200 ${
                    canInstall
                      ? 'bg-cyan-500 text-white shadow-md shadow-cyan-200/60 hover:bg-cyan-600'
                      : 'text-slate-600 hover:bg-aqua-100/60 hover:text-cyan-700'
                  }`}
                  title={canInstall ? 'Install AquaChat' : installInstructions}
                >
                  <Download size={18} />
                </button>
              )}
              <button onClick={() => setSettingsOpen(true)} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Settings">
                <Settings size={18} />
              </button>
              <button onClick={() => setGroupOpen(true)} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="New group">
                <Users size={18} />
              </button>
              <button onClick={logout} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-blush-100/60 hover:text-rose-600" title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="border-b border-aqua-100/40 px-3 py-3">
            <div className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-aqua-50/60 to-aqua-100/40 border border-aqua-100/50 px-3.5 py-2.5 transition focus-within:bg-aqua-50/80 focus-within:border-aqua-200/60 focus-within:shadow-inner-soft">
              <Search size={17} className="text-cyan-600/70 flex-shrink-0" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim()) setPanel('people'); }} placeholder="Search username, email, phone" className="min-w-0 flex-1 bg-transparent text-sm placeholder-slate-400 outline-none" />
            </div>
          </div>

          {/* Status Tray */}
          <Suspense fallback={<div className="h-20 animate-pulse bg-aqua-50/40" />}>
            <StatusTray statuses={visibleStatuses} onCreateStatus={createStatus} me={profile} />
          </Suspense>

          {/* Tab Buttons */}
          <div className="hidden gap-2 border-b border-aqua-100/40 px-3 py-3 sm:flex">
            <button onClick={() => setPanel('chats')} className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition duration-200 ${panel === 'chats' ? 'bg-gradient-to-r from-cyan-500 to-aqua-400 text-white shadow-lg shadow-cyan-200/50' : 'bg-aqua-50/60 text-cyan-700 hover:bg-aqua-100/60'}`}>
              Chats
            </button>
            <button onClick={() => setPanel('people')} className={`flex-1 rounded-2xl py-2.5 text-xs font-bold transition duration-200 ${panel === 'people' ? 'bg-gradient-to-r from-cyan-500 to-aqua-400 text-white shadow-lg shadow-cyan-200/50' : 'bg-aqua-50/60 text-cyan-700 hover:bg-aqua-100/60'}`}>
              People
            </button>
          </div>

          {/* Chat/People List */}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:pb-3">
            {panel === 'chats' ? (
              chats.length > 0 ? (
                chats.map((chat) => (
                  <button 
                    key={chat._id} 
                    onClick={() => {
                      setSelectedChat(chat);
                      setChats((current) => current.map((item) => (item._id === chat._id ? { ...item, unreadCount: 0 } : item)));
                    }} 
                    className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left transition duration-200 group ${selectedChat?._id === chat._id ? 'bg-gradient-to-r from-cyan-500/20 to-aqua-300/20 border border-cyan-200/50' : 'hover:bg-aqua-50/60 border border-transparent'}`}
                  >
                    <Avatar
                      name={chatTitle(chat, profile)}
                      image={chatImage(chat, profile)}
                      online={directPeer(chat, profile)?.isOnline}
                      statusRing={userHasUnviewedStatus(visibleStatuses, directPeer(chat, profile)?._id, profile._id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="truncate font-bold text-cyan-950 text-sm">{chatTitle(chat, profile)}</h3>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <span className="text-xs text-slate-400">{formatTime(chat.lastMessage?.createdAt || chat.updatedAt)}</span>
                          {chat.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black text-white">{chat.unreadCount}</span>}
                        </div>
                      </div>
                      <p className="truncate text-sm text-slate-500">{chat.lastMessage?.body || (chat.type === 'group' ? 'Group chat' : statusText(directPeer(chat, profile)))}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-slate-400">No chats yet</p>
                </div>
              )
            ) : (
              usersLoading ? (
                <div className="space-y-2 p-2">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="flex animate-pulse items-center gap-3 rounded-2xl bg-aqua-50/60 p-3">
                      <div className="h-11 w-11 rounded-2xl bg-aqua-100" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3 w-32 rounded-full bg-aqua-100" />
                        <div className="h-3 w-48 rounded-full bg-aqua-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : usersError ? (
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <p className="text-sm font-bold text-rose-500">{usersError}</p>
                </div>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <PeopleSearchRow
                    key={user._id}
                    user={user}
                    meId={profile._id}
                    statuses={visibleStatuses}
                    connecting={connectingUserId === user._id}
                    onConnect={connectWithUser}
                    onAccept={acceptUser}
                    onFollow={followUser}
                    onMessage={openDirect}
                  />
                ))
              ) : totalUsers === 0 ? (
                <div className="h-full flex items-center justify-center px-6 text-center">
                  <p className="text-sm text-slate-400">No registered users yet</p>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-slate-400">No matching users</p>
                </div>
              )
            )}
          </div>
        </aside>

        {/* Chat Area */}
        <section className={`${selectedChat || !isMobile ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
          {selectedChat ? (
            <>
              <Suspense fallback={<div className="min-h-0 flex-1 animate-pulse bg-aqua-50/30" />}>
                <ChatPanel
                  chat={selectedChat}
                  me={profile}
                  messages={messages}
                  sendEpoch={sendEpoch}
                  statuses={visibleStatuses}
                  typing={typing}
                  blockState={blockState}
                  isMobile={isMobile}
                  onBack={closeChat}
                  onAudio={() => startCall('voice')}
                  onVideo={() => startCall('video')}
                  onSend={sendPayload}
                  onUpload={(file, options) => api.upload(file, options)}
                  onDeleteForMe={api.deleteMessageForMe}
                  onDeleteForEveryone={api.deleteMessageForEveryone}
                  onBulkDeleteForMe={api.deleteMessagesForMe}
                />
              </Suspense>
              {selectedChat.type === 'group' && <GroupStrip chat={selectedChat} me={profile} users={users} onRefresh={refresh} />}
            </>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <nav className={`${selectedChat && isMobile ? 'hidden' : 'grid'} fixed bottom-0 left-0 right-0 z-30 grid-cols-3 border-t border-aqua-100 bg-white/95 px-2 sm:px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-soft backdrop-blur lg:hidden`}>
        <button onClick={() => setPanel('chats')} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-black ${panel === 'chats' ? 'bg-cyan-500 text-white' : 'text-cyan-800'}`}>
          <Home size={19} />
          Chats
        </button>
        <button onClick={() => setPanel('people')} className={`flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-black ${panel === 'people' ? 'bg-cyan-500 text-white' : 'text-cyan-800'}`}>
          <Search size={19} />
          People
        </button>
        <button onClick={() => setSettingsOpen(true)} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-black text-cyan-800">
          <Settings size={19} />
          Profile
        </button>
      </nav>

      {groupOpen && (
        <Suspense fallback={null}>
          <GroupModal users={users} onClose={() => setGroupOpen(false)} onCreated={(chat) => { setChats((current) => [chat, ...current]); setSelectedChat(chat); setGroupOpen(false); }} />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <ProfileSettings firebaseUser={firebaseUser} profile={profile} setProfile={setProfile} onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
      {callState?.active && (
        <Suspense fallback={null}>
          <CallModal
            state={callState}
            localVideoRef={localVideoRef}
            remoteVideoRef={remoteVideoRef}
            remoteAudioRef={remoteAudioRef}
            muted={callState.muted}
            cameraOff={callState.cameraOff}
            speakerOn={callState.speakerOn !== false}
            onToggleMute={toggleCallMute}
            onToggleCamera={toggleCallCamera}
            onToggleSpeaker={toggleCallSpeaker}
            onAnswer={answerCall}
            onEnd={endCall}
            remoteMediaEpoch={remoteMediaEpoch}
          />
        </Suspense>
      )}
      {showInstall && (
        <Suspense fallback={null}>
          <InstallAppPrompt
            canInstall={canInstall}
            isIos={isIos}
            isDesktopChromium={isDesktopChromium}
            installInstructions={installInstructions}
            onInstall={handleInstall}
            onClose={dismissInstallPrompt}
          />
        </Suspense>
      )}
    </main>
  );
}
