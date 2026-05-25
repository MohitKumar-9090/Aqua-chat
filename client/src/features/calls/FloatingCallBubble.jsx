import { useState, useRef, useEffect } from 'react';
import Avatar from '../../components/Avatar.jsx';
import { Maximize2, MicOff } from 'lucide-react';

export default function FloatingCallBubble({
  callState,
  localVideoRef,
  remoteVideoRef,
  callTimer,
  remoteParticipants,
  onRestore
}) {
  const [position, setPosition] = useState({ x: window.innerWidth - 180, y: 80 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const elementStartRef = useRef({ x: 0, y: 0 });
  const bubbleRef = useRef(null);

  // Recalculate position if window is resized to keep bubble within viewport
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const x = Math.max(10, Math.min(window.innerWidth - 170, prev.x));
        const y = Math.max(10, Math.min(window.innerHeight - 230, prev.y));
        return { x, y };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e) => {
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

  const handleClick = (e) => {
    if (isDraggingRef.current) {
      e.preventDefault();
      return;
    }
    onRestore();
  };

  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isVideo = callState.callType === 'video';
  const activeParticipants = remoteParticipants?.filter((p) => p.hasStream) || [];
  const isGroupCall = callState.participants?.length > 1;

  return (
    <div
      ref={bubbleRef}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none'
      }}
      className="fixed z-[999] h-48 w-36 overflow-hidden rounded-3xl border border-white/30 bg-slate-900 shadow-2xl cursor-grab active:cursor-grabbing select-none"
    >
      {isVideo ? (
        <div className="relative h-full w-full">
          {/* Main Video Stream */}
          {isGroupCall ? (
            activeParticipants.length > 0 ? (
              <video
                ref={(el) => {
                  if (el && activeParticipants[0].videoRef) {
                    activeParticipants[0].videoRef.current = el;
                  }
                }}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-950 to-slate-900 px-2 text-center text-white">
                <Avatar name={callState.caller?.displayName || 'Group'} image={callState.caller?.photoURL} size="sm" />
                <span className="mt-1 text-[10px] text-cyan-300 font-semibold animate-pulse">Ringing...</span>
                <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
              </div>
            )
          ) : (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}

          {/* Picture in Picture Self Preview */}
          {!callState.cameraOff && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-2 right-2 z-10 h-14 w-10 rounded-lg border border-white/40 object-cover shadow-lg"
            />
          )}

          {/* Muted Indicator overlay */}
          {callState.muted && (
            <div className="absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/90 text-white backdrop-blur-xs">
              <MicOff size={11} />
            </div>
          )}

          {/* Restore Full Screen Overlay Button (visible on hover) */}
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <Maximize2 className="text-white drop-shadow-md" size={20} />
          </div>
        </div>
      ) : (
        /* Voice Call Layout */
        <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-cyan-600 to-indigo-900 text-white px-2 text-center">
          <div className="relative">
            <div className="absolute -inset-1.5 animate-ping rounded-full bg-emerald-500/30" />
            <Avatar name={callState.caller?.displayName} image={callState.caller?.photoURL} size="md" />
          </div>
          <span className="mt-2 block max-w-[120px] truncate text-[11px] font-bold">
            {callState.caller?.displayName || 'Active Call'}
          </span>
          <span className="text-[10px] text-emerald-300 font-semibold mt-0.5">
            {callState.status === 'connected' ? formatDuration(callTimer) : 'Connecting...'}
          </span>

          {/* Mount refs hidden to keep connection streams alive */}
          <video ref={remoteVideoRef} autoPlay playsInline muted className="hidden" />
          <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />

          {/* Restore Full Screen Overlay (visible on hover) */}
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <Maximize2 className="text-white drop-shadow-md" size={20} />
          </div>
        </div>
      )}
    </div>
  );
}
