import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  CheckCheck,
  Download,
  Image,
  Camera,
  Home,
  KeyRound,
  LogOut,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  UserCheck,
  UserPlus,
  Users,
  Video,
  WifiOff,
  X
} from 'lucide-react';
import AuthScreen from './components/AuthScreen.jsx';
import Avatar from './components/Avatar.jsx';
import { api, setTyping as setFirebaseTyping, subscribeChats, subscribeMessages, subscribePresence, subscribeTyping } from './api.js';
import { changePassword, initError } from './firebase.js';
import { useAuth } from './hooks/useAuth.js';
import { registerBackgroundSync, requestNotificationPermission } from './pwa.js';

const emptyRecorder = { recording: false, stream: null, mediaRecorder: null, chunks: [] };

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function directPeer(chat, me) {
  return chat?.participants?.find((participant) => participant.user._id !== me?._id)?.user;
}

function chatTitle(chat, me) {
  if (!chat) return 'AquaChat';
  if (chat.type === 'group') return chat.name;
  const peer = directPeer(chat, me);
  return peer?.displayName || peer?.email || peer?.phoneNumber || 'New chat';
}

function chatImage(chat, me) {
  if (chat?.type === 'group') return chat.avatarUrl;
  return directPeer(chat, me)?.photoURL;
}

function statusText(user) {
  if (user?.isOnline) return 'online';
  return user?.lastSeen ? `last seen ${formatTime(user.lastSeen)}` : 'offline';
}

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
                <li>REACT_APP_FIREBASE_API_KEY</li>
                <li>REACT_APP_FIREBASE_AUTH_DOMAIN</li>
                <li>REACT_APP_FIREBASE_PROJECT_ID</li>
                <li>REACT_APP_FIREBASE_APP_ID</li>
              </ul>
              <li className="mt-2 text-slate-500">Redeploy your project to apply the changes</li>
            </ol>
          </div>
        </div>
      </main>
    );
  }

  const authState = useAuth();

  if (authState.loading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-aqua-100 border-t-aqua-500" />
      </main>
    );
  }

  if (!authState.firebaseUser) return <AuthScreen />;

  if (!authState.profile) {
    return (
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
    );
  }

  return <ChatShell {...authState} />;
}

