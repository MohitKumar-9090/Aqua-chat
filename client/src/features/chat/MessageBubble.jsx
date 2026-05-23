import { memo, useState } from 'react';
import { CheckCheck, FileText, Loader2 } from 'lucide-react';
import { formatTime } from '../../utils/chat.js';
import { highlightText } from '../../utils/highlightText.jsx';
import { formatFileSize } from '../../utils/messageMedia.js';

function LazyImage({ src, alt, className }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative">
      {!loaded && <div className={`${className} animate-pulse bg-aqua-100/80`} />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`${className} ${loaded ? 'opacity-100' : 'absolute inset-0 h-0 w-0 opacity-0'}`}
      />
    </div>
  );
}

function MediaContent({ message }) {
  if (message.deletedForEveryone) return null;

  if (message.type === 'image' && message.mediaUrl) {
    return <LazyImage src={message.mediaUrl} alt="" className="mb-2 max-h-72 w-full rounded-2xl object-cover" />;
  }
  if (message.type === 'video' && message.mediaUrl) {
    return <video src={message.mediaUrl} controls preload="metadata" playsInline className="mb-2 max-h-72 w-full rounded-2xl bg-black/10" />;
  }
  if ((message.type === 'voice' || message.type === 'audio') && message.mediaUrl) {
    return <audio src={message.mediaUrl} controls preload="metadata" className="mb-2 w-full min-w-[200px] max-w-sm" />;
  }
  if (message.type === 'file' && message.mediaUrl) {
    return (
      <a
        href={message.mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="mb-2 flex items-center gap-3 rounded-2xl border border-white/20 bg-black/5 px-3 py-2.5 text-sm font-semibold"
      >
        <FileText size={20} className="shrink-0" />
        <span className="min-w-0 truncate">{message.fileName || 'Download file'}</span>
        {message.fileSize ? <span className="shrink-0 text-xs opacity-80">{formatFileSize(message.fileSize)}</span> : null}
      </a>
    );
  }
  return null;
}

function MessageBubble({
  message,
  mine,
  searchQuery = '',
  showSender,
  selected,
  selectionMode,
  onToggleSelect,
  onOpenActions,
  onLongPress
}) {
  const deleted = message.deletedForEveryone;
  const longPressTimer = { current: null };

  const startPress = (event) => {
    if (selectionMode || !event.touches?.length) return;
    const point = event.touches[0];
    longPressTimer.current = window.setTimeout(() => {
      onLongPress(message, { x: point.clientX, y: point.clientY });
    }, 420);
  };

  const endPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleClick = () => {
    if (selectionMode) onToggleSelect(message._id);
  };

  const handleContext = (event) => {
    event.preventDefault();
    if (selectionMode) return;
    onOpenActions(message, { x: event.clientX, y: event.clientY });
  };

  return (
    <div
      className={`flex animate-floatIn ${mine ? 'justify-end' : 'justify-start'}`}
      onClick={handleClick}
      onContextMenu={handleContext}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
    >
      {selectionMode && (
        <div className={`mr-2 flex items-center ${mine ? 'order-first' : ''}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300 bg-white'}`}>
            {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
          </span>
        </div>
      )}
      <div
        className={`max-w-[88%] sm:max-w-[85%] rounded-2xl px-4 py-2.5 shadow-soft sm:px-5 sm:py-3 ${
          mine
            ? `rounded-br-md bg-gradient-to-br from-cyan-500 to-aqua-400 text-white ${selected ? 'ring-2 ring-cyan-200' : ''}`
            : `rounded-bl-md border border-aqua-100/60 bg-white text-slate-800 ${selected ? 'ring-2 ring-cyan-300' : ''}`
        } ${message.pending ? 'opacity-80' : ''}`}
      >
        {showSender && !mine && <p className="mb-1.5 text-xs font-black text-cyan-600">{message.sender?.displayName}</p>}

        {message.replyTo && !deleted && (
          <div className={`mb-2 rounded-xl border-l-4 px-2.5 py-1.5 text-xs ${mine ? 'border-cyan-100/80 bg-white/15' : 'border-cyan-400 bg-aqua-50/80'}`}>
            <p className="font-bold opacity-90">Reply</p>
            <p className="truncate opacity-80">{message.replyTo.body || message.replyTo.type}</p>
          </div>
        )}

        {deleted ? (
          <p className={`text-sm italic ${mine ? 'text-cyan-50/90' : 'text-slate-500'}`}>This message was deleted</p>
        ) : (
          <>
            <MediaContent message={message} />
            {message.body && (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{highlightText(message.body, searchQuery)}</p>
            )}
          </>
        )}

        <div className={`mt-2 flex items-center justify-end gap-1.5 text-xs ${mine ? 'text-cyan-50' : 'text-slate-400'}`}>
          {message.pending && <Loader2 size={12} className="animate-spin" />}
          {formatTime(message.createdAt)}
          {mine && !message.pending && <CheckCheck size={13} className={message.status === 'seen' ? 'text-cyan-100' : 'text-cyan-200'} />}
        </div>
      </div>
    </div>
  );
}

export default memo(MessageBubble);
