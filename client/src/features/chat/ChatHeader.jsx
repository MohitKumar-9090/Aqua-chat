import { memo, useRef, useState } from 'react';
import { ArrowLeft, MoreVertical, Phone, Search, Video, X } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import ChatOptionsMenu from './ChatOptionsMenu.jsx';
import { chatImage, chatTitle, directPeer, statusText } from '../../utils/chat.js';
import { userHasUnviewedStatus } from '../../utils/statusHelpers.js';

function ChatHeader({
  chat,
  me,
  typing,
  statuses = [],
  searchOpen,
  searchQuery,
  onSearchOpen,
  onSearchQueryChange,
  onSearchClose,
  onBack,
  onAudio,
  onVideo,
  callsEnabled = true,
  isBlocked,
  onToggleBlock,
  onDownloadTxt,
  onDownloadJson,
  onDeleteGroup,
  onOpenGroupInfo
}) {
  const menuAnchorRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const peer = directPeer(chat, me);
  const peerStatusRing = peer && userHasUnviewedStatus(statuses, peer._id, me?._id);
  const showTyping = typing && chat.type === 'direct';

  if (searchOpen) {
    return (
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-aqua-100/40 bg-white/95 px-2 py-2 backdrop-blur-sm sm:px-3">
        <button type="button" onClick={onSearchClose} className="rounded-2xl p-2.5 text-cyan-700 hover:bg-aqua-100/60">
          <ArrowLeft size={22} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-aqua-200/70 bg-aqua-50/80 px-3 py-2">
          <Search size={18} className="shrink-0 text-cyan-600" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search in chat"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button type="button" onClick={() => onSearchQueryChange('')} className="rounded-full p-1 text-slate-500 hover:bg-white">
              <X size={16} />
            </button>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="relative sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-aqua-100/40 bg-white/90 px-2 py-3 backdrop-blur-sm sm:gap-3 sm:px-3 sm:py-4">
      <button type="button" onClick={onBack} aria-label="Back to chats" className="rounded-2xl p-2.5 text-cyan-700 transition duration-200 hover:bg-aqua-100/60 lg:hidden">
        <ArrowLeft size={22} />
      </button>
      <div 
        onClick={() => chat.type === 'group' && onOpenGroupInfo?.()}
        className={`flex min-w-0 flex-1 items-center gap-2 sm:gap-3 ${chat.type === 'group' ? 'cursor-pointer select-none' : ''}`}
      >
        <Avatar name={chatTitle(chat, me)} image={chatImage(chat, me)} online={callsEnabled && peer?.isOnline} statusRing={peerStatusRing} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-black text-cyan-950">{chatTitle(chat, me)}</h2>
          <p className="truncate text-xs font-medium text-slate-500">
            {showTyping ? `${typing.displayName} typing...` : chat.type === 'group' ? `${chat.participants.length} members` : callsEnabled ? statusText(peer) : 'offline'}
          </p>
        </div>
      </div>
      {chat.type === 'direct' && callsEnabled && (
        <>
          <button type="button" onClick={onAudio} className="rounded-2xl p-2.5 text-slate-600 transition hover:bg-aqua-100/60 hover:text-cyan-700" title="Voice call">
            <Phone size={18} />
          </button>
          <button type="button" onClick={onVideo} className="rounded-2xl p-2.5 text-slate-600 transition hover:bg-aqua-100/60 hover:text-cyan-700" title="Video call">
            <Video size={18} />
          </button>
        </>
      )}
      {chat.type === 'group' && callsEnabled && (
        <>
          <button type="button" onClick={onAudio} className="rounded-2xl p-2.5 text-slate-600 transition hover:bg-aqua-100/60 hover:text-cyan-700" title="Group voice call">
            <Phone size={18} />
          </button>
          <button type="button" onClick={onVideo} className="rounded-2xl p-2.5 text-slate-600 transition hover:bg-aqua-100/60 hover:text-cyan-700" title="Group video call">
            <Video size={18} />
          </button>
        </>
      )}
      <button
        ref={menuAnchorRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="rounded-2xl p-2.5 text-slate-600 transition hover:bg-aqua-100/60 hover:text-cyan-700"
        title="More"
      >
        <MoreVertical size={18} />
      </button>
      <ChatOptionsMenu
        open={menuOpen}
        anchorRef={menuAnchorRef}
        onClose={() => setMenuOpen(false)}
        isDirect={chat.type === 'direct'}
        isBlocked={isBlocked}
        amAdmin={chat.type === 'group' && (chat.createdBy === me?._id || chat.participants?.some((p) => p.user?._id === me?._id && p.role === 'admin'))}
        onSearch={() => {
          setMenuOpen(false);
          onSearchOpen();
        }}
        onToggleBlock={() => {
          setMenuOpen(false);
          onToggleBlock();
        }}
        onDownloadTxt={() => {
          setMenuOpen(false);
          onDownloadTxt();
        }}
        onDownloadJson={() => {
          setMenuOpen(false);
          onDownloadJson();
        }}
        onDeleteGroup={() => {
          setMenuOpen(false);
          onDeleteGroup();
        }}
      />
    </header>
  );
}

export default memo(ChatHeader);