function ChatShell({ firebaseUser, profile, setProfile, logout }) {
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
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);

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

  const refresh = async () => {
    const [chatData, statusData, userData] = await Promise.all([api.chats(), api.statuses(), api.users(query)]);
    setChats(applyPresenceToChats(chatData.chats, presenceRef.current));
    setStatuses(statusData.statuses);
    setUsers(userData.users || []);
    setTotalUsers(userData.totalUsers || 0);
    if (!selectedChat && chatData.chats[0]) setSelectedChat(chatData.chats[0]);
  };

  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  const presenceRef = useRef({});

  const applyPresenceToUsers = (items, presence) =>
    items.map((user) => ({
      ...user,
      isOnline: Boolean(presence[user._id]?.isOnline),
      lastSeen: presence[user._id]?.lastSeen || user.lastSeen
    }));

  const applyPresenceToChats = (items, presence) =>
    items.map((chat) => ({
      ...chat,
      participants: chat.participants.map((participant) => ({
        ...participant,
        user: {
          ...participant.user,
          isOnline: Boolean(presence[participant.user._id]?.isOnline),
          lastSeen: presence[participant.user._id]?.lastSeen || participant.user.lastSeen
        }
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
      if (!selectedChat && nextChats[0]) setSelectedChat(nextChats[0]);
    });

    return () => {
      unsubscribePresence?.();
      unsubscribeChats?.();
    };
  }, [selectedChat?._id]);

  useEffect(() => {
    const beforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setShowInstall(!isStandalone);
    };
    const installed = () => {
      setIsStandalone(true);
      setShowInstall(false);
      setInstallPrompt(null);
    };
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    registerBackgroundSync().catch(() => {});

    const installTimer = window.setTimeout(() => {
      if (!isStandalone) setShowInstall(true);
    }, 1800);

    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.clearTimeout(installTimer);
    };
  }, [isStandalone]);

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
    if (!selectedChat) return;
    const unsubscribeMessages = subscribeMessages(selectedChat._id, (nextMessages) => {
      setMessages(nextMessages);
      api.seen(selectedChat._id).catch(console.error);
    });
    const unsubscribeTyping = subscribeTyping(selectedChat._id, setTyping);
    return () => {
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

  const connectWithUser = async (user) => {
    const data = await api.connectUser(user._id);
    updateUser(user._id, { connectionStatus: data.status });
    if (data.status === 'connected') {
      await refresh();
    } else {
      await loadUsers(query);
    }
  };

  const acceptUser = async (user) => {
    const data = await api.acceptConnection(user._id);
    updateUser(user._id, { connectionStatus: data.status, directChatId: data.chatId });
    await refresh();
  };

  const followUser = async (user) => {
    const data = await api.followUser(user._id);
    updateUser(user._id, { isFollowing: data.isFollowing });
  };

  const installApp = async () => {
    if (!installPrompt) {
      await requestNotificationPermission();
      setShowInstall(false);
      return;
    }
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      await requestNotificationPermission();
      setIsStandalone(true);
    }
    setInstallPrompt(null);
    setShowInstall(false);
  };

  const sendPayload = async (payload) => {
    if (!selectedChat) return;
    await setFirebaseTyping(selectedChat._id, false);
    await api.sendMessage({ chatId: selectedChat._id, ...payload });
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

  const makePeerConnection = (to) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.onicecandidate = () => {};
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };
    peerConnectionRef.current = pc;
    return pc;
  };

  const startCall = async (callType) => {
    if (!selectedPeer) return;
    window.alert('Firebase call signaling is not enabled yet.');
    return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === 'video' });
    localStreamRef.current = stream;
    setCallState({ active: true, incoming: false, to: selectedPeer._id, callType, caller: selectedPeer, muted: false, cameraOff: callType === 'voice' });
    setTimeout(() => {
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    });
    const pc = makePeerConnection(selectedPeer._id);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  };

  const answerCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callState.callType === 'video' });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    const pc = makePeerConnection(callState.from);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setCallState((current) => ({ ...current, incoming: false }));
  };

  const endCall = () => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setCallState(null);
  };

  return (
    <main className="app-shell bg-gradient-to-br from-aqua-25 via-white to-aqua-50 overflow-hidden p-0 sm:p-3 lg:p-4">
      {!isOnline && (
        <div className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 shadow-soft">
          <WifiOff size={18} />
          Offline mode. Cached chats stay available.
        </div>
      )}
      <div className="mx-auto grid h-full max-w-7xl overflow-hidden border border-white/60 bg-white/80 shadow-soft-xl backdrop-blur-sm sm:rounded-[2.5rem] lg:grid-cols-[360px_1fr]">
        {/* Sidebar */}
        <aside className={`${selectedChat ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-r border-aqua-100/60 bg-gradient-to-b from-white/95 to-aqua-25/50`}>
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
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-24 sm:pb-3">
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
        <section className={`${selectedChat ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col`}>
          {selectedChat ? (
            <>
              <ChatHeader chat={selectedChat} me={profile} typing={typing} onBack={() => setSelectedChat(null)} onAudio={() => startCall('voice')} onVideo={() => startCall('video')} />
              <MessageList messages={messages} me={profile} />
              <Composer chat={selectedChat} onSend={sendPayload} onUpload={api.upload} />
              {selectedChat.type === 'group' && <GroupStrip chat={selectedChat} me={profile} users={users} onRefresh={refresh} />}
            </>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <nav className={`${selectedChat ? 'hidden' : 'grid'} fixed bottom-0 left-0 right-0 z-30 grid-cols-3 border-t border-aqua-100 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-soft backdrop-blur lg:hidden`}>
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
      {showInstall && !isStandalone && <InstallAppPrompt canInstall={Boolean(installPrompt)} onInstall={installApp} onClose={() => setShowInstall(false)} />}
    </main>
  );
}

function InstallAppPrompt({ canInstall, onInstall, onClose }) {
  const [notifications, setNotifications] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const enableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifications(permission);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 mx-auto max-w-md animate-pop rounded-3xl border border-aqua-100 bg-white/95 p-4 shadow-soft-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <img src="/app-icon.svg" alt="" className="h-12 w-12 rounded-2xl" loading="lazy" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-cyan-950">Install AquaChat</h2>
              <p className="mt-1 text-sm leading-5 text-slate-500">{canInstall ? 'Use AquaChat fullscreen with faster launches and offline access.' : 'Use your browser menu to add AquaChat to your home screen.'}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-aqua-50" title="Close">
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onInstall} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-cyan-100 transition hover:bg-cyan-600">
              <Download size={16} />
              {canInstall ? 'Install App' : 'Got it'}
            </button>
            <button type="button" onClick={enableNotifications} className="inline-flex items-center gap-2 rounded-2xl bg-aqua-50 px-4 py-2 text-sm font-black text-cyan-800 transition hover:bg-aqua-100">
              <Bell size={16} />
              {notifications === 'granted' ? 'Notifications on' : 'Enable alerts'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-100 to-aqua-100 shadow-soft">
          <Smile size={48} className="text-cyan-600" />
        </div>
        <h2 className="text-2xl font-black text-cyan-950 mb-2">Pick a conversation</h2>
        <p className="text-slate-500 text-sm">Select a chat from the sidebar to get started</p>
      </div>
    </div>
  );
}

