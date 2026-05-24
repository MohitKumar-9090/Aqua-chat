import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Home, LogOut, Search, Settings, UserPlus, Users, WifiOff, X } from 'lucide-react';
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
import { registerBackgroundSync, requestNotificationPermission, registerMessagingToken, showSystemNotification, onForegroundMessage } from './pwa.js';
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
  const [callMinimized, setCallMinimized] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [remoteMediaEpoch, setRemoteMediaEpoch] = useState(0);
  const [activeCallId, setActiveCallId] = useState(null);
  const [connectingUserId, setConnectingUserId] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [connectionRequests, setConnectionRequests] = useState({ incoming: [], sent: [] });
  const [requestsOpen, setRequestsOpen] = useState(false);
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
  const peerConnectionsRef = useRef(new Map());
  const remoteStreamsByUidRef = useRef({});
  const callUnsubscribersRef = useRef([]);
  const participantVideoRefsRef = useRef({});
  const isAnsweringRef = useRef(false);
  const hasAutoSelectedChatRef = useRef(false);
  const selectedChatRef = useRef(selectedChat);
  const activeMessagesChatRef = useRef(null);
  const seenTimerRef = useRef(null);
  const callStateRef = useRef(callState);
  const usersRef = useRef(users);
  const blockStateRef = useRef(blockState);
  const prevChatsRef = useRef([]);
  const initialNotificationHandledRef = useRef(false);
  selectedChatRef.current = selectedChat;
  callStateRef.current = callState;
  usersRef.current = users;
  blockStateRef.current = blockState;

  const findDirectChatByPeerId = (peerId) =>
    chats.find((chat) => chat.type === 'direct' && chat.participantIds?.includes(peerId) && chat.participantIds.includes(profile?._id));

  const isBlockedUser = (userId) => {
    if (!userId) return false;
    const state = blockStateRef.current;
    return state.blocked?.has(userId) || state.blockedBy?.has(userId);
  };

  const isConnectedUser = (userId) => {
    if (!userId) return false;
    return profile?.connections?.includes(userId) || false;
  };

  const patchProfileConnections = (userId, connected) => {
    setProfile((current) => {
      if (!current) return current;
      const currentConnections = current.connections || [];
      const connections = connected
        ? [...new Set([...currentConnections, userId])]
        : currentConnections.filter((id) => id !== userId);
      return { ...current, connections };
    });
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

  useEffect(() => {
    if (!firebaseUser?.uid) return undefined;
    if (Notification.permission !== 'granted') return undefined;

    let mounted = true;
    registerMessagingToken()
      .then((token) => {
        if (!mounted || !token) return;
        api.saveMessagingToken(token).catch(console.error);
      })
      .catch(console.error);
    return () => {
      mounted = false;
    };
  }, [firebaseUser?.uid, Notification.permission]);

  useEffect(() => {
    if (!callState?.active || callMinimized) return undefined;

    const handlePopState = () => {
      if (callStateRef.current?.active && !callMinimized) {
        setCallMinimized(true);
        window.history.pushState({ aquachatCall: true }, '');
      }
    };

    window.history.pushState({ aquachatCall: true }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.aquachatCall) {
        window.history.back();
      }
    };
  }, [callState?.active, callMinimized]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('chat');
    if (!chatId || initialNotificationHandledRef.current) return undefined;
    const chat = chats.find((item) => item._id === chatId);
    if (chat) {
      setSelectedChat(chat);
      setPanel('chats');
      initialNotificationHandledRef.current = true;
    }
    return undefined;
  }, [chats]);

  useEffect(() => {
    if (Notification.permission !== 'granted') return undefined;
    if (document.visibilityState === 'visible') return undefined;

    const latestChat = chats.find((chat) => {
      const previous = prevChatsRef.current.find((item) => item._id === chat._id);
      return (
        previous &&
        chat.lastMessage?._id !== previous.lastMessage?._id &&
        chat.lastMessage?.senderId !== profile._id
      );
    });

    if (latestChat) {
      const message = latestChat.lastMessage;
      if (message) {
        void showSystemNotification({
          title: chatTitle(latestChat, profile),
          body: message.body || 'New message',
          icon: message.sender?.photoURL || '/icon-192.png',
          tag: `chat-${latestChat._id}`,
          url: `/?chat=${latestChat._id}`
        });
      }
    }

    prevChatsRef.current = chats;
    return undefined;
  }, [chats, profile._id]);

  useEffect(() => {
    if (!callState?.active || !callState?.incoming) return undefined;
    if (Notification.permission !== 'granted') return undefined;
    if (document.visibilityState === 'visible') return undefined;

    void showSystemNotification({
      title: `${callState.caller?.displayName || 'Incoming call'}`,
      body: `${callState.callType === 'video' ? 'Video' : 'Voice'} call`,
      icon: callState.caller?.photoURL || '/icon-192.png',
      tag: `call-${callState.callId}`,
      url: `/?chat=${callState.chatId || ''}&callId=${callState.callId}`,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200]
    });

    return undefined;
  }, [callState?.active, callState?.incoming, callState?.callId, callState?.chatId]);

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

  useEffect(() => {
    const uid = profile?._id || firebaseUser?.uid;
    if (!uid) return undefined;
    return api.subscribeConnectionRequests(uid, (data) => {
      setConnectionRequests(data);
    });
  }, [profile?._id, firebaseUser?.uid]);

  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      const title = notification.title || data.title || 'AquaChat';
      const body = notification.body || data.body || 'You have a new message.';
      const isCall = data.type === 'call' || data.callType;
      
      if (isCall) {
        playIncomingRing();
      }
      
      showSystemNotification({
        title,
        body,
        icon: notification.icon || data.icon || '/icon-192.png',
        tag: data.tag || `aquachat-${data.chatId || 'general'}`,
        url: data.url || '/',
        requireInteraction: isCall,
        vibrate: isCall ? [200, 100, 200, 100, 200] : [200, 100, 200]
      });
    });
    return unsubscribe;
  }, []);

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
      const data = await api.sendConnectionRequest(user._id);
      updateUser(user._id, { connectionStatus: data.status });
      toastSuccess(`Connection request sent to ${user.displayName}`);
    } catch (err) {
      toastError(err.message || 'Could not send connection request.');
    } finally {
      setConnectingUserId(null);
    }
  };

  const acceptUser = async (user) => {
    setConnectingUserId(user._id);
    try {
      const requestId = `${user._id}_${profile._id}`;
      const data = await api.acceptConnectionRequest(requestId);
      patchProfileConnections(user._id, true);
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

  const handleDisconnect = async (userId) => {
    try {
      await api.disconnectUser(userId);
      patchProfileConnections(userId, false);
      updateUser(userId, { connectionStatus: 'none' });
      toastSuccess('Disconnected');
    } catch (err) {
      toastError(err.message || 'Could not disconnect.');
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const data = await api.acceptConnectionRequest(requestId);
      if (data.chat) {
        const peerId = data.chat.participantIds?.find((id) => id !== profile._id);
        if (peerId) patchProfileConnections(peerId, true);
        openChat(data.chat);
      }
      toastSuccess('Connection accepted');
      await refresh();
    } catch (err) {
      toastError(err.message || 'Could not accept request.');
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      await api.rejectConnectionRequest(requestId);
      toastSuccess('Request rejected');
    } catch (err) {
      toastError(err.message || 'Could not reject request.');
    }
  };

  const handleInstall = async () => {
    const choice = await installApp();
    if (choice?.outcome === 'accepted') {
      const permission = await requestNotificationPermission();
      if (permission === 'granted') {
        const token = await registerMessagingToken();
        if (token) {
          api.saveMessagingToken(token).catch(console.error);
        }
      }
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
    if (!stream) return;
    const video = remoteVideoRef.current;
    const audio = remoteAudioRef.current;
    const isVideo = callStateRef.current?.callType === 'video';
    const speakerOn = callStateRef.current?.speakerOn !== false;

    if (video) {
      if (video.srcObject !== stream) video.srcObject = stream;
      video.muted = isVideo ? !speakerOn : true;
      video.play().catch(() => {});
    }
    if (audio) {
      if (audio.srcObject !== stream) audio.srcObject = stream;
      audio.muted = isVideo || !speakerOn;
      audio.play().catch(() => {});
    }
    
    // Attach streams to participant video refs for group calls
    const isGroupCall = callStateRef.current?.participants?.length > 1;
    if (isGroupCall) {
      Object.entries(remoteStreamsByUidRef.current).forEach(([uid, stream]) => {
        const participantVideoRef = participantVideoRefsRef.current[uid];
        if (participantVideoRef?.current && participantVideoRef.current.srcObject !== stream) {
          participantVideoRef.current.srcObject = stream;
          participantVideoRef.current.muted = true;
          participantVideoRef.current.play().catch(() => {});
        }
      });
    }
  };

  const signalingUid = () => {
    const uid = auth?.currentUser?.uid || profile?._id;
    if (!uid) throw new Error('You must be signed in to place or answer a call.');
    return uid;
  };

  const markCallConnected = () => {
    setCallState((current) => {
      if (!current || current.connectedAt) return current;
      return {
        ...current,
        status: 'active',
        connectedAt: Date.now(),
        preparing: false
      };
    });
  };

  const getCombinedRemoteStream = () => {
    const combined = new MediaStream();
    Object.values(remoteStreamsByUidRef.current).forEach((stream) => {
      stream?.getTracks().forEach((track) => {
        if (!combined.getTracks().some((candidate) => candidate.id === track.id)) {
          combined.addTrack(track);
        }
      });
    });
    return combined;
  };

  const handleRemoteStream = (remoteUid, remoteStream) => {
    remoteStreamsByUidRef.current = {
      ...remoteStreamsByUidRef.current,
      [remoteUid]: remoteStream
    };
    
    // Create video ref for participant if not exists (group calls)
    if (!participantVideoRefsRef.current[remoteUid]) {
      participantVideoRefsRef.current[remoteUid] = { current: null };
    }
    
    // Attach stream to participant video ref if exists (group calls)
    const participantVideoRef = participantVideoRefsRef.current[remoteUid];
    if (participantVideoRef?.current && remoteStream) {
      if (participantVideoRef.current.srcObject !== remoteStream) {
        participantVideoRef.current.srcObject = remoteStream;
        participantVideoRef.current.muted = true;
        participantVideoRef.current.play().catch(() => {});
      }
    }
    
    // Update remote participants state for group calls
    const isGroupCall = callStateRef.current?.participants?.length > 1;
    if (isGroupCall) {
      setRemoteParticipants((prev) => {
        const existing = prev.find((p) => p.uid === remoteUid);
        if (existing) {
          return prev.map((p) => (p.uid === remoteUid ? { ...p, hasStream: true } : p));
        }
        const user = usersRef.current.find((u) => u._id === remoteUid);
        return [
          ...prev,
          {
            uid: remoteUid,
            name: user?.displayName || 'Participant',
            videoRef: participantVideoRefsRef.current[remoteUid],
            hasStream: true
          }
        ];
      });
    }
    
    remoteStreamRef.current = isGroupCall ? getCombinedRemoteStream() : remoteStream;
    setRemoteMediaEpoch((n) => n + 1);
    markCallConnected();
  };

  const setupPeer = async ({ callId, remoteUid, callType, isCaller, remoteOffer = null, skipRoomCreation = false }) => {
    // Prevent duplicate peer connections for same remoteUid
    if (peerConnectionsRef.current.has(remoteUid)) {
      console.warn('[Call] Peer connection already exists for', remoteUid);
      return;
    }

    const calls = await getCallRuntime();
    const uid = await calls.waitForAuthReady();
    setCallState((current) => ({ ...current, preparing: true }));

    try {
      if (isCaller && !skipRoomCreation) {
        await calls.createCallRoom({ callId, from: uid, to: remoteUid, callType });
      } else if (!isCaller) {
        await calls.verifyCallAccess(callId, uid);
      }

      const [stream, pc] = await Promise.all([
        getCallMediaStream(callType),
        calls.createPeerConnection(
          (remoteStream) => handleRemoteStream(remoteUid, remoteStream),
          (candidate) => {
            calls.pushIceCandidate(callId, uid, candidate).catch((error) => {
              console.error('[Call] ICE write failed:', error.message);
            });
          }
        )
      ]);

      attachLocalStream(stream, callType);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      peerConnectionsRef.current.set(remoteUid, pc);
      if (!peerConnectionRef.current) peerConnectionRef.current = pc;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          markCallConnected();
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          console.warn('[Call] Peer connection state:', pc.connectionState);
        }
      };

      const remoteCandidates = calls.subscribeIceCandidates(callId, remoteUid, (candidate) => {
        const connection = peerConnectionsRef.current.get(remoteUid);
        if (!candidate || !connection) return;
        connection.addRemoteIceCandidate(candidate).catch(console.error);
      });
      callUnsubscribersRef.current.push(remoteCandidates);

      const roomListener = calls.subscribeCallRoom(callId, async (room) => {
        if (!room) return;
        const connection = peerConnectionsRef.current.get(remoteUid);
        const remoteAnswer = room.answers?.[remoteUid] || room.answer;
        if (isCaller && connection && remoteAnswer && !connection.currentRemoteDescription) {
          await connection.setRemoteDescription(new RTCSessionDescription(remoteAnswer));
          await connection.flushRemoteIceCandidates();
        }
        if (!isCaller && connection && room.status === 'ended') {
          endCall();
          return;
        }
        if (isCaller && connection && room.status === 'ended') {
          endCall();
          return;
        }
        if (room.status) {
          setCallState((current) => (current ? { ...current, status: room.status } : current));
        }
      });
      callUnsubscribersRef.current.push(roomListener);

      if (isCaller) {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video'
        });
        await pc.setLocalDescription(offer);
        // Publish offer and ring in parallel for faster connection
        await Promise.all([
          calls.publishCallOffer(callId, offer, remoteUid),
          calls.ringCallee({ callId, from: uid, to: remoteUid, callType, offer })
        ]);
      } else if (remoteOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
        await pc.flushRemoteIceCandidates();
        const answer = await pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video'
        });
        await pc.setLocalDescription(answer);
        await calls.sendCallAnswer(callId, uid, answer, uid);
      }
    } finally {
      setCallState((current) => {
        if (!current) return null;
        if (!isCaller) {
          return { ...current, preparing: false, incoming: false };
        }
        return { ...current, preparing: false };
      });
    }
  };

  useEffect(() => {
    if (!callState?.active) return;
    attachRemoteMedia();
    // Retry to handle Suspense lazy-mount race: CallModal's video refs
    // may not exist in the DOM yet when ontrack fires.
    const retryTimers = [
      setTimeout(() => attachRemoteMedia(), 50),
      setTimeout(() => attachRemoteMedia(), 200),
      setTimeout(() => attachRemoteMedia(), 500),
    ];
    return () => retryTimers.forEach(clearTimeout);
  }, [remoteMediaEpoch, callState?.active, callState?.incoming, callState?.preparing, callState?.callType]);

  useEffect(() => {
    if (!callState?.active || !callState?.connectedAt) {
      setCallTimer(0);
      return undefined;
    }
    const updateTimer = () => {
      setCallTimer(Math.max(0, Math.floor((Date.now() - callState.connectedAt) / 1000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [callState?.active, callState?.connectedAt]);

  // Re-attach local stream when CallModal mounts (survives Suspense/rerender)
  useEffect(() => {
    if (!callState?.active) return;
    const stream = localStreamRef.current;
    const video = localVideoRef.current;
    if (stream && video && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [callState?.active, callState?.callType]);

  useEffect(() => {
    if (callState?.active && callState?.incoming) {
      playIncomingRing();
    } else {
      stopIncomingRing();
    }
    return () => stopIncomingRing();
  }, [callState?.active, callState?.incoming, callState?.callId]);

  const startCall = async (callType) => {
    const isGroupCall = selectedChat?.type === 'group';
    if (!selectedPeer && !isGroupCall) return;
    if (callState?.active) return;

    const calls = await getCallRuntime();
    const uid = await calls.waitForAuthReady();

    const targetIds = isGroupCall
      ? (selectedChat?.participantIds || []).filter((id) => id !== uid)
      : [selectedPeer._id];

    if (!targetIds.length) {
      toastError('No group members are available for this call.');
      return;
    }

    if (!isGroupCall && !canContactUser(blockStateRef.current, selectedPeer._id)) {
      toastError('You cannot call this user.');
      return;
    }
    const callId = isGroupCall
      ? `group_call_${selectedChat._id}_${Date.now()}`
      : `call_${[uid, selectedPeer._id].sort().join('_')}_${Date.now()}`;
    const activeChatId = selectedChat?._id || findDirectChatByPeerId(selectedPeer._id)?._id;

    setActiveCallId(callId);
    setCallMinimized(false);
    
    // Initialize remote participants for group calls
    if (isGroupCall) {
      participantVideoRefsRef.current = {};
      targetIds.forEach((targetId) => {
        participantVideoRefsRef.current[targetId] = { current: null };
      });
      const participants = targetIds.map((targetId) => {
        const user = usersRef.current.find((u) => u._id === targetId);
        return {
          uid: targetId,
          name: user?.displayName || 'Participant',
          videoRef: participantVideoRefsRef.current[targetId],
          hasStream: false
        };
      });
      setRemoteParticipants(participants);
    } else {
      setRemoteParticipants([]);
    }
    
    setCallState({
      active: true,
      incoming: false,
      callId,
      chatId: activeChatId,
      callType,
      caller: isGroupCall ? { _id: uid, displayName: 'You' } : selectedPeer,
      from: uid,
      to: isGroupCall ? targetIds : selectedPeer._id,
      status: 'ringing',
      muted: false,
      cameraOff: callType === 'voice',
      speakerOn: true,
      startedAt: Date.now(),
      participants: isGroupCall ? targetIds : [selectedPeer._id],
      minimized: false
    });

    try {
      await calls.createCallRoom({
        callId,
        from: uid,
        to: targetIds,
        callType,
        participantIds: targetIds
      });

      await Promise.allSettled(
        targetIds.map((remoteUid) => 
          setupPeer({ callId, remoteUid, callType, isCaller: true, skipRoomCreation: true })
        )
      );
    } catch (error) {
      console.error(error);
      toastError(error.message || 'Could not start call. Check microphone/camera permissions.');
      endCall();
    }
  };

  const answerCall = async () => {
    if (!callState?.callId) return;
    if (isAnsweringRef.current) return;
    isAnsweringRef.current = true;
    stopIncomingRing();
    setCallMinimized(false);
    setCallState((current) => (current ? { ...current, preparing: true, incoming: false } : current));
    try {
      const calls = await getCallRuntime();
      const uid = await calls.waitForAuthReady();

      const isGroupCall = Array.isArray(callState.to) || callState.participants?.length > 1;
      const callers = isGroupCall ? callState.to : [callState.from];

      if (!isGroupCall && callState.to && uid && callState.to !== uid) {
        toastError('This call is for another account. Sign in with the correct user and try again.');
        isAnsweringRef.current = false;
        return;
      }

      if (isGroupCall) {
        await Promise.allSettled(
          callers.map((callerId) =>
            setupPeer({
              callId: callState.callId,
              remoteUid: callerId,
              callType: callState.callType,
              isCaller: false,
              remoteOffer: callState.offer,
              skipRoomCreation: true
            })
          )
        );
      } else {
        await setupPeer({
          callId: callState.callId,
          remoteUid: callState.from,
          callType: callState.callType,
          isCaller: false,
          remoteOffer: callState.offer
        });
      }
      setCallState((current) => (current ? { ...current, startedAt: current.startedAt || Date.now() } : current));
    } catch (error) {
      console.error(error);
      toastError(error.message || 'Could not answer call.');
      endCall();
    } finally {
      isAnsweringRef.current = false;
    }
  };

  const recordCallHistory = async (state) => {
    if (!state) return;
    const chatId = state.chatId || selectedChatRef.current?._id || findDirectChatByPeerId(state.to || state.from)?._id;
    if (!chatId) return;
    const startedAt = state.connectedAt || state.startedAt;
    const duration = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
    const callType = state.callType || 'voice';
    const callStatus = state.incoming && state.status === 'ringing' ? 'missed' : state.status || (duration ? 'completed' : 'missed');
    const label = `${callType === 'video' ? 'Video' : 'Voice'} call ${callStatus}`;

    try {
      await api.sendMessage({
        chatId,
        type: 'call',
        body: label + (duration ? ` • ${Math.floor(duration / 60000)}m ${(Math.floor(duration / 1000) % 60).toString().padStart(2, '0')}s` : ''),
        callType,
        callStatus,
        duration
      });
    } catch (error) {
      console.warn('Could not save call history message:', error?.message || error);
    }
  };

  const endCall = () => {
    stopIncomingRing();
    isAnsweringRef.current = false;
    const state = callStateRef.current;
    if (state) {
      void recordCallHistory(state);
    }
    const endingCallId = activeCallId || state?.callId;
    const from = state?.from || auth?.currentUser?.uid || profile?._id;
    const to = state?.to || selectedPeer?._id;
    
    // Signal end to other party immediately before cleanup
    if (endingCallId) {
      getCallRuntime().then((calls) => calls.endCallRoom(endingCallId, from, to)).catch(console.error);
    }
    
    cleanupCallListeners();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    peerConnectionsRef.current.forEach((pc) => pc?.close());
    peerConnectionsRef.current.clear();
    Object.values(remoteStreamsByUidRef.current).forEach((stream) => stream?.getTracks()?.forEach((track) => track.stop()));
    remoteStreamsByUidRef.current = {};
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    Object.values(participantVideoRefsRef.current).forEach((ref) => {
      if (ref?.current) ref.current.srcObject = null;
    });
    participantVideoRefsRef.current = {};
    setRemoteParticipants([]);
    setActiveCallId(null);
    setCallState(null);
    setCallMinimized(false);
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
          // Only clear if still genuinely ringing (not answered/preparing)
          if (current?.incoming && !current?.preparing) {
            stopIncomingRing();
            setActiveCallId(null);
            setCallState(null);
            setRemoteParticipants([]);
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
        
        const isGroupCall = Array.isArray(incoming.to) || (incoming.participants && Object.keys(incoming.participants || {}).length > 2);
        const incomingChat = isGroupCall
          ? chats.find((chat) => chat.type === 'group' && incoming.id.startsWith(`group_call_${chat._id}`))
          : findDirectChatByPeerId(incoming.from);

        // Initialize remote participants for incoming group calls
        if (isGroupCall) {
          participantVideoRefsRef.current = {};
          const callers = Array.isArray(incoming.to) ? incoming.to : [incoming.from, incoming.to].filter(id => id !== uid);
          callers.forEach((callerId) => {
            participantVideoRefsRef.current[callerId] = { current: null };
          });
          const participants = callers.map((callerId) => {
            const user = usersRef.current.find((u) => u._id === callerId);
            return {
              uid: callerId,
              name: user?.displayName || 'Participant',
              videoRef: participantVideoRefsRef.current[callerId],
              hasStream: false
            };
          });
          setRemoteParticipants(participants);
        } else {
          setRemoteParticipants([]);
        }

        playIncomingRing();
        setActiveCallId(incoming.id);
        setCallMinimized(false);
        setCallState({
          active: true,
          incoming: true,
          callId: incoming.id,
          chatId: incomingChat?._id,
          callType: incoming.callType || 'voice',
          caller: isGroupCall ? { _id: incoming.from, displayName: 'Group call' } : caller,
          from: incoming.from,
          to: incoming.to,
          offer: incoming.offer || null,
          status: incoming.status || 'ringing',
          muted: false,
          cameraOff: (incoming.callType || 'voice') === 'voice',
          speakerOn: true,
          participants: isGroupCall ? (Array.isArray(incoming.to) ? incoming.to : [incoming.from, incoming.to]) : undefined,
          minimized: false
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
              <button
                onClick={() => setRequestsOpen(!requestsOpen)}
                className="relative rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700"
                title="Connection requests"
              >
                <UserPlus size={18} />
                {connectionRequests.incoming.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-black text-white">
                    {connectionRequests.incoming.length}
                  </span>
                )}
              </button>
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
                    onDisconnect={handleDisconnect}
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
      {requestsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRequestsOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-cyan-950">Connection Requests</h3>
              <button onClick={() => setRequestsOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            
            {connectionRequests.incoming.length === 0 && connectionRequests.sent.length === 0 ? (
              <p className="py-8 text-center text-slate-500">No connection requests</p>
            ) : (
              <div className="max-h-96 space-y-4 overflow-y-auto">
                {connectionRequests.incoming.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-bold text-slate-700">Incoming Requests</h4>
                    {connectionRequests.incoming.map((request) => (
                      <div key={request._id} className="flex items-center gap-3 rounded-2xl border border-aqua-100 bg-aqua-50/50 p-3">
                        <Avatar user={request.sender} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-cyan-950">{request.sender?.displayName || 'User'}</p>
                          <p className="truncate text-xs text-slate-500">@{request.sender?.username || 'username'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptRequest(request._id)}
                            className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-600"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectRequest(request._id)}
                            className="rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-600"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {connectionRequests.sent.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-bold text-slate-700">Sent Requests</h4>
                    {connectionRequests.sent.map((request) => (
                      <div key={request._id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <Avatar user={request.receiver} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-700">{request.receiver?.displayName || 'User'}</p>
                          <p className="truncate text-xs text-slate-500">@{request.receiver?.username || 'username'}</p>
                        </div>
                        <span className="text-xs text-slate-400">Pending</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <ProfileSettings firebaseUser={firebaseUser} profile={profile} setProfile={setProfile} onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
      {callState?.active && !callMinimized && (
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
            onMinimize={() => setCallMinimized(true)}
            remoteMediaEpoch={remoteMediaEpoch}
            callTimer={callTimer}
            remoteParticipants={remoteParticipants}
          />
        </Suspense>
      )}
      {callState?.active && callMinimized && (
        <button
          type="button"
          onClick={() => setCallMinimized(false)}
          className="fixed bottom-24 right-4 z-50 flex min-w-[220px] items-center gap-3 rounded-3xl border border-white/80 bg-gradient-to-r from-cyan-500 to-aqua-400 px-4 py-3 text-left text-white shadow-2xl shadow-cyan-500/20 transition hover:scale-[1.01] sm:bottom-6 sm:right-6"
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 text-white">
            {callState.callType === 'video' ? '📹' : '📞'}
          </span>
          <div className="min-w-0">
            <p className="truncate font-black">{callState.caller?.displayName || 'Active call'}</p>
            <p className="truncate text-xs opacity-90">
              {callState.incoming ? 'Incoming call' : callState.status === 'ringing' ? 'Ringing…' : 'On call'}
            </p>
          </div>
        </button>
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
