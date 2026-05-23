import { memo, useMemo } from 'react';
import { filterVisibleMessages } from '../../api.js';
import { useMessageScroll } from '../../hooks/useMessageScroll.js';
import { messageMatchesQuery } from '../../utils/highlightText.jsx';
import MessageBubble from './MessageBubble.jsx';

function MessageList({
  messages,
  me,
  chat,
  sendEpoch = 0,
  searchQuery = '',
  selectionMode,
  selectedIds,
  onToggleSelect,
  onOpenActions,
  onEnterSelectionMode
}) {
  const meId = me._id || me.uid;
  const visibleMessages = useMemo(() => {
    const visible = filterVisibleMessages(messages, meId);
    if (!searchQuery?.trim()) return visible;
    return visible.filter((message) => messageMatchesQuery(message, searchQuery));
  }, [messages, meId, searchQuery]);
  const { containerRef, bottomRef } = useMessageScroll(visibleMessages, chat?._id, sendEpoch);

  const clampMenuPosition = (point) => {
    const menuWidth = 220;
    const menuHeight = 260;
    const left = Math.min(Math.max(12, point.x - menuWidth / 2), window.innerWidth - menuWidth - 12);
    const top = Math.min(Math.max(12, point.y - 12), window.innerHeight - menuHeight - 12);
    return { left, top };
  };

  const handleLongPress = (message, point) => {
    if (selectionMode) {
      onToggleSelect(message._id);
      return;
    }
    onEnterSelectionMode?.(message._id);
    onOpenActions(message, clampMenuPosition(point));
  };

  const handleOpenActions = (message, point) => {
    onOpenActions(message, clampMenuPosition(point));
  };

  return (
    <div
      ref={containerRef}
      className="message-texture min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:gap-3">
        {searchQuery?.trim() && !visibleMessages.length && (
          <p className="py-8 text-center text-sm text-slate-500">No messages match your search.</p>
        )}
        {visibleMessages.map((message) => {
          const mine = message.sender?._id === meId || message.senderId === meId;
          return (
            <MessageBubble
              key={message.localKey || message._id}
              message={message}
              mine={mine}
              searchQuery={searchQuery}
              showSender={chat?.type === 'group'}
              selected={selectedIds.has(message._id)}
              selectionMode={selectionMode}
              onToggleSelect={onToggleSelect}
              onOpenActions={handleOpenActions}
              onLongPress={handleLongPress}
            />
          );
        })}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}

export default memo(MessageList);
