import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { Bluetooth, Headphones, Maximize2, Mic, MicOff, Minimize2, PhoneOff, Video, VideoOff, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';

export default function CallModal({
  state,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  muted = false,
  cameraOff = false,
  speakerOn = true,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker,
  onAnswer,
  onEnd,
  onMinimize,
  minimized = false,
  onRestore,
  remoteMediaEpoch = 0,
  callTimer = 0,
  remoteParticipants = [],
  currentUid = '',
  onAdminControl = () => {}
}) {
  const isVideo = state.callType === 'video';
  const isGroupCall = state.participants && state.participants.length > 1;
  const isAdmin = state.creator === currentUid;
  const [activeMenuUid, setActiveMenuUid] = useState(null);
  const showControls = !state.incoming || state.preparing;
  const showTopBar = !isVideo || state.preparing || state.incoming || state.status === 'ringing' || state.connectedAt;

  const [audioDevices, setAudioDevices] = useState([]);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(speakerOn ? 'speaker' : 'earpiece');

  // Dragging logic for minimized state
  const [position, setPosition] = useState({ x: window.innerWidth - 180, y: 80 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const elementStartRef = useRef({ x: 0, y: 0 });
  const bubbleRef = useRef(null);

  // Recalculate position if window is resized to keep bubble within viewport
  useEffect(() => {
    if (!minimized) return;
    const handleResize = () => {
      setPosition((prev) => {
        const x = Math.max(10, Math.min(window.innerWidth - 170, prev.x));
        const y = Math.max(10, Math.min(window.innerHeight - 230, prev.y));
        return { x, y };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [minimized]);

  const handlePointerDown = (e) => {
    if (!minimized) return;
    // Only handle left click or touch
    if (e.button !== 0 && e.type !== 'touchstart') return;
    
    isDraggingRef.current = false;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { x: clientX, y: clientY };
    elementStartRef.current = { x: position.x, y: position.y };

    const handlePointerMove = (moveEvent) => {
      const mX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const mY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const deltaX = mX - dragStartRef.current.x;
      const deltaY = mY - dragStartRef.current.y;
      
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        isDraggingRef.current = true;
      }
      
      const newX = Math.max(10, Math.min(window.innerWidth - 170, elementStartRef.current.x + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 230, elementStartRef.current.y + deltaY));
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      document.removeEventListener('mousemove', handlePointerMove);
      document.removeEventListener('mouseup', handlePointerUp);
      document.removeEventListener('touchmove', handlePointerMove);
      document.removeEventListener('touchend', handlePointerUp);
    };

    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    document.addEventListener('touchmove', handlePointerMove, { passive: true });
    document.addEventListener('touchend', handlePointerUp);
  };

  const handleBubbleClick = (e) => {
    if (!minimized) return;
    if (isDraggingRef.current) {
      e.preventDefault();
      return;
    }
    if (onRestore) {
      onRestore();
    }
  };

  const handleMinimizeClick = async (e) => {
    e.stopPropagation();
    
    if (onMinimize) {
      onMinimize();
    }

    if (isVideo) {
      try {
        const video = remoteVideoRef.current;
        if (document.pictureInPictureEnabled && video && video.readyState >= 1) {
          if (document.pictureInPictureElement !== video) {
            await video.requestPictureInPicture();
            console.log('[PiP] Entered Picture-in-Picture synchronously via user gesture');
          }
        }
      } catch (err) {
        console.warn('[PiP] requestPictureInPicture failed:', err.message);
      }
    }
  };

  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        setAudioDevices(outputs);
      } catch (err) {
        console.warn('Enumerate audio outputs failed:', err);
      }
    };
    loadDevices();
    
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', loadDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
      };
    }
  }, []);

  useEffect(() => {
    const lockCallOrientation = async () => {
      try {
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
          await screen.orientation.lock('portrait');
          console.log('[CallModal] Locked screen orientation to portrait');
        }
      } catch (err) {
        console.warn('[CallModal] Screen orientation lock failed:', err.message);
      }
    };

    lockCallOrientation();

    const handleFullscreenChange = () => {
      lockCallOrientation();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (state.speakerMuted) {
      setCurrentRoute('off');
    } else {
      setCurrentRoute(speakerOn ? 'speaker' : 'earpiece');
    }
  }, [speakerOn, state.speakerMuted]);

  const getAudioRoutes = () => {
    const routes = [];
    
    // Speaker Off option
    routes.push({ id: 'off', label: 'Speaker Off', icon: 'VolumeX', type: 'off' });

    let hasBluetooth = false;
    let hasWired = false;
    let hasSpeaker = false;
    let hasEarpiece = false;

    audioDevices.forEach(d => {
      const label = d.label.toLowerCase();
      if (label.includes('bluetooth') || label.includes('bt') || label.includes('hands-free') || label.includes('handsfree')) {
        routes.push({ id: d.deviceId, label: d.label || 'Bluetooth Device', icon: 'Bluetooth', type: 'bluetooth', device: d });
        hasBluetooth = true;
      } else if (label.includes('headphone') || label.includes('headset') || label.includes('wired') || label.includes('jack')) {
        routes.push({ id: d.deviceId, label: d.label || 'Earphones/Headset', icon: 'Headphones', type: 'headset', device: d });
        hasWired = true;
      } else if (label.includes('speaker') || label.includes('loudspeaker')) {
        routes.push({ id: d.deviceId, label: d.label || 'Full Speaker', icon: 'Volume2', type: 'speaker', device: d });
        hasSpeaker = true;
      } else if (label.includes('earpiece') || label.includes('receiver') || label.includes('phone') || label.includes('normal')) {
        routes.push({ id: d.deviceId, label: d.label || 'Normal Speaker (Earpiece)', icon: 'Volume1', type: 'earpiece', device: d });
        hasEarpiece = true;
      }
    });

    const defaultDevice = audioDevices.find(d => d.deviceId === 'default') || audioDevices[0];

    // Fallbacks to match spec
    if (!hasEarpiece) {
      routes.push({ id: defaultDevice?.deviceId || 'default', label: 'Normal Speaker', icon: 'Volume1', type: 'earpiece', device: defaultDevice });
    }
    if (!hasSpeaker) {
      routes.push({ id: defaultDevice?.deviceId || 'default_speaker', label: 'Full Speaker', icon: 'Volume2', type: 'speaker', device: defaultDevice });
    }

    return routes;
  };

  const handleRouteSelect = async (route) => {
    const audioEl = remoteAudioRef?.current;
    if (!audioEl) return;

    if (route.type === 'off') {
      audioEl.muted = true;
      setCurrentRoute('off');
      onToggleSpeaker(speakerOn, true);
    } else {
      audioEl.muted = false;
      
      const nextSpeakerOn = route.type === 'speaker';
      onToggleSpeaker(nextSpeakerOn, false);

      if (route.device && typeof audioEl.setSinkId === 'function') {
        try {
          await audioEl.setSinkId(route.device.deviceId);
        } catch (err) {
          console.warn('setSinkId failed:', err);
        }
      }
      
      setCurrentRoute(route.type);
    }
  };
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  };
  const callTimeLabel = state.connectedAt ? formatDuration(callTimer) : null;

  useLayoutEffect(() => {
    const remote = remoteVideoRef.current;
    const local = localVideoRef.current;
    const audio = remoteAudioRef?.current;
    if (remote?.srcObject) remote.play().catch(() => {});
    if (local?.srcObject) local.play().catch(() => {});
    if (audio?.srcObject) audio.play().catch(() => {});
    
    // Play participant videos for group calls
    if (isGroupCall && remoteParticipants.length > 0) {
      remoteParticipants.forEach((participant) => {
        const video = participant.videoRef?.current;
        if (video?.srcObject) video.play().catch(() => {});
      });
    }
  }, [isVideo, state.preparing, state.incoming, state.offer, remoteMediaEpoch, localVideoRef, remoteVideoRef, remoteAudioRef, isGroupCall, remoteParticipants]);

  const controlBtn = (active, onClick, title, children) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`grid h-14 w-14 place-items-center rounded-full transition duration-200 sm:h-16 sm:w-16 ${
        active ? 'bg-white/25 text-white hover:bg-white/35' : 'bg-white/15 text-white hover:bg-white/25'
      }`}
    >
      {children}
    </button>
  );

  const renderAudioMenu = () => {
    if (!audioMenuOpen) return null;
    return (
      <>
        {/* Backdrop */}
        <div 
          onClick={() => setAudioMenuOpen(false)} 
          className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-xs animate-fade-in"
        />
        
        {/* Responsive Options Box */}
        <div className="fixed bottom-0 inset-x-0 z-[110] bg-white rounded-t-3xl p-5 pb-8 shadow-2xl animate-slide-up sm:fixed sm:bottom-24 sm:left-auto sm:right-6 sm:w-64 sm:rounded-2xl sm:p-3 sm:pb-3 sm:shadow-lg sm:border sm:border-slate-100">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2 px-1">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Audio Routing</h4>
            <button onClick={() => setAudioMenuOpen(false)} className="text-slate-400 hover:text-slate-600 sm:hidden">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-1">
            {getAudioRoutes().map(route => {
              const isSelected = 
                route.type === 'off' ? currentRoute === 'off' :
                route.type === 'speaker' ? currentRoute === 'speaker' :
                route.type === 'earpiece' ? currentRoute === 'earpiece' :
                currentRoute === route.id;

              return (
                <button
                  key={route.id}
                  onClick={() => {
                    handleRouteSelect(route);
                    setAudioMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${isSelected ? 'bg-aqua-50 text-cyan-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-2.5">
                    {route.icon === 'VolumeX' && <VolumeX size={16} className="text-rose-500" />}
                    {route.icon === 'Volume1' && <Volume1 size={16} className="text-slate-500" />}
                    {route.icon === 'Volume2' && <Volume2 size={16} className="text-cyan-600" />}
                    {route.icon === 'Bluetooth' && <Bluetooth size={16} className="text-indigo-500" />}
                    {route.icon === 'Headphones' && <Headphones size={16} className="text-amber-500" />}
                    <span>{route.label}</span>
                  </div>
                  {isSelected && <span className="text-emerald-500 font-bold text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  if (isGroupCall && isVideo) {
    // Only show participants who have an active stream
    const activeParticipants = remoteParticipants.filter((p) => p.hasStream);
    const waitingParticipants = remoteParticipants.filter((p) => !p.hasStream);
    const activeCount = activeParticipants.length;

    // Dynamic grid classes based on active participant count (WhatsApp/Meet style)
    const gridClass =
      activeCount === 0
        ? ''
        : activeCount === 1
        ? 'grid grid-cols-1 grid-rows-1'
        : activeCount === 2
        ? 'grid grid-cols-1 sm:grid-cols-2 grid-rows-2 sm:grid-rows-1'
        : activeCount <= 4
        ? 'grid grid-cols-2 grid-rows-2'
        : 'grid grid-cols-2 grid-rows-3 sm:grid-cols-3 sm:grid-rows-2';

    return (
      <div
        ref={bubbleRef}
        onPointerDown={handlePointerDown}
        onClick={handleBubbleClick}
        style={
          minimized
            ? {
                left: `${position.x}px`,
                top: `${position.y}px`,
                touchAction: 'none'
              }
            : undefined
        }
        className={
          minimized
            ? "fixed z-[999] h-48 w-36 overflow-hidden rounded-3xl border border-white/30 bg-slate-900 shadow-2xl cursor-grab active:cursor-grabbing select-none transition-all duration-300"
            : "fixed inset-0 z-[150] bg-slate-950 overflow-hidden"
        }
      >
        <div className={
          minimized
            ? "relative h-full w-full"
            : `absolute inset-0 z-10 gap-1 p-1 sm:gap-1.5 sm:p-1.5 pb-28 ${gridClass}`
        }>
          {activeCount === 0 ? (
            <div className={minimized ? "flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-950 to-slate-900 px-2 text-center text-white" : "flex h-full flex-col items-center justify-center gap-5 px-6"}>
              <div className="relative">
                {!minimized && <div className="absolute -inset-3 animate-pulse rounded-full bg-cyan-500/20" />}
                <Avatar name={state.caller?.displayName || 'Group'} image={state.caller?.photoURL} size={minimized ? "sm" : "xl"} />
              </div>
              <h2 className={minimized ? "hidden" : "text-xl font-black text-white"}>Group Video Call</h2>
              <p className={minimized ? "mt-1 text-[10px] text-cyan-300 font-semibold animate-pulse" : "animate-pulse text-sm font-medium text-cyan-300"}>
                {state.status === 'ringing' ? 'Ringing participants…' : 'Waiting for participants to join…'}
              </p>
              {waitingParticipants.length > 0 && !minimized && (
                <div className="mt-2 flex items-center gap-3">
                  {waitingParticipants.map((p) => (
                    <div key={p.uid} className="flex flex-col items-center gap-1.5">
                      <div className="rounded-full ring-2 ring-cyan-500/40 ring-offset-2 ring-offset-slate-950">
                        <Avatar name={p.name} size="md" />
                      </div>
                      <span className="max-w-[60px] truncate text-[10px] font-semibold text-cyan-200">{p.name?.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              )}
              <video ref={remoteVideoRef} autoPlay playsInline muted autoPictureInPicture={true} className="hidden" />
              {!cameraOff && (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={
                    minimized
                      ? "absolute bottom-2 right-2 z-10 h-14 w-10 rounded-lg border border-white/40 object-cover shadow-lg"
                      : "absolute bottom-3 right-3 z-10 h-28 w-20 rounded-xl border-2 border-white/30 object-cover shadow-2xl sm:h-32 sm:w-24"
                  }
                />
              )}
            </div>
          ) : (
            activeParticipants.map((participant, index) => (
              <div
                key={participant.uid}
                onClick={
                  minimized
                    ? undefined
                    : () => {
                        if (isAdmin) {
                          setActiveMenuUid(activeMenuUid === participant.uid ? null : participant.uid);
                        }
                      }
                }
                className={
                  minimized
                    ? index > 0
                      ? "hidden"
                      : "relative h-full w-full overflow-hidden bg-slate-900"
                    : `group relative h-full w-full overflow-hidden bg-slate-900 transition-all duration-300 ${
                        isAdmin ? 'cursor-pointer' : ''
                      } ${activeCount === 1 ? 'rounded-2xl' : 'rounded-xl'}`
                }
              >
                <video
                  ref={(el) => {
                    if (el && participant.videoRef) participant.videoRef.current = el;
                  }}
                  autoPlay
                  playsInline
                  muted
                  autoPictureInPicture={true}
                  className="h-full w-full object-cover"
                />
                {state.participantsState?.[participant.uid]?.muted && !minimized && (
                  <div className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/90 text-white shadow-lg backdrop-blur-sm">
                    <MicOff size={13} />
                  </div>
                )}
                {minimized && state.muted && (
                  <div className="absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/90 text-white backdrop-blur-xs">
                    <MicOff size={11} />
                  </div>
                )}
                {!minimized && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-6">
                    <span className="text-xs font-bold text-white drop-shadow-lg">{participant.name || 'Participant'}</span>
                  </div>
                )}
                {isAdmin && activeMenuUid === participant.uid && !minimized && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl min-w-[140px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdminControl(participant.uid, 'mute');
                          setActiveMenuUid(null);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
                      >
                        {state.participantsState?.[participant.uid]?.muted ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdminControl(participant.uid, 'remove');
                          setActiveMenuUid(null);
                        }}
                        className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-rose-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuUid(null);
                        }}
                        className="rounded-xl px-4 py-1.5 text-[10px] text-slate-400 transition hover:bg-white/5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {activeCount > 0 && waitingParticipants.length > 0 && !minimized && (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
              <span className="text-[10px] font-semibold text-cyan-200">Joining:</span>
              {waitingParticipants.map((p) => (
                <div key={p.uid} title={p.name} className="h-6 w-6 overflow-hidden rounded-full ring-1 ring-white/30">
                  <Avatar name={p.name} size="xs" />
                </div>
              ))}
            </div>
          )}

          {activeCount > 0 && !cameraOff && (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={
                minimized
                  ? "absolute bottom-2 right-2 z-10 h-14 w-10 rounded-lg border border-white/40 object-cover shadow-lg"
                  : "absolute bottom-3 right-3 z-10 h-28 w-20 rounded-xl border-2 border-white/30 object-cover shadow-2xl sm:bottom-4 sm:right-4 sm:h-32 sm:w-24"
              }
            />
          )}
        </div>

        {showTopBar && !minimized && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/60 to-transparent px-4 pb-12 pt-[max(env(safe-area-inset-top),1rem)]">
            <div className="flex items-center justify-center gap-3">
              {activeCount > 0 && (
                <div className="flex h-6 items-center gap-1 rounded-full bg-emerald-500/20 px-2.5">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-bold text-emerald-300">{activeCount + 1}</span>
                </div>
              )}
              <p className="text-center text-sm font-semibold text-cyan-100">
                {state.preparing
                  ? 'Connecting…'
                  : state.incoming
                  ? 'Incoming group call'
                  : state.status === 'ringing'
                  ? `Ringing ${remoteParticipants.length} participant${remoteParticipants.length > 1 ? 's' : ''}…`
                  : callTimeLabel
                  ? callTimeLabel
                  : 'Group call'}
              </p>
            </div>
          </div>
        )}

        {!minimized && (
          <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/60 via-black/35 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-12 flex flex-col items-center">
            {state.incoming && !state.preparing && (
              <div className="mb-4 flex justify-center gap-4">
                <button
                  type="button"
                  onClick={onEnd}
                  className="rounded-full bg-gradient-to-r from-rose-500 to-rose-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-900/40"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={onAnswer}
                  disabled={!state.offer}
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state.offer ? 'Answer' : 'Connecting…'}
                </button>
              </div>
            )}

            {showControls && (
              <div className="mx-auto flex max-w-md items-center justify-center gap-4 rounded-full bg-black/40 px-5 py-4 backdrop-blur-md sm:gap-6 sm:px-8">
                {controlBtn(
                  muted,
                  onToggleMute,
                  muted ? 'Unmute' : 'Mute',
                  muted ? <MicOff size={24} /> : <Mic size={24} />
                )}
                {isVideo &&
                  controlBtn(
                    cameraOff,
                    onToggleCamera,
                    cameraOff ? 'Turn camera on' : 'Turn camera off',
                    cameraOff ? <VideoOff size={24} /> : <Video size={24} />
                  )}
                {controlBtn(
                  currentRoute === 'off',
                  () => setAudioMenuOpen(true),
                  'Audio Output',
                  currentRoute === 'off' ? <VolumeX size={24} /> :
                  currentRoute === 'earpiece' ? <Volume1 size={24} /> :
                  <Volume2 size={24} />
                )}
                {onMinimize && !state.incoming && !state.preparing && (
                  <button
                    type="button"
                    onClick={handleMinimizeClick}
                    title="Minimize call"
                    className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white transition duration-200 hover:bg-white/25 sm:h-16 sm:w-16"
                  >
                    <Minimize2 size={24} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onEnd}
                  title="End call"
                  className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-lg shadow-rose-900/50 transition hover:scale-105 sm:h-16 sm:w-16"
                >
                  <PhoneOff size={26} />
                </button>
              </div>
            )}
          </div>
        )}

        {minimized && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <Maximize2 className="text-white drop-shadow-md" size={20} />
          </div>
        )}

        {renderAudioMenu()}
      </div>
    );
  }

  return (
    <div
      ref={bubbleRef}
      onPointerDown={handlePointerDown}
      onClick={handleBubbleClick}
      style={
        minimized
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              touchAction: 'none'
            }
          : undefined
      }
      className={
        minimized
          ? "fixed z-[999] h-48 w-36 overflow-hidden rounded-3xl border border-white/30 bg-slate-900 shadow-2xl cursor-grab active:cursor-grabbing select-none transition-all duration-300"
          : "fixed inset-0 z-[150] bg-slate-950 overflow-hidden"
      }
    >
      {/* Video/Voice Layer */}
      <div className={minimized ? "relative h-full w-full" : "absolute inset-0 z-10 w-full h-full"}>
        {isVideo ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              autoPictureInPicture={true}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={
                minimized
                  ? `absolute bottom-2 right-2 z-10 h-14 w-10 rounded-lg border border-white/40 object-cover shadow-lg ${cameraOff ? 'hidden' : ''}`
                  : `absolute bottom-32 right-4 z-10 h-36 w-28 rounded-2xl border-2 border-white/30 object-cover shadow-2xl sm:bottom-36 sm:h-44 sm:w-32 ${cameraOff ? 'hidden' : ''}`
              }
            />
            {minimized && state.muted && (
              <div className="absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/90 text-white backdrop-blur-xs">
                <MicOff size={11} />
              </div>
            )}
          </>
        ) : (
          <div className={
            minimized
              ? "relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-cyan-600 to-indigo-900 text-white px-2 text-center"
              : "flex h-full w-full flex-col items-center justify-center gap-4 px-6 bg-gradient-to-br from-cyan-950 via-cyan-900 to-cyan-950"
          }>
            <div className="relative">
              {minimized && <div className="absolute -inset-1.5 animate-ping rounded-full bg-emerald-500/30" />}
              <Avatar name={state.caller?.displayName} image={state.caller?.photoURL} size={minimized ? "md" : "xl"} />
            </div>
            <h2 className={minimized ? "mt-2 block max-w-[120px] truncate text-[11px] font-bold text-white" : "text-xl font-black text-white"}>
              {state.caller?.displayName || 'Call'}
            </h2>
            <p className={minimized ? "text-[10px] text-emerald-300 font-semibold mt-0.5" : "text-sm text-cyan-200"}>
              {state.preparing
                ? 'Connecting…'
                : state.incoming
                ? 'Incoming call'
                : state.status === 'ringing'
                ? 'Ringing…'
                : callTimeLabel
                ? minimized
                  ? state.status === 'connected' ? callTimeLabel : 'Connecting...'
                  : `On call • ${callTimeLabel}`
                : 'Voice call'}
            </p>
            <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
            <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
          </div>
        )}
      </div>

      {showTopBar && !minimized && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/60 to-transparent px-4 pb-12 pt-[max(env(safe-area-inset-top),1rem)]">
          <div className="space-y-1">
            <p className="text-center text-sm font-semibold text-cyan-100">
              {state.preparing
                ? 'Connecting via secure relay…'
                : state.incoming
                ? 'Incoming call'
                : state.status === 'ringing'
                ? 'Ringing…'
                : callTimeLabel
                ? `On call • ${callTimeLabel}`
                : 'On call'}
            </p>
            {callTimeLabel && (
              <p className="text-center text-xs text-cyan-200">Call duration</p>
            )}
          </div>
        </div>
      )}

      {!minimized && (
        <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/60 via-black/35 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-12 flex flex-col items-center">
          {state.incoming && !state.preparing && (
            <div className="mb-4 flex justify-center gap-4">
              <button
                type="button"
                onClick={onEnd}
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-900/40"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={onAnswer}
                disabled={!state.offer}
                className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {state.offer ? 'Answer' : 'Connecting…'}
              </button>
            </div>
          )}

          {showControls && (
            <div className="mx-auto flex max-w-md items-center justify-center gap-4 rounded-full bg-black/35 px-5 py-4 backdrop-blur-md sm:gap-6 sm:px-8">
              {controlBtn(
                muted,
                onToggleMute,
                muted ? 'Unmute' : 'Mute',
                muted ? <MicOff size={24} /> : <Mic size={24} />
              )}
              {isVideo &&
                controlBtn(
                  cameraOff,
                  onToggleCamera,
                  cameraOff ? 'Turn camera on' : 'Turn camera off',
                  cameraOff ? <VideoOff size={24} /> : <Video size={24} />
                )}
              {controlBtn(
                currentRoute === 'off',
                () => setAudioMenuOpen(true),
                'Audio Output',
                currentRoute === 'off' ? <VolumeX size={24} /> :
                currentRoute === 'earpiece' ? <Volume1 size={24} /> :
                <Volume2 size={24} />
              )}
              {onMinimize && !state.incoming && !state.preparing && (
                <button
                  type="button"
                  onClick={handleMinimizeClick}
                  title="Minimize call"
                  className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white transition duration-200 hover:bg-white/25 sm:h-16 sm:w-16"
                >
                  <Minimize2 size={24} />
                </button>
              )}
              <button
                type="button"
                onClick={onEnd}
                title="End call"
                className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-lg shadow-rose-900/50 transition hover:scale-105 sm:h-16 sm:w-16"
              >
                <PhoneOff size={26} />
              </button>
            </div>
          )}
        </div>
      )}

      {minimized && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <Maximize2 className="text-white drop-shadow-md" size={20} />
        </div>
      )}

      {renderAudioMenu()}
    </div>
  );
}
