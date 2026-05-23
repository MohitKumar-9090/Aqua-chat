import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Home, LogOut, Search, Settings, Users, WifiOff } from 'lucide-react';
import AuthScreen from './components/AuthScreen.jsx';
import EmailVerificationPanel from './components/auth/EmailVerificationPanel.jsx';
import Avatar from './components/Avatar.jsx';
import LoadingSpinner from './components/LoadingSpinner.jsx';
import ToastContainer from './components/ToastContainer.jsx';
import { api, mergeWithPendingMessages, setTyping as setFirebaseTyping, subscribeChats, subscribeMessages, subscribePresence, subscribeTyping } from './api.js';
import { error as toastError, success as toastSuccess } from './utils/toast.js';
import { initError } from './firebase.js';
import { useAuth } from './hooks/useAuth.js';
import { registerBackgroundSync, requestNotificationPermission } from './pwa.js';
import { usePwaInstall } from './hooks/usePwaInstall.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import {
  createCallRoom,
  createPeerConnection,
  endCallRoom,
  publishCallOffer,
  pushIceCandidate,
  ringCallee,
  sendCallAnswer,
  subscribeCallRoom,
  subscribeIceCandidates,
  subscribeIncomingCalls
} from './utils/calls.js';
import { prefetchIceServers } from './utils/iceServers.js';
import { getCallMediaStream } from './utils/media.js';
import { auth } from './firebase.js';
import { chatImage, chatTitle, directPeer, formatTime, statusText } from './utils/chat.js';
import InstallAppPrompt from './features/install/InstallAppPrompt.jsx';
import EmptyState from './features/chat/EmptyState.jsx';
import PeopleSearchRow from './features/people/PeopleSearchRow.jsx';
import StatusTray from './features/status/StatusTray.jsx';
import ChatPanel from './features/chat/ChatPanel.jsx';
import GroupModal from './features/settings/GroupModal.jsx';
import GroupStrip from './features/chat/GroupStrip.jsx';
import ProfileSettings from './features/settings/ProfileSettings.jsx';
import CallModal from './features/calls/CallModal.jsx';

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
      <AuthScreen />
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
      <ChatShell {...authState} />
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
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(null);
  const [panel, setPanel] = useState(() => new URLSearchParams(window.location.search).get('panel') || 'chats');
  const [groupOpen, setGroupOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callState, setCallState] = useState(null);
  const [activeCallId, setActiveCallId] = useState(null);
  const [connectingUserId, setConnectingUserId] = useState(null);
  const {
    canInstall,
    isStandalone,
    isIos,
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
  const localStreamRef = useRef(null);
  const callUnsubscribersRef = useRef([]);
  const hasAutoSelectedChatRef = useRef(false);
  const selectedChatRef = useRef(selectedChat);
  const activeMessagesChatRef = useRef(null);
  const seenTimerRef = useRef(null);
  const callStateRef = useRef(callState);
  selectedChatRef.current = selectedChat;
  callStateRef.current = callState;

  const selectedPeer = useMemo(() => directPeer(selectedChat, profile), [selectedChat, profile]);

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

  const refresh = async () => {
    const [chatData, statusData, userData] = await Promise.all([api.chats(), api.statuses(), api.users(query)]);
    setChats(applyPresenceToChats(chatData.chats, presenceRef.current));
    setStatuses(statusData.statuses);
    setUsers(userData.users || []);
    setTotalUsers(userData.totalUsers || 0);
    maybeAutoSelectChat(chatData.chats);
  };

  const closeChat = () => {
    setSelectedChat(null);
    setMessages([]);
    setTyping(null);
  };

  useEffect(() => {
    refresh().catch(console.error);
    prefetchIceServers();
  }, []);

  const presenceRef = useRef({});

  const mergePresence = (user, presence) => {
    const live = presence[user._id];
    if (!live) return { ...user, isOnline: false, online: false };
    return {
      ...user,
      isOnline: live.isOnline,
      online: live.online,
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
  }, [isMobile]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    registerBackgroundSync().catch(() => {});
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const searchText = query.trim();
    setUsersLoading(true);
    setUsersError('');

    const timeout = setTimeout(() => {
      api.users(searchText)
        .then((data) => {
          if (cancelled) return;
          setUsers(data.users || []);
          setTotalUsers(data.totalUsers || 0);
        })
        .catch((error) => {
          if (cancelled) return;
          setUsers([]);
          setUsersError(error.message || 'Could not search users.');
        })
        .finally(() => {
          if (!cancelled) setUsersLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      setTyping(null);
      return;
    }

    const chatId = selectedChat._id;
    activeMessagesChatRef.current = chatId;
    setMessages([]);
    setTyping(null);

    const unsubscribeMessages = subscribeMessages(chatId, (nextMessages) => {
      if (activeMessagesChatRef.current !== chatId) return;
      setMessages((current) => mergeWithPendingMessages(nextMessages, current));
      clearTimeout(seenTimerRef.current);
      seenTimerRef.current = setTimeout(() => api.seen(chatId).catch(console.error), 900);
    });
    const unsubscribeTyping = subscribeTyping(chatId, setTyping);
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
    const chatId = selectedChat._id;
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      _id: tempId,
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

    setMessages((current) => [...current, optimistic]);
    await setFirebaseTyping(chatId, false);

    try {
      const { message } = await api.sendMessage({ chatId, ...payload });
      if (activeMessagesChatRef.current !== chatId) return;
      setMessages((current) => mergeWithPendingMessages([message], current.filter((item) => item._id !== tempId)));
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

  const createStatus = async (file) => {
    if (file) {
      const upload = await api.upload(file);
      await api.createStatus({ type: upload.resourceType === 'video' ? 'video' : 'image', mediaUrl: upload.url });
    } else {
      const caption = window.prompt('Status');
      if (caption) await api.createStatus({ type: 'text', caption });
    }
    const { statuses: next } = await api.statuses();
    setStatuses(next);
  };

  const cleanupCallListeners = () => {
    callUnsubscribersRef.current.forEach((unsubscribe) => unsubscribe?.());
    callUnsubscribersRef.current = [];
  };

  const attachLocalStream = (stream, callType) => {
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    setCallState((current) => ({
      ...current,
      active: true,
      callType,
      cameraOff: callType === 'voice'
    }));
  };

  const signalingUid = () => {
    const uid = auth?.currentUser?.uid || profile?._id;
    if (!uid) throw new Error('You must be signed in to place or answer a call.');
    return uid;
  };

  const setupPeer = async ({ callId, remoteUid, callType, isCaller, remoteOffer = null }) => {
    const uid = signalingUid();
    setCallState((current) => ({ ...current, preparing: true }));

    try {
      if (isCaller) {
        await createCallRoom({ callId, from: uid, to: remoteUid, callType });
      }

      const [stream, pc] = await Promise.all([
        getCallMediaStream(callType),
        createPeerConnection(
          (remoteStream) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
          },
          (candidate) => pushIceCandidate(callId, uid, candidate).catch(console.error)
        )
      ]);

      attachLocalStream(stream, callType);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      peerConnectionRef.current = pc;

      const roomListener = subscribeCallRoom(callId, async (room) => {
        if (!room || !peerConnectionRef.current) return;
        if (isCaller && room.answer && !peerConnectionRef.current.currentRemoteDescription) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(room.answer));
          await peerConnectionRef.current.flushRemoteIceCandidates();
        }
        if (room.status === 'ended') endCall();
      });
      callUnsubscribersRef.current.push(roomListener);

      const remoteCandidates = subscribeIceCandidates(callId, remoteUid, (candidate) => {
        if (!candidate || !peerConnectionRef.current) return;
        peerConnectionRef.current.addRemoteIceCandidate(candidate).catch(console.error);
      });
      callUnsubscribersRef.current.push(remoteCandidates);

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await publishCallOffer(callId, offer);
        await ringCallee({ callId, from: uid, to: remoteUid, callType });
      } else if (remoteOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
        await pc.flushRemoteIceCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendCallAnswer(callId, uid, answer);
      }
    } finally {
      setCallState((current) => (current ? { ...current, preparing: false } : current));
    }
  };

  const startCall = async (callType) => {
    if (!selectedPeer || callState?.active) return;
    const uid = signalingUid();
    const callId = `call_${[uid, selectedPeer._id].sort().join('_')}_${Date.now()}`;
    setActiveCallId(callId);
    setCallState({
      active: true,
      incoming: false,
      callId,
      callType,
      caller: selectedPeer,
      from: uid,
      to: selectedPeer._id
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
    const uid = auth?.currentUser?.uid || profile?._id;
    if (callState.to && uid && callState.to !== uid) {
      toastError('This call is for another account. Sign in with the correct user and try again.');
      return;
    }
    try {
      await setupPeer({
        callId: callState.callId,
        remoteUid: callState.from,
        callType: callState.callType,
        isCaller: false,
        remoteOffer: callState.offer
      });
      setCallState((current) => ({ ...current, incoming: false }));
    } catch (error) {
      console.error(error);
      toastError(error.message || 'Could not answer call.');
      endCall();
    }
  };

  const endCall = () => {
    const endingCallId = activeCallId || callState?.callId;
    const from = callState?.from || auth?.currentUser?.uid || profile?._id;
    const to = callState?.to || selectedPeer?._id;
    cleanupCallListeners();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (endingCallId && to) endCallRoom(endingCallId, from, to).catch(console.error);
    setActiveCallId(null);
    setCallState(null);
  };

  useEffect(() => {
    const uid = auth?.currentUser?.uid || profile?._id;
    if (!uid) return undefined;
    const unsubscribe = subscribeIncomingCalls(uid, async (incoming) => {
      if (!incoming || callStateRef.current?.active) return;
      const caller = users.find((user) => user._id === incoming.from) || { _id: incoming.from, displayName: 'Incoming call' };
      setActiveCallId(incoming.id);
      setCallState({
        active: true,
        incoming: true,
        callId: incoming.id,
        callType: incoming.callType || 'voice',
        caller,
        from: incoming.from,
        to: incoming.to,
        offer: incoming.offer
      });
    });
    return unsubscribe;
  }, [profile?._id, users]);

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
              {!isStandalone && (
                <button
                  onClick={() => (canInstall ? handleInstall() : openInstallPrompt())}
                  className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700"
                  title={canInstall ? 'Install AquaChat' : 'Add to Home Screen'}
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
          <StatusTray statuses={statuses} onCreate={createStatus} me={profile} />

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
                    <Avatar name={chatTitle(chat, profile)} image={chatImage(chat, profile)} online={directPeer(chat, profile)?.isOnline} />
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
              <ChatPanel
                chat={selectedChat}
                me={profile}
                messages={messages}
                typing={typing}
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

      {groupOpen && <GroupModal users={users} onClose={() => setGroupOpen(false)} onCreated={(chat) => { setChats((current) => [chat, ...current]); setSelectedChat(chat); setGroupOpen(false); }} />}
      {settingsOpen && <ProfileSettings firebaseUser={firebaseUser} profile={profile} setProfile={setProfile} onClose={() => setSettingsOpen(false)} />}
      {callState?.active && <CallModal state={callState} localVideoRef={localVideoRef} remoteVideoRef={remoteVideoRef} onAnswer={answerCall} onEnd={endCall} />}
      {showInstall && !isStandalone && (
        <InstallAppPrompt
          canInstall={canInstall}
          isIos={isIos}
          installInstructions={installInstructions}
          onInstall={handleInstall}
          onClose={dismissInstallPrompt}
        />
      )}
    </main>
  );
}
