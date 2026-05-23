import { memo } from 'react';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { chatImage, chatTitle, directPeer, statusText } from '../../utils/chat.js';

function ChatHeader({ chat, me, typing, onBack, onAudio, onVideo }) {
  const peer = directPeer(chat, me);

  return (
    <header className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-aqua-100/40 bg-white/90 px-2 py-3 backdrop-blur-sm sm:gap-3 sm:px-3 sm:py-4">
      <button type="button" onClick={onBack} aria-label="Back to chats" className="rounded-2xl p-2.5 text-cyan-700 transition duration-200 hover:bg-aqua-100/60 lg:hidden">
        <ArrowLeft size={22} />
      </button>
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

export default memo(ChatHeader);