function PeopleSearchRow({ user, onConnect, onAccept, onFollow, onMessage }) {
  const connectionLabel = user.connectionStatus === 'connected'
    ? 'Connected'
    : user.connectionStatus === 'incoming'
      ? 'Accept'
      : user.connectionStatus === 'requested'
        ? 'Requested'
        : 'Connect';
  const connectionIcon = user.connectionStatus === 'connected' ? UserCheck : UserPlus;
  const ConnectionIcon = connectionIcon;
  const canConnect = user.connectionStatus !== 'connected' && user.connectionStatus !== 'requested';
  const preview = user.lastMessagePreview || user.email || user.phoneNumber || user.bio || statusText(user);

  const handleConnect = () => {
    if (user.connectionStatus === 'incoming') return onAccept(user);
    if (canConnect) return onConnect(user);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onMessage(user._id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onMessage(user._id);
      }}
      className="w-full cursor-pointer rounded-2xl border border-transparent p-3 text-left transition duration-200 hover:border-blush-100/50 hover:bg-blush-50/60"
    >
      <div className="flex items-start gap-3">
        <Avatar user={user} online={user.isOnline} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-bold text-cyan-950">{user.displayName}</h3>
            {user.verified && <BadgeCheck size={15} className="shrink-0 fill-cyan-500 text-white" />}
            {user.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black text-white">{user.unreadCount}</span>}
          </div>
          <p className="truncate text-sm text-slate-500">@{user.username || 'username'} - {statusText(user)}</p>
          <p className="truncate text-xs text-slate-400">{preview}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleConnect();
              }}
              disabled={!canConnect && user.connectionStatus !== 'incoming'}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                user.connectionStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700'
                  : user.connectionStatus === 'requested'
                    ? 'bg-slate-100 text-slate-500'
                    : 'bg-cyan-500 text-white hover:bg-cyan-600'
              } disabled:cursor-default`}
            >
              <ConnectionIcon size={14} />
              {connectionLabel}
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onMessage(user._id); }} className="inline-flex items-center gap-1.5 rounded-xl bg-aqua-50 px-3 py-1.5 text-xs font-black text-cyan-800 transition hover:bg-aqua-100">
              <MessageCircle size={14} />
              Message
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onFollow(user); }} className="rounded-xl bg-blush-50 px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-blush-100">
              {user.isFollowing ? 'Following' : user.followsMe ? 'Follow back' : 'Follow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusTray({ statuses, onCreate, me }) {
  const inputRef = useRef(null);
  const grouped = statuses.slice(0, 12);

  return (
    <div className="flex gap-3 overflow-x-auto border-b border-aqua-100/40 px-3 py-4 scrollbar-hide">
      <button onClick={() => inputRef.current?.click()} className="flex w-16 shrink-0 flex-col items-center gap-2">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-aqua-400 text-white shadow-lg shadow-cyan-200/50 transition hover:shadow-cyan-300/70">
          <Plus size={22} />
        </div>
        <span className="w-full truncate text-xs font-bold text-cyan-900 text-center">Status</span>
        <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onCreate(e.target.files?.[0])} />
      </button>
      <button onClick={() => onCreate()} className="flex w-16 shrink-0 flex-col items-center gap-2">
        <Avatar user={me} size="lg" />
        <span className="w-full truncate text-xs font-bold text-cyan-900 text-center">Text</span>
      </button>
      {grouped.map((status) => (
        <button 
          key={status._id} 
          onClick={() => api.markStatusSeen(status._id)} 
          className="flex w-16 shrink-0 flex-col items-center gap-2 transition duration-200 hover:scale-105"
        >
          <div className="rounded-2xl bg-gradient-to-br from-cyan-400 to-aqua-300 p-1 ring-2 ring-cyan-400/30">
            <Avatar user={status.user} size="lg" />
          </div>
          <span className="w-full truncate text-xs font-bold text-cyan-900 text-center">{status.user.displayName}</span>
        </button>
      ))}
    </div>
  );
}

function ChatHeader({ chat, me, typing, onBack, onAudio, onVideo }) {
  const peer = directPeer(chat, me);

  return (
    <header className="flex items-center gap-3 border-b border-aqua-100/40 bg-gradient-to-r from-white/95 to-aqua-25/50 px-3 py-4 backdrop-blur-sm">
      <button onClick={onBack} className="rounded-2xl px-2 py-2 font-black text-cyan-700 lg:hidden transition duration-200 hover:bg-aqua-100/50">‹</button>
      <Avatar name={chatTitle(chat, me)} image={chatImage(chat, me)} online={peer?.isOnline} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-black text-cyan-950 text-sm">{chatTitle(chat, me)}</h2>
        <p className="truncate text-xs font-medium text-slate-500">{typing ? `${typing.displayName} typing...` : chat.type === 'group' ? `${chat.participants.length} members` : statusText(peer)}</p>
      </div>
      {chat.type === 'direct' && (
        <>
          <button onClick={onAudio} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Voice call">
            <Phone size={18} />
          </button>
          <button onClick={onVideo} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Video call">
            <Video size={18} />
          </button>
        </>
      )}
      <button className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="More">
        <MoreVertical size={18} />
      </button>
    </header>
  );
}

function MessageList({ messages, me }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 bg-gradient-to-b from-white/50 to-aqua-25/50">
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {messages.map((message) => {
          const mine = message.sender?._id === me._id || message.sender === me._id;
          return (
            <div key={message._id} className={`flex animate-floatIn ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-soft ${mine ? 'rounded-br-lg bg-gradient-to-br from-cyan-500 to-aqua-400 text-white' : 'rounded-bl-lg bg-white text-slate-800 border border-aqua-100/60'}`}>
                {!mine && <p className="mb-1.5 text-xs font-black text-cyan-600">{message.sender?.displayName}</p>}
                {message.mediaUrl && <MediaMessage message={message} />}
                {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>}
                <div className={`mt-2 flex items-center justify-end gap-1.5 text-xs ${mine ? 'text-cyan-50' : 'text-slate-400'}`}>
                  {formatTime(message.createdAt)}
                  {mine && <CheckCheck size={13} className={message.status === 'seen' ? 'text-cyan-100' : 'text-cyan-200'} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MediaMessage({ message }) {
  if (message.type === 'image') return <img src={message.mediaUrl} alt="" className="mb-2 max-h-72 rounded-2xl object-cover" />;
  if (message.type === 'video') return <video src={message.mediaUrl} controls className="mb-2 max-h-72 rounded-2xl" />;
  return <audio src={message.mediaUrl} controls className="mb-2 w-64 max-w-full" />;
}

function Composer({ chat, onSend, onUpload }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recorder, setRecorder] = useState(emptyRecorder);
  const fileRef = useRef(null);
  const typingTimerRef = useRef(null);

  const type = () => {
    setFirebaseTyping(chat._id, true).catch(console.error);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setFirebaseTyping(chat._id, false).catch(console.error), 700);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend({ type: 'text', body: text.trim() });
    setText('');
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await onUpload(file);
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';
      onSend({ type: kind, mediaUrl: uploaded.url, cloudinaryPublicId: uploaded.publicId, duration: uploaded.duration || 0 });
    } finally {
      setUploading(false);
    }
  };

  const toggleRecord = async () => {
    if (recorder.recording) {
      recorder.mediaRecorder.stop();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      stream.getTracks().forEach((track) => track.stop());
      setRecorder(emptyRecorder);
      await uploadFile(file);
    };
    mediaRecorder.start();
    setRecorder({ recording: true, stream, mediaRecorder, chunks });
  };

  return (
    <form onSubmit={submit} className="border-t border-aqua-100/40 bg-gradient-to-t from-aqua-25/50 to-white/95 px-3 py-4 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5">
        <button type="button" className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Emoji">
          <Smile size={20} />
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Attach">
          <Paperclip size={20} />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} />
        <input 
          value={text} 
          onChange={(e) => { setText(e.target.value); type(); }} 
          placeholder="Message..." 
          className="min-w-0 flex-1 rounded-2xl border border-aqua-100/60 bg-white px-5 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" 
        />
        <button 
          type="button" 
          onClick={toggleRecord} 
          className={`rounded-2xl p-2.5 transition duration-200 ${recorder.recording ? 'bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-lg shadow-rose-200/50' : 'text-slate-600 hover:bg-aqua-100/60 hover:text-cyan-700'}`} 
          title="Voice note"
        >
          <Mic size={20} />
        </button>
        <button 
          disabled={uploading || !text.trim()} 
          className="rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 p-2.5 text-white shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-60 disabled:shadow-none" 
          title="Send"
        >
          {uploading ? <Image size={20} className="animate-pulse" /> : <Send size={20} />}
        </button>
      </div>
    </form>
  );
}

function GroupModal({ users, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);

  const toggle = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const submit = async (event) => {
    event.preventDefault();
    const { chat } = await api.createGroupChat({ name, memberIds: selected });
    onCreated(chat);
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-gradient-to-tr from-cyan-950/40 to-aqua-950/20 p-3 backdrop-blur-sm sm:place-items-center">
      <form onSubmit={submit} className="w-full max-w-md animate-pop rounded-3xl border border-white/60 bg-white/95 p-6 shadow-soft-lg backdrop-blur-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-black text-cyan-950">New group</h2>
          <button type="button" onClick={onClose} className="rounded-2xl p-2 text-slate-500 transition duration-200 hover:bg-aqua-100/60"><X size={20} /></button>
        </div>
        <input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Group name" 
          className="mb-4 w-full rounded-2xl border border-aqua-100/60 bg-white px-5 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" 
        />
        <div className="max-h-72 overflow-y-auto space-y-1 mb-6">
          {users.map((user) => (
            <label key={user._id} className="flex cursor-pointer items-center gap-3 rounded-2xl p-3 transition duration-200 hover:bg-aqua-50/60">
              <input type="checkbox" checked={selected.includes(user._id)} onChange={() => toggle(user._id)} className="h-4 w-4 accent-cyan-500 rounded" />
              <Avatar user={user} size="sm" />
              <span className="font-bold text-cyan-950 text-sm">{user.displayName}</span>
            </label>
          ))}
        </div>
        <button 
          className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 py-3 font-bold text-white shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-50 disabled:shadow-none" 
          disabled={!name.trim()}
        >
          Create
        </button>
      </form>
    </div>
  );
}

function GroupStrip({ chat, me, users, onRefresh }) {
  const amAdmin = chat.participants.some((participant) => participant.user._id === me._id && participant.role === 'admin');
  if (!amAdmin) return null;

  const addable = users.filter((user) => !chat.participants.some((participant) => participant.user._id === user._id));

  return (
    <div className="hidden border-t border-aqua-100/40 bg-gradient-to-t from-aqua-25/50 to-white/95 px-4 py-3 lg:block backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 overflow-x-auto scrollbar-hide">
        {addable.slice(0, 8).map((user) => (
          <button 
            key={user._id} 
            onClick={async () => { await api.addMembers(chat._id, [user._id]); await onRefresh(); }} 
            className="shrink-0 rounded-2xl bg-gradient-to-r from-aqua-100/60 to-cyan-100/50 px-4 py-2.5 text-xs font-bold text-cyan-700 transition duration-200 hover:from-aqua-100/80 hover:to-cyan-100/70 border border-aqua-200/40"
          >
            + {user.displayName}
          </button>
        ))}
        {chat.participants.filter((participant) => participant.user._id !== me._id).map((participant) => (
          <button 
            key={participant.user._id} 
            onClick={async () => { await api.removeMember(chat._id, participant.user._id); await onRefresh(); }} 
            className="shrink-0 rounded-2xl bg-gradient-to-r from-rose-100/60 to-blush-100/50 px-4 py-2.5 text-xs font-bold text-rose-600 transition duration-200 hover:from-rose-100/80 hover:to-blush-100/70 border border-rose-200/40"
          >
            ✕ {participant.user.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileSettings({ firebaseUser, profile, setProfile, onClose }) {
  const [form, setForm] = useState({
    displayName: profile.displayName || '',
    username: profile.username || '',
    bio: profile.bio || '',
    photoURL: profile.photoURL || ''
  });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);
  const canChangePassword = firebaseUser?.providerData?.some((provider) => provider.providerId === 'password');

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const uploaded = await api.upload(file);
      updateField('photoURL', uploaded.url);
      const { user } = await api.updateProfile({ profilePic: uploaded.url });
      setProfile(user);
      setForm((current) => ({ ...current, photoURL: user.photoURL || uploaded.url }));
      setMessage('Profile picture updated');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { user } = await api.updateProfile({
        name: form.displayName,
        username: form.username,
        profilePic: form.photoURL,
        bio: form.bio
      });
      setProfile(user);

      if (password && canChangePassword) {
        await changePassword(firebaseUser, password);
        setPassword('');
      }

      setMessage('Profile saved');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-gradient-to-tr from-cyan-950/40 to-aqua-950/20 p-3 backdrop-blur-sm sm:place-items-center">
      <form onSubmit={saveProfile} className="w-full max-w-md animate-pop rounded-3xl border border-white/60 bg-white/95 p-6 shadow-soft-lg backdrop-blur-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-black text-cyan-950">Profile</h2>
          <button type="button" onClick={onClose} className="rounded-2xl p-2 text-slate-500 transition duration-200 hover:bg-aqua-100/60">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <Avatar name={form.displayName} image={form.photoURL} size="xl" />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-100 to-rose-50 px-4 py-2.5 text-sm font-bold text-rose-600 transition duration-200 hover:bg-gradient-to-r hover:from-rose-200 hover:to-rose-100">
              <Camera size={16} />
              Change
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
          </div>
        </div>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Name</span>
          <input value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" />
        </label>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Username</span>
          <input value={form.username} onChange={(event) => updateField('username', event.target.value)} className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" />
        </label>

        <label className="mb-3.5 block">
          <span className="mb-2 block text-sm font-bold text-cyan-950">Bio</span>
          <textarea value={form.bio} onChange={(event) => updateField('bio', event.target.value)} rows={3} className="w-full resize-none rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" />
        </label>

        <label className="mb-4 block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold text-cyan-950">
            <KeyRound size={15} />
            New password
          </span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            disabled={!canChangePassword}
            placeholder={canChangePassword ? 'Optional' : 'Not available for Google or phone login'}
            className="w-full rounded-2xl border border-aqua-100/60 bg-white px-4 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft disabled:bg-slate-50/60 disabled:text-slate-400"
          />
        </label>

        <button disabled={busy} className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 px-4 py-3 font-bold text-white shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-50 disabled:shadow-none">
          {busy ? 'Saving...' : 'Save changes'}
        </button>

        {message && <p className="mt-4 rounded-2xl bg-aqua-100/60 border border-aqua-200/60 px-4 py-3 text-sm font-bold text-cyan-800">{message}</p>}
      </form>
    </div>
  );
}

function CallModal({ state, localVideoRef, remoteVideoRef, onAnswer, onEnd }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-gradient-to-br from-cyan-950/80 to-cyan-900/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl animate-pop overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-950 to-cyan-900 text-white shadow-soft-xl">
        <div className="grid min-h-[420px] bg-gradient-to-br from-cyan-900 to-cyan-950 sm:grid-cols-2">
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-64 w-full bg-cyan-950 object-cover border-r border-cyan-800/50" />
          <video ref={localVideoRef} autoPlay muted playsInline className="h-full min-h-64 w-full bg-cyan-800 object-cover" />
        </div>
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-cyan-950 to-cyan-900/80 px-6 py-5 border-t border-cyan-800/30">
          <div>
            <h2 className="text-lg font-black text-white">{state.caller?.displayName || 'Call'}</h2>
            <p className="text-sm text-cyan-200">{state.callType === 'video' ? 'Video call' : 'Voice call'}</p>
          </div>
          <div className="flex gap-3">
            {state.incoming && (
              <button onClick={onAnswer} className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-200/30 transition duration-200 hover:shadow-emerald-300/50">
                Answer
              </button>
            )}
            <button onClick={onEnd} className="rounded-2xl bg-gradient-to-r from-rose-500 to-rose-400 px-6 py-3 font-bold text-white shadow-lg shadow-rose-200/30 transition duration-200 hover:shadow-rose-300/50">
              End
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
