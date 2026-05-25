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
import { registerBackgroundSync, requestNotificationPermission, registerMessagingToken, showSystemNotification, onForegroundMessage, startSwKeepalive } from './pwa.js';
import { usePwaInstall } from './hooks/usePwaInstall.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import { getCallRuntime } from './utils/callRuntime.js';
import { getCallMediaStream } from './utils/media.js';
import { scheduleIdle } from './utils/scheduleIdle.js';
import { auth } from './firebase.js';
import { useBackgroundResume } from './hooks/useBackgroundResume.js';
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
const ChatActionBottomSheet = lazy(() => import('./features/chat/ChatActionBottomSheet.jsx'));
const GroupInfo = lazy(() => import('./features/chat/GroupInfo.jsx'));
const UserInfoPanel = lazy(() => import('./features/chat/UserInfoPanel.jsx'));

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

  useEffect(() => {
    const lockScreenOrientation = async () => {
      try {
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
          await screen.orientation.lock('portrait');
          console.log('[Screen Orientation] Locked to portrait at App root');
        }
      } catch (err) {
        console.warn('[Screen Orientation] Lock failed or not supported at App root:', err.message);
      }
    };

    lockScreenOrientation();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        lockScreenOrientation();
      }
    };

    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        lockScreenOrientation();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('orientationchange', lockScreenOrientation);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('orientationchange', lockScreenOrientation);
    };
  }, []);

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
      <div className="orientation-lock-overlay select-none">
        <div className="flex flex-col items-center gap-6">
          <div className="relative rounded-3xl bg-cyan-500/10 p-6 ring-1 ring-cyan-500/20">
            <svg 
              className="h-16 w-16 text-cyan-400 animate-safe-rotate" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={1.5}
            >
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01" />
            </svg>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-white">Portrait Mode Only</h3>
            <p className="text-sm font-medium text-cyan-200/70 max-w-xs leading-relaxed">
              Please rotate your device back to portrait orientation. AquaChat is optimized for portrait view.
            </p>
          </div>
        </div>
      </div>
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
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [userInfoOpen, setUserInfoOpen] = useState(false);
  const [activeMenuChat, setActiveMenuChat] = useState(null);
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
  const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState(null);
  const [notifPermission, setNotifPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));

  const longPressTimersRef = useRef({});

  const handleDeleteGroup = (chatId) => {
    setDeleteConfirmGroupId(chatId);
  };

  const handleChatTouchStart = (chat) => {
    if (longPressTimersRef.current[chat._id]) {
      clearTimeout(longPressTimersRef.current[chat._id]);
    }

    longPressTimersRef.current[chat._id] = setTimeout(() => {
      setActiveMenuChat(chat);
      delete longPressTimersRef.current[chat._id];
    }, 700);
  };

  // Screen orientation lock is handled at the App root level for PWA stability

  const handleChatTouchEnd = (chat) => {
    if (longPressTimersRef.current[chat._id]) {
      clearTimeout(longPressTimersRef.current[chat._id]);
      delete longPressTimersRef.current[chat._id];
    }
  };

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
  const audioContextRef = useRef(null);
  const hasAutoSelectedChatRef = useRef(false);

  const activeChat = useMemo(() => {
    if (!selectedChat) return null;
    return chats.find((c) => c._id === selectedChat._id) || selectedChat;
  }, [chats, selectedChat]);

  const selectedChatRef = useRef(activeChat);
  const activeMessagesChatRef = useRef(null);
  const seenTimerRef = useRef(null);
  const callStateRef = useRef(callState);
  const chatsRef = useRef(chats);
  const usersRef = useRef(users);
  const blockStateRef = useRef(blockState);
  const prevChatsRef = useRef([]);
  const initialNotificationHandledRef = useRef(false);
  chatsRef.current = chats;
  selectedChatRef.current = activeChat;
  callStateRef.current = callState;
  usersRef.current = users;
  blockStateRef.current = blockState;

  const findDirectChatByPeerId = (peerId) =>
    chatsRef.current.find((chat) => chat.type === 'direct' && chat.participantIds?.includes(peerId) && chat.participantIds.includes(profile?._id));

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

  useEffect(() => {
    if (selectedChat) {
      const exists = chats.some((c) => c._id === selectedChat._id);
      if (!exists) {
        setSelectedChat(null);
      }
    }
  }, [chats, selectedChat]);

  const refreshStatuses = async () => {
    const { statuses: next } = await api.statuses();
    setStatuses(next);
  };

  useEffect(() => {
    const unsubscribe = api.subscribeStatuses(setStatuses);
    return () => unsubscribe?.();
  }, []);

  // Eagerly pre-load call module and prefetch ICE servers to eliminate cold-start delay
  useEffect(() => {
    getCallRuntime().then((calls) => {
      calls.prefetchIceServers?.();
    }).catch(() => {});
  }, []);

  const refresh = async () => {
    if (panel === 'people' || query.trim()) {
      await loadUsers(query);
    }
    await refreshStatuses();
  };

  useEffect(() => {
    if (!firebaseUser?.uid) return undefined;
    if (notifPermission !== 'granted') return undefined;

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
  }, [firebaseUser?.uid, notifPermission]);

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

  const enterPiP = async () => {
    try {
      const video = remoteVideoRef.current;
      if (document.pictureInPictureEnabled && video && video.readyState >= 1) {
        if (document.pictureInPictureElement !== video) {
          await video.requestPictureInPicture();
          console.log('[PiP] Entered Picture-in-Picture');
        }
      }
    } catch (err) {
      console.warn('[PiP] requestPictureInPicture failed:', err.message);
    }
  };

  const exitPiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        console.log('[PiP] Exited Picture-in-Picture');
      }
    } catch (err) {
      console.warn('[PiP] exitPictureInPicture failed:', err.message);
    }
  };

  // Manage Picture-in-Picture based on call minimization state
  useEffect(() => {
    if (callState?.active && callState?.callType === 'video') {
      if (callMinimized) {
        const timer = setTimeout(() => {
          enterPiP();
        }, 300);
        return () => clearTimeout(timer);
      } else {
        exitPiP();
      }
    } else {
      exitPiP();
    }
    return undefined;
  }, [callMinimized, callState?.active, callState?.callType]);

  // Automatically enter Picture-in-Picture when app goes to background
  useEffect(() => {
    const handleVisibilityForPiP = () => {
      if (callState?.active && callState?.callType === 'video') {
        if (document.visibilityState === 'hidden') {
          enterPiP();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityForPiP);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityForPiP);
    };
  }, [callState?.active, callState?.callType]);

  // Restore call screen when user clicks "Back to tab" in PiP window
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return undefined;

    const handleLeavePiP = () => {
      console.log('[PiP] leavepictureinpicture event fired, restoring call screen');
      setCallMinimized(false);
    };

    video.addEventListener('leavepictureinpicture', handleLeavePiP);
    return () => {
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [remoteVideoRef.current, callState?.active]);

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
    // Always keep prevChatsRef in sync so it doesn't go stale when the tab is visible
    const prevChats = prevChatsRef.current;
    prevChatsRef.current = chats;

    if (notifPermission !== 'granted') return undefined;
    if (document.visibilityState === 'visible') return undefined;

    const latestChat = chats.find((chat) => {
      const previous = prevChats.find((item) => item._id === chat._id);
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

    return undefined;
  }, [chats, profile._id, notifPermission]);

  useEffect(() => {
    if (!callState?.active || !callState?.incoming) return undefined;
    if (notifPermission !== 'granted') return undefined;
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
      const title = notification.title || data.senderName || data.title || 'AquaChat';
      const body = notification.body || data.messagePreview || data.body || 'You have a new message.';
      const isCall = data.type === 'call' || data.callType;
      const messageChatId = data.chatId || '';

      // Skip notification if the user is actively viewing this chat
      if (document.visibilityState === 'visible' && messageChatId && selectedChatRef.current?._id === messageChatId && !isCall) {
        return;
      }

      if (isCall) {
        playIncomingRing();
      }
      
      showSystemNotification({
        title,
        body,
        icon: notification.icon || data.icon || '/icon-192.png',
        tag: data.tag || `aquachat-${data.chatId || 'general'}`,
        url: data.url || (data.chatId ? `/?chat=${data.chatId}` : '/'),
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
    if (!profile?._id || !chats || chats.length === 0) return;
    const uid = profile._id;
    chats.forEach((chat) => {
      const lastMsg = chat.lastMessage;
      if (
        lastMsg &&
        lastMsg.senderId !== uid &&
        !lastMsg.deletedForEveryone &&
        lastMsg.status !== 'failed'
      ) {
        const delivered = lastMsg.deliveredTo || [];
        // Mark delivered independently of seenBy — delivery != seen
        if (!delivered.includes(uid)) {
          api.markMessageDelivered(chat._id, lastMsg._id).catch(console.error);
        }
      }
    });
  }, [chats, profile?._id]);

  // Sync current user's profile updates into all active chats in memory and selectedChat
  useEffect(() => {
    if (!profile?._id) return;
    setChats((currentChats) => {
      let changed = false;
      const nextChats = currentChats.map((chat) => {
        const nextParticipants = chat.participants.map((part) => {
          if (part.user._id === profile._id) {
            if (
              part.user.displayName !== profile.displayName ||
              part.user.photoURL !== profile.photoURL ||
              part.user.username !== profile.username ||
              part.user.bio !== profile.bio
            ) {
              changed = true;
              return {
                ...part,
                user: {
                  ...part.user,
                  displayName: profile.displayName,
                  photoURL: profile.photoURL,
                  username: profile.username,
                  bio: profile.bio
                }
              };
            }
          }
          return part;
        });
        return changed ? { ...chat, participants: nextParticipants } : chat;
      });
      return changed ? nextChats : currentChats;
    });

    setSelectedChat((currentSelected) => {
      if (!currentSelected) return null;
      let changed = false;
      const nextParticipants = currentSelected.participants.map((part) => {
        if (part.user._id === profile._id) {
          if (
            part.user.displayName !== profile.displayName ||
            part.user.photoURL !== profile.photoURL ||
            part.user.username !== profile.username ||
            part.user.bio !== profile.bio
          ) {
            changed = true;
            return {
              ...part,
              user: {
                ...part.user,
                displayName: profile.displayName,
                photoURL: profile.photoURL,
                username: profile.username,
                bio: profile.bio
              }
            };
          }
        }
        return part;
      });
      return changed ? { ...currentSelected, participants: nextParticipants } : currentSelected;
    });
  }, [profile]);

  // Subscribe to the selected peer's profile changes in real-time
  useEffect(() => {
    if (!selectedPeer?._id) return;

    console.log('[Realtime Sync] Subscribing to selectedPeer:', selectedPeer._id);
    const unsubscribe = api.subscribeUser(selectedPeer._id, (updatedUser) => {
      if (!updatedUser) return;

      console.log('[Realtime Sync] selectedPeer updated:', updatedUser._id, updatedUser.displayName);

      // Update the user cache instantly
      primeUserCache(updatedUser);

      // Update their entry in the active chats list
      setChats((currentChats) => {
        let changed = false;
        const nextChats = currentChats.map((chat) => {
          const nextParticipants = chat.participants.map((part) => {
            if (part.user._id === updatedUser._id) {
              if (
                part.user.displayName !== updatedUser.displayName ||
                part.user.photoURL !== updatedUser.photoURL ||
                part.user.username !== updatedUser.username ||
                part.user.bio !== updatedUser.bio ||
                part.user.isOnline !== updatedUser.isOnline ||
                part.user.online !== updatedUser.online ||
                part.user.lastSeen !== updatedUser.lastSeen
              ) {
                changed = true;
                return {
                  ...part,
                  user: {
                    ...part.user,
                    ...updatedUser
                  }
                };
              }
            }
            return part;
          });
          return changed ? { ...chat, participants: nextParticipants } : chat;
        });
        return changed ? nextChats : currentChats;
      });

      // Update selectedChat state itself to trigger immediate re-renders in chat/user header/panels
      setSelectedChat((currentSelected) => {
        if (!currentSelected) return null;
        let changed = false;
        const nextParticipants = currentSelected.participants.map((part) => {
          if (part.user._id === updatedUser._id) {
            if (
              part.user.displayName !== updatedUser.displayName ||
              part.user.photoURL !== updatedUser.photoURL ||
              part.user.username !== updatedUser.username ||
              part.user.bio !== updatedUser.bio ||
              part.user.isOnline !== updatedUser.isOnline ||
              part.user.online !== updatedUser.online ||
              part.user.lastSeen !== updatedUser.lastSeen
            ) {
              changed = true;
              return {
                ...part,
                user: {
                  ...part.user,
                  ...updatedUser
                }
              };
            }
          }
          return part;
        });
        return changed ? { ...currentSelected, participants: nextParticipants } : currentSelected;
      });
    });

    return () => {
      console.log('[Realtime Sync] Unsubscribing from selectedPeer:', selectedPeer._id);
      unsubscribe();
    };
  }, [selectedPeer?._id]);

  const unlockRemoteAudio = () => {
    const audio = remoteAudioRef.current;
    if (audio) {
      const originalSrc = audio.src;
      const originalSrcObject = audio.srcObject;
      if (originalSrcObject || originalSrc) return;
      audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA';
      audio.play()
        .then(() => {
          audio.pause();
          audio.src = '';
          audio.srcObject = null;
          console.log('[WebRTC] Remote audio element unlocked successfully');
        })
        .catch((err) => {
          console.warn('[WebRTC] Remote audio element unlock failed:', err.message);
        });
    }
  };

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    const unlockAudio = () => {
      unlockCallAudio();
      unlockRemoteAudio();
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          if (!audioContextRef.current) {
            audioContextRef.current = new AudioCtx();
          }
          if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[WebRTC] User gesture AudioContext unlock failed:', e.message);
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    registerBackgroundSync().catch(() => {});
    startSwKeepalive();
    unlockCallAudio();
    unlockRemoteAudio();
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Background resume: force RTDB reconnect + touch presence when app wakes from background.
  // Firestore persistence handles its own reconnection via IndexedDB cache.
  useBackgroundResume(() => {
    // Touch presence to re-mark user as online
    if (profile?._id) {
      import('./services/presence.js').then(({ touchPresence }) => {
        touchPresence(profile._id).catch(() => {});
      });
    }
  });

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
    setGroupInfoOpen(false);
    setUserInfoOpen(false);
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
      seenTimerRef.current = setTimeout(() => {
        api.deliver(chatId).catch(console.error);
        api.seen(chatId).catch(console.error);
      }, 600);
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
    const currentUidStr = String(profile?._id || firebaseUser?.uid || '').trim();
    const targetPeerId = String(userId || '').trim();
    console.log('[Disconnect Attempt] Target Peer ID:', targetPeerId, '| Current UID:', currentUidStr);
    try {
      await api.disconnectUser(targetPeerId);
      patchProfileConnections(targetPeerId, false);
      updateUser(targetPeerId, { connectionStatus: 'none' });
      toastSuccess('Disconnected');
    } catch (err) {
      console.error('[Disconnect Error] Target Peer ID:', targetPeerId, '| Current UID:', currentUidStr, '| Error:', err);
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
      setNotifPermission(permission);
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
    const clientCreatedAt = Date.now();
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
      createdAt: new Date(clientCreatedAt).toISOString(),
      clientCreatedAt
    };

    // Optimistically update both messages and chat list in one tick
    setSendEpoch((epoch) => epoch + 1);
    setMessages((current) => [...current, optimistic]);
    setChats((current) =>
      current.map((chat) =>
        chat._id === chatId
          ? { ...chat, lastMessage: { ...optimistic, body: optimistic.body || optimistic.type }, updatedAt: optimistic.createdAt }
          : chat
      )
    );
    // Non-blocking typing clear
    setFirebaseTyping(chatId, false).catch(() => {});

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
      // Mark message as failed instead of removing — allows visual retry
      setMessages((current) =>
        current.map((item) =>
          item._id === tempId ? { ...item, pending: false, status: 'failed' } : item
        )
      );
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

  const toggleCallSpeaker = (explicitSpeakerOn, explicitMuted) => {
    setCallState((current) => {
      if (!current) return current;
      const speakerOn = typeof explicitSpeakerOn === 'boolean' ? explicitSpeakerOn : !current.speakerOn;
      const speakerMuted = typeof explicitMuted === 'boolean' ? explicitMuted : false;
      const audio = remoteAudioRef.current;
      const video = remoteVideoRef.current;
      if (audio) audio.muted = speakerMuted;
      if (video) video.muted = true; // Keep remote video element always muted
      return { ...current, speakerOn, speakerMuted };
    });
  };

  const attachRemoteMedia = () => {
    const stream = remoteStreamRef.current;
    if (!stream) {
      console.log('[WebRTC] attachRemoteMedia: no remote stream yet');
      return;
    }
    const video = remoteVideoRef.current;
    const audio = remoteAudioRef.current;
    const isVideo = callStateRef.current?.callType === 'video';
    const speakerOn = callStateRef.current?.speakerOn !== false;

    console.log('[WebRTC] attachRemoteMedia: stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', '), '| videoRef:', !!video, '| audioRef:', !!audio);

    // If refs are not yet available (Suspense lazy-mount), retry on next frame (capped to prevent infinite loops)
    if (!video && !audio) {
      if (!attachRemoteMedia._rAFCount) attachRemoteMedia._rAFCount = 0;
      if (attachRemoteMedia._rAFCount < 5) {
        attachRemoteMedia._rAFCount++;
        console.log('[WebRTC] attachRemoteMedia: refs not ready, scheduling rAF retry', attachRemoteMedia._rAFCount);
        requestAnimationFrame(() => attachRemoteMedia());
      }
      return;
    }
    attachRemoteMedia._rAFCount = 0;

    const isGroupCall = callStateRef.current?.participants?.length > 1;

    // Resume AudioContext captured during user gesture to unlock mobile audio
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    const needsSrcObjectUpdate = (el, newStream) => {
      if (!el.srcObject || el.srcObject !== newStream) return true;
      const elTrackIds = el.srcObject.getTracks().map(t => t.id).sort().join(',');
      const newTrackIds = newStream.getTracks().map(t => t.id).sort().join(',');
      return elTrackIds !== newTrackIds;
    };

    if (video) {
      if (needsSrcObjectUpdate(video, stream)) {
        video.removeAttribute('src');
        video.srcObject = stream;
      }
      video.muted = true; // Always muted to bypass mobile autoplay blocks
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      const playVideo = () => video.play().catch((e) => console.warn('[WebRTC] remote video play() failed:', e.message));
      playVideo();
      // Mobile retry: some browsers need a tick after srcObject assignment
      setTimeout(playVideo, 100);
    }
    if (audio) {
      if (needsSrcObjectUpdate(audio, stream)) {
        audio.removeAttribute('src');
        audio.srcObject = stream;
      }
      audio.muted = callStateRef.current?.speakerMuted === true; // Sound played strictly through root-level audio element
      const playAudio = () => {
        audio.play().catch((e) => {
          console.warn('[WebRTC] remote audio play() failed, retrying:', e.message);
          // Fallback: use AudioContext to pump audio on mobile
          if (audioContextRef.current && stream.getAudioTracks().length) {
            try {
              const ctx = audioContextRef.current;
              if (ctx.state === 'suspended') ctx.resume();
              const source = ctx.createMediaStreamSource(stream);
              source.connect(ctx.destination);
              console.log('[WebRTC] Audio routed via AudioContext fallback');
            } catch (ctxErr) {
              console.warn('[WebRTC] AudioContext fallback also failed:', ctxErr.message);
            }
          }
        });
      };
      playAudio();
      // Mobile retry: some browsers need a tick after srcObject assignment
      setTimeout(playAudio, 100);
      setTimeout(playAudio, 500);
    }
    
    // Attach streams to participant video refs for group calls
    if (isGroupCall) {
      Object.entries(remoteStreamsByUidRef.current).forEach(([uid, participantStream]) => {
        const participantVideoRef = participantVideoRefsRef.current[uid];
        if (participantVideoRef?.current) {
          const pEl = participantVideoRef.current;
          if (needsSrcObjectUpdate(pEl, participantStream)) {
            pEl.removeAttribute('src');
            pEl.srcObject = participantStream;
          }
          pEl.muted = true;
          pEl.setAttribute('playsinline', 'true');
          pEl.setAttribute('webkit-playsinline', 'true');
          pEl.play().catch(() => {});
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
    const uid = auth?.currentUser?.uid || await calls.waitForAuthReady();
    setCallState((current) => ({ ...current, preparing: true }));

    try {
      if (isCaller && !skipRoomCreation) {
        await calls.createCallRoom({ callId, from: uid, to: remoteUid, callType });
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

      // Helper: callee performs SDP negotiation once offer is available
      const negotiateCallee = async (connection, offerSdp) => {
        if (!offerSdp || !connection) return;
        // Avoid duplicate concurrent negotiations
        if (connection.isNegotiating || connection.currentRemoteDescription) {
          console.log('[WebRTC] Callee negotiation skipped: already negotiating or remote description exists');
          return;
        }
        connection.isNegotiating = true;
        try {
          console.log('[WebRTC] Callee negotiating SDP with offer');
          await connection.setRemoteDescription(new RTCSessionDescription(offerSdp));
          await connection.flushRemoteIceCandidates();
          const answer = await connection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === 'video'
          });
          // Set local description and send answer in parallel for faster connection
          await Promise.all([
            connection.setLocalDescription(answer),
            calls.sendCallAnswer(callId, uid, answer, uid)
          ]);
        } catch (err) {
          console.error('[WebRTC] Callee negotiation failed:', err.message);
          throw err;
        } finally {
          connection.isNegotiating = false;
        }
      };

      // Single consolidated room listener — handles SDP negotiation + admin sync
      let lastSeenAnswerSdp = null;
      const roomListener = calls.subscribeCallRoom(callId, async (room) => {
        if (!room) {
          console.log('[Call] Room deleted in roomListener, ending call');
          endCall();
          return;
        }
        const connection = peerConnectionsRef.current.get(remoteUid);
        const myUid = auth?.currentUser?.uid || profile?._id;

        // --- Admin sync (merged from standalone useEffect) ---
        if (room.participantsState?.[myUid]?.removed) {
          console.warn('[Call] Removed from call by admin.');
          endCall();
          return;
        }
        setCallState((current) => {
          if (!current) return null;
          const needsUpdate = current.creator !== room.from ||
            current.participantsState !== (room.participantsState || {});
          if (!needsUpdate && current.status === room.status) return current;
          return {
            ...current,
            creator: room.from,
            participantsState: room.participantsState || {},
            ...(room.status ? { status: room.status } : {})
          };
        });

        // --- Caller: set remote description from answer ---
        const remoteAnswer = room.answers?.[remoteUid] || room.answer;
        const answerSdp = remoteAnswer?.sdp || null;
        if (isCaller && connection && remoteAnswer && answerSdp !== lastSeenAnswerSdp
            && !connection.currentRemoteDescription && !connection.isSettingRemoteDescription) {
          // Guard: only valid in have-local-offer state
          if (connection.signalingState !== 'have-local-offer') {
            console.log('[WebRTC] Caller skipping setRemoteDescription: signalingState is', connection.signalingState);
          } else {
            lastSeenAnswerSdp = answerSdp;
            connection.isSettingRemoteDescription = true;
            try {
              await connection.setRemoteDescription(new RTCSessionDescription(remoteAnswer));
              await connection.flushRemoteIceCandidates();
            } catch (err) {
              console.error('[WebRTC] Caller setRemoteDescription failed:', err.message);
            } finally {
              connection.isSettingRemoteDescription = false;
            }
          }
        }
        // --- Callee: handle late-arriving offer (mobile-to-mobile race condition) ---
        if (!isCaller && connection && !connection.currentRemoteDescription && !connection.isNegotiating) {
          if (connection.signalingState !== 'stable') {
            console.log('[WebRTC] Callee skipping late offer: signalingState is', connection.signalingState);
          } else {
            const lateOffer = room.offers?.[uid] || room.offer;
            if (lateOffer) {
              console.log('[WebRTC] Callee received late offer via room listener');
              try {
                await negotiateCallee(connection, lateOffer);
              } catch (err) {
                console.error('[WebRTC] Late offer negotiation failed:', err.message);
              }
            }
          }
        }
        if (connection && room.status === 'ended') {
          endCall();
          return;
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
        // Offer available immediately — negotiate now
        await negotiateCallee(pc, remoteOffer);
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
      setTimeout(() => attachRemoteMedia(), 100),
      setTimeout(() => attachRemoteMedia(), 500),
    ];
    return () => retryTimers.forEach(clearTimeout);
  }, [remoteMediaEpoch, callState?.active]);

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
  }, [callState?.active, callState?.callType, callMinimized]);

  useEffect(() => {
    if (callState?.active && callState?.incoming) {
      playIncomingRing();
    } else {
      stopIncomingRing();
    }
    return () => stopIncomingRing();
  }, [callState?.active, callState?.incoming, callState?.callId]);

  const startCall = async (callType) => {
    unlockRemoteAudio();
    // Capture AudioContext within user gesture for reliable mobile audio playback
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[WebRTC] AudioContext creation/resume failed:', e.message);
    }
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
    unlockRemoteAudio();
    isAnsweringRef.current = true;
    stopIncomingRing();
    setCallMinimized(false);
    // Capture AudioContext within user gesture for reliable mobile audio playback.
    // This context stays "running" and can pump audio even after the gesture expires.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[WebRTC] AudioContext creation/resume failed:', e.message);
    }
    // Pre-unlock audio playback within user gesture context to satisfy autoplay policy
    const audioEl = remoteAudioRef.current;
    if (audioEl) {
      audioEl.muted = false;
      // Play a tiny silent sound to unlock the element, but don't pause — keep it "playing"
      if (!audioEl.srcObject) {
        audioEl.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA';
      }
      audioEl.play().catch(() => {});
    }
    const videoEl = remoteVideoRef.current;
    if (videoEl) {
      videoEl.play().catch(() => {});
    }
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
    // Close AudioContext used for mobile audio unlock
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Handle notification message clicks dynamically while keeping existing state/call alive
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const handleSWMessage = (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const { chatId, callId, action } = event.data;
        if (chatId) {
          const chat = chatsRef.current.find((item) => item._id === chatId);
          if (chat) {
            setSelectedChat(chat);
            setPanel('chats');
          }
        }
        if (action === 'accept') {
          answerCall();
        } else if (action === 'reject') {
          endCall();
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
    };
  }, [answerCall, endCall]);

  // Handle incoming call action from URL query params when app is loaded fresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action === 'accept' && callState?.incoming && callState?.active) {
      answerCall();
      const url = new URL(window.location);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url);
    } else if (action === 'reject' && callState?.incoming && callState?.active) {
      endCall();
      const url = new URL(window.location);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url);
    }
  }, [callState?.incoming, callState?.active, answerCall, endCall]);

  const handleAdminControl = async (targetUid, actionType) => {
    if (!callState?.callId) return;
    try {
      const calls = await getCallRuntime();
      if (actionType === 'mute') {
        const isCurrentlyMuted = callState.participantsState?.[targetUid]?.muted;
        await calls.updateParticipantCallState(callState.callId, targetUid, {
          muted: !isCurrentlyMuted
        });
        toastSuccess(!isCurrentlyMuted ? 'Participant muted' : 'Participant unmuted');
      } else if (actionType === 'remove') {
        await calls.updateParticipantCallState(callState.callId, targetUid, {
          removed: true
        });
        toastSuccess('Participant removed from call');
      }
    } catch (error) {
      toastError(error.message || 'Action failed.');
    }
  };

  // Admin sync is now merged into setupPeer's roomListener to avoid duplicate Firebase subscriptions

  // Dynamically apply admin mute states to WebRTC tracks on the receiving side
  useEffect(() => {
    if (!callState?.active || !callState?.participantsState) return;
    
    Object.entries(callState.participantsState).forEach(([uid, state]) => {
      const stream = remoteStreamsByUidRef.current[uid];
      if (stream) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !state.muted;
        });
      }
    });
  }, [callState?.participantsState, callState?.active]);

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
          ? chatsRef.current.find((chat) => chat.type === 'group' && incoming.id.startsWith(`group_call_${chat._id}`))
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
    <>
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
                    onMouseDown={() => handleChatTouchStart(chat)}
                    onMouseUp={() => handleChatTouchEnd(chat)}
                    onMouseLeave={() => handleChatTouchEnd(chat)}
                    onTouchStart={() => handleChatTouchStart(chat)}
                    onTouchEnd={() => handleChatTouchEnd(chat)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveMenuChat(chat);
                    }}
                    className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left transition duration-200 group ${activeChat?._id === chat._id ? 'bg-gradient-to-r from-cyan-500/20 to-aqua-300/20 border border-cyan-200/50' : 'hover:bg-aqua-50/60 border border-transparent'}`}
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
        <section className={`${activeChat || !isMobile ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
          {activeChat ? (
            <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
              <div className="flex flex-1 flex-col min-h-0 min-w-0">
                <Suspense fallback={<div className="min-h-0 flex-1 animate-pulse bg-aqua-50/30" />}>
                  <ChatPanel
                    chat={activeChat}
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
                    onDeleteGroup={() => handleDeleteGroup(activeChat._id)}
                    onOpenGroupInfo={() => setGroupInfoOpen(true)}
                    onOpenUserInfo={() => setUserInfoOpen(true)}
                  />
                </Suspense>
                {activeChat.type === 'group' && <GroupStrip chat={activeChat} me={profile} users={users} onRefresh={refresh} />}
              </div>
              {groupInfoOpen && activeChat.type === 'group' && (
                <Suspense fallback={null}>
                  <GroupInfo
                    chat={activeChat}
                    me={profile}
                    users={users}
                    onClose={() => setGroupInfoOpen(false)}
                    onUpdateGroup={async (fields) => {
                      const res = await api.updateGroup(activeChat._id, fields);
                      setChats((current) => current.map((c) => (c._id === activeChat._id ? res.chat : c)));
                    }}
                    onAddMembers={async (memberIds) => {
                      const res = await api.addMembers(activeChat._id, memberIds);
                      setChats((current) => current.map((c) => (c._id === activeChat._id ? res.chat : c)));
                    }}
                    onRemoveMember={async (memberId) => {
                      const res = await api.removeMember(activeChat._id, memberId);
                      setChats((current) => current.map((c) => (c._id === activeChat._id ? res.chat : c)));
                    }}
                    onMakeAdmin={async (memberId) => {
                      const res = await api.makeAdmin(activeChat._id, memberId);
                      setChats((current) => current.map((c) => (c._id === activeChat._id ? res.chat : c)));
                    }}
                    onTransferAdmin={async (memberId) => {
                      const res = await api.transferAdmin(activeChat._id, memberId);
                      setChats((current) => current.map((c) => (c._id === activeChat._id ? res.chat : c)));
                    }}
                    onExitGroup={async () => {
                      const id = activeChat._id;
                      setChats((current) => current.filter((c) => c._id !== id));
                      setSelectedChat(null);
                      setGroupInfoOpen(false);
                      try {
                        const memberId = String(profile?._id || firebaseUser?.uid || '').trim();
                        await api.removeMember(id, memberId);
                      } catch (error) {
                        console.error('[Exit Group Error] ID:', id, '| Error:', error);
                        toastError(error.message || 'Could not exit group.');
                        await refresh();
                      }
                    }}
                    onDeleteGroup={async () => {
                      handleDeleteGroup(String(activeChat._id || '').trim());
                    }}
                  />
                </Suspense>
              )}
              {userInfoOpen && activeChat?.type === 'direct' && selectedPeer && (
                <Suspense fallback={null}>
                  <UserInfoPanel
                    peer={selectedPeer}
                    chat={activeChat}
                    me={profile}
                    blockState={blockState}
                    onClose={() => setUserInfoOpen(false)}
                    onAudio={() => startCall('voice')}
                    onVideo={() => startCall('video')}
                    onToggleBlock={() => {}}
                  />
                </Suspense>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <nav className={`${activeChat && isMobile ? 'hidden' : 'grid'} fixed bottom-0 left-0 right-0 z-30 grid-cols-3 border-t border-aqua-100 bg-white/95 px-2 sm:px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-soft backdrop-blur lg:hidden`}>
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
      </main>
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
            onMinimize={() => setCallMinimized(true)}
            minimized={callMinimized}
            onRestore={() => setCallMinimized(false)}
            remoteMediaEpoch={remoteMediaEpoch}
            callTimer={callTimer}
            remoteParticipants={remoteParticipants}
            currentUid={profile?._id || firebaseUser?.uid}
            onAdminControl={handleAdminControl}
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
      {deleteConfirmGroupId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-all duration-300 animate-fade-in">
          <div className="w-full max-w-sm transform rounded-3xl bg-white p-6 shadow-2xl transition-all duration-300 scale-100 border border-slate-100 animate-pop">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete this group permanently?</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              This action cannot be undone. All messages, files, and call histories for this group will be deleted for all members.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmGroupId(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = deleteConfirmGroupId;
                  setDeleteConfirmGroupId(null);
                  
                  // Optimistic UI updates
                  setChats((current) => current.filter((c) => c._id !== id));
                  if (selectedChatRef.current?._id === id || selectedChat?._id === id) {
                    setSelectedChat(null);
                  }
                  
                  try {
                    await api.deleteGroupChat(id);
                    toastSuccess('Group deleted successfully');
                  } catch (error) {
                    console.error('[Delete Group Error] ID:', id, '| UID:', profile?._id || firebaseUser?.uid, '| Error:', error);
                    const msg = error?.code === 'permission-denied'
                      ? 'You do not have permission to delete this group. Only the group creator or admins can delete it.'
                      : (error.message || 'Could not delete group.');
                    toastError(msg);
                    await refresh(); // Revert/sync state
                  }
                }}
                className="rounded-2xl bg-rose-600 hover:bg-rose-700 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-900/20 transition active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        <ChatActionBottomSheet
          open={Boolean(activeMenuChat)}
          chat={activeMenuChat}
          amAdmin={
            activeMenuChat?.type === 'group' && (
              String(activeMenuChat.createdBy || '').trim() === String(profile?._id || firebaseUser?.uid || '').trim() ||
              activeMenuChat.participants?.some(
                (p) => String(p.user?._id || '').trim() === String(profile?._id || firebaseUser?.uid || '').trim() && p.role === 'admin'
              )
            )
          }
          onClose={() => setActiveMenuChat(null)}
          onDisconnect={async (chat) => {
            const peer = directPeer(chat, profile);
            const peerId = peer?._id ? String(peer._id).trim() : '';
            if (peerId) {
              // Optimistic removal — update UI before server round-trip
              setChats((current) => current.filter((c) => c._id !== chat._id));
              if (selectedChat?._id === chat._id) {
                setSelectedChat(null);
              }
              try {
                await api.disconnectUser(peerId);
                toastSuccess('Disconnected successfully');
              } catch (err) {
                console.error('[Disconnect Error] Peer ID:', peerId, '| UID:', String(profile?._id || firebaseUser?.uid || '').trim(), '| Error:', err);
                toastError(err.message || 'Could not disconnect user');
                // Revert on failure
                refresh();
              }
            }
          }}
          onDeleteChat={async (chat) => {
            const chatId = String(chat._id || '').trim();
            // Optimistic removal — update UI before server round-trip
            setChats((current) => current.filter((c) => c._id !== chatId));
            if (selectedChat?._id === chatId) {
              setSelectedChat(null);
            }
            try {
              await api.deletePersonalChat(chatId);
              toastSuccess('Chat deleted successfully');
            } catch (err) {
              console.error('[Delete Chat Error] Chat ID:', chatId, '| UID:', String(profile?._id || firebaseUser?.uid || '').trim(), '| Error:', err);
              toastError(err.message || 'Could not delete chat');
              // Revert on failure
              refresh();
            }
          }}
          onExitGroup={async (chat) => {
            const memberId = String(profile?._id || firebaseUser?.uid || '').trim();
            try {
              await api.removeMember(chat._id, memberId);
              toastSuccess('Left group successfully');
              setChats((current) => current.filter((c) => c._id !== chat._id));
              if (selectedChat?._id === chat._id) {
                setSelectedChat(null);
              }
            } catch (err) {
              toastError(err.message || 'Could not exit group');
            }
          }}
          onDeleteGroup={async (chat) => {
            handleDeleteGroup(String(chat._id || '').trim());
          }}
        />
      </Suspense>
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{
          position: 'absolute',
          opacity: 0,
          width: '1px',
          height: '1px',
          pointerEvents: 'none',
          top: '-10px',
          left: '-10px'
        }}
      />
    </>
  );
}
