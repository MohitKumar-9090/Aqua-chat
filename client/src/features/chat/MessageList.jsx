import { memo, useEffect, useRef } from 'react';
import { CheckCheck } from 'lucide-react';
import { formatTime } from '../../utils/chat.js';

function MediaMessage({ message }) {
  if (message.type === 'image') return <img src={message.mediaUrl} alt="" className="mb-2 max-h-72 rounded-2xl object-cover" />;
  if (message.type === 'video') return <video src={message.mediaUrl} controls className="mb-2 max-h-72 rounded-2xl" />;
  return <audio src={message.mediaUrl} controls className="mb-2 w-64 max-w-full" />;
}

function MessageList({ messages, me }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div ref={containerRef} className="message-texture min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:gap-3">
        {messages.map((message) => {
          const mine = message.sender?._id === me._id || message.senderId === me._id;
          return (
            <div key={message._id} className={`flex animate-floatIn ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] sm:max-w-[85%] rounded-2xl px-4 py-2.5 shadow-soft sm:px-5 sm:py-3 ${mine ? 'rounded-br-md bg-gradient-to-br from-cyan-500 to-aqua-400 text-white' : 'rounded-bl-md border border-aqua-100/60 bg-white text-slate-800'} ${message.pending ? 'opacity-80' : ''}`}>
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

export default memo(MessageList);
