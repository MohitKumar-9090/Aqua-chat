import { useLayoutEffect, useState } from 'react';
import { Mic, MicOff, Minimize2, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
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
      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-950">
        <div className={`relative min-h-0 flex-1 gap-1 p-1 sm:gap-1.5 sm:p-1.5 ${gridClass}`}>
          {activeCount === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
              <div className="relative">
                <div className="absolute -inset-3 animate-pulse rounded-full bg-cyan-500/20" />
                <Avatar name={state.caller?.displayName} image={state.caller?.photoURL} size="xl" />
              </div>
              <h2 className="text-xl font-black text-white">Group Video Call</h2>
              <p className="animate-pulse text-sm font-medium text-cyan-300">
                {state.status === 'ringing' ? 'Ringing participants…' : 'Waiting for participants to join…'}
              </p>
              {waitingParticipants.length > 0 && (
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
              <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
              {!cameraOff && (
                <video ref={localVideoRef} autoPlay muted playsInline className="absolute bottom-3 right-3 z-10 h-28 w-20 rounded-xl border-2 border-white/30 object-cover shadow-2xl sm:h-32 sm:w-24" />
              )}
            </div>
          ) : (
            activeParticipants.map((participant) => (
              <div
                key={participant.uid}
                onClick={() => {
                  if (isAdmin) {
                    setActiveMenuUid(activeMenuUid === participant.uid ? null : participant.uid);
                  }
                }}
                className={`group relative h-full w-full overflow-hidden bg-slate-900 transition-all duration-300 ${
                  isAdmin ? 'cursor-pointer' : ''
                } ${activeCount === 1 ? 'rounded-2xl' : 'rounded-xl'}`}
              >
                <video
                  ref={(el) => {
                    if (el && participant.videoRef) participant.videoRef.current = el;
                  }}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                {state.participantsState?.[participant.uid]?.muted && (
                  <div className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/90 text-white shadow-lg backdrop-blur-sm">
                    <MicOff size={13} />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-6">
                  <span className="text-xs font-bold text-white drop-shadow-lg">{participant.name || 'Participant'}</span>
                </div>
                {isAdmin && activeMenuUid === participant.uid && (
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

          {activeCount > 0 && waitingParticipants.length > 0 && (
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
              className="absolute bottom-3 right-3 z-10 h-28 w-20 rounded-xl border-2 border-white/30 object-cover shadow-2xl sm:bottom-4 sm:right-4 sm:h-32 sm:w-24"
            />
          )}
        </div>

        {showTopBar && (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
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

        <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3">
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
                !speakerOn,
                onToggleSpeaker,
                speakerOn ? 'Speaker off' : 'Speaker on',
                speakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />
              )}
              {onMinimize && !state.incoming && !state.preparing && (
                <button
                  type="button"
                  onClick={onMinimize}
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
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-cyan-950 via-cyan-900 to-cyan-950">
      <div className="relative min-h-0 flex-1">
        {isVideo ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`absolute bottom-28 right-4 z-10 h-36 w-28 rounded-2xl border-2 border-white/30 object-cover shadow-2xl sm:bottom-32 sm:h-44 sm:w-32 ${
                cameraOff ? 'hidden' : ''
              }`}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
            <Avatar name={state.caller?.displayName} image={state.caller?.photoURL} size="xl" />
            <h2 className="text-xl font-black text-white">{state.caller?.displayName || 'Call'}</h2>
            <p className="text-sm text-cyan-200">
              {state.preparing
                ? 'Connecting…'
                : state.incoming
                ? 'Incoming call'
                : state.status === 'ringing'
                ? 'Ringing…'
                : callTimeLabel
                ? `On call • ${callTimeLabel}`
                : 'Voice call'}
            </p>
            <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
            <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
          </div>
        )}

        {showTopBar && (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-4 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
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
      </div>

      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3">
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
              !speakerOn,
              onToggleSpeaker,
              speakerOn ? 'Speaker off' : 'Speaker on',
              speakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />
            )}
            {onMinimize && !state.incoming && !state.preparing && (
              <button
                type="button"
                onClick={onMinimize}
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
    </div>
  );
}

