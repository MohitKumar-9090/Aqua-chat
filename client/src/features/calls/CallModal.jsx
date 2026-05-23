import { useLayoutEffect } from 'react';
import { Mic, MicOff, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
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
  remoteMediaEpoch = 0
}) {
  const isVideo = state.callType === 'video';
  const showControls = !state.incoming || state.offer;

  useLayoutEffect(() => {
    const remote = remoteVideoRef.current;
    const local = localVideoRef.current;
    const audio = remoteAudioRef?.current;
    if (remote?.srcObject) remote.play().catch(() => {});
    if (local?.srcObject) local.play().catch(() => {});
    if (audio?.srcObject) audio.play().catch(() => {});
  }, [isVideo, state.preparing, state.incoming, state.offer, remoteMediaEpoch, localVideoRef, remoteVideoRef, remoteAudioRef]);

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-cyan-950 via-cyan-900 to-cyan-950">
      <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />

      <div className="relative min-h-0 flex-1">
        {isVideo ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
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
              {state.preparing ? 'Connecting…' : state.incoming ? 'Incoming call' : 'Voice call'}
            </p>
            <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
            <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
          </div>
        )}

        {!isVideo && (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-4 pb-8 pt-[max(env(safe-area-inset-top),1rem)]">
            <p className="text-center text-sm font-semibold text-cyan-100">
              {state.preparing ? 'Connecting via secure relay…' : state.incoming ? 'Incoming call' : 'On call'}
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3">
        {state.incoming && !state.offer && (
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
              className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/40"
            >
              Answer
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
