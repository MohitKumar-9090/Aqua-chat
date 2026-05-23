import Avatar from '../../components/Avatar.jsx';

export default function CallModal({ state, localVideoRef, remoteVideoRef, onAnswer, onEnd }) {
  const isVideo = state.callType === 'video';

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-gradient-to-br from-cyan-950/90 to-cyan-900/90 p-3 backdrop-blur-sm sm:p-4">
      <div className="w-full max-w-3xl animate-pop overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-950 to-cyan-900 text-white shadow-soft-xl">
        <div className={`grid min-h-[50dvh] bg-gradient-to-br from-cyan-900 to-cyan-950 ${isVideo ? 'sm:grid-cols-2' : 'place-items-center'}`}>
          {isVideo ? (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-48 w-full bg-cyan-950 object-cover sm:min-h-64" />
              <video ref={localVideoRef} autoPlay muted playsInline className="h-full min-h-48 w-full bg-cyan-800 object-cover sm:min-h-64" />
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8">
              <Avatar user={state.caller} size="xl" />
              <p className="text-sm text-cyan-200">Voice call in progress</p>
              <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
              <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-cyan-950 to-cyan-900/80 px-6 py-5 border-t border-cyan-800/30">
          <div>
            <h2 className="text-lg font-black text-white">{state.caller?.displayName || 'Call'}</h2>
            <p className="text-sm text-cyan-200">
              {state.preparing
                ? 'Connecting via secure relay...'
                : state.callType === 'video'
                  ? 'Video call'
                  : 'Voice call'}
            </p>
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
