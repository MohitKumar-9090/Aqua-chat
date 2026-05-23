import { useCallback, useMemo, useState } from 'react';
import { success as toastSuccess, error as toastError } from '../../utils/toast.js';
import ChatHeader from './ChatHeader.jsx';
import ChatSelectionBar from './ChatSelectionBar.jsx';
import Composer from './Composer.jsx';
import MessageActionsMenu from './MessageActionsMenu.jsx';
import MessageList from './MessageList.jsx';

export default function ChatPanel({
  chat,
  me,
  messages,
  sendEpoch = 0,
  statuses = [],
  typing,
  isMobile,
  onBack,
  onAudio,
  onVideo,
  onSend,
  onUpload,
  onDeleteForMe,
  onDeleteForEveryone,
  onBulkDeleteForMe
}) {
  const meId = me._id || me.uid;
  const [replyTo, setReplyTo] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [actionMenu, setActionMenu] = useState(null);

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedIds.has(message._id)),
    [messages, selectedIds]
  );

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((messageId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess('Copied to clipboard');
    } catch {
      toastError('Could not copy message');
    }
  };

  const handleCopySelected = async () => {
    const lines = selectedMessages
      .filter((m) => !m.deletedForEveryone)
      .map((m) => m.body || m.fileName || `[${m.type}]`)
      .filter(Boolean);
    if (!lines.length) return;
    await copyText(lines.join('\n'));
    clearSelection();
  };

  const handleDeleteSelected = async () => {
    try {
      await onBulkDeleteForMe(chat._id, [...selectedIds]);
      toastSuccess('Messages deleted');
      clearSelection();
    } catch (err) {
      toastError(err.message || 'Could not delete messages');
    }
  };

  const handleDeleteForMe = async (message) => {
    try {
      await onDeleteForMe(chat._id, message._id);
      toastSuccess('Message deleted for you');
    } catch (err) {
      toastError(err.message || 'Could not delete message');
    }
  };

  const handleDeleteForEveryone = async (message) => {
    try {
      await onDeleteForEveryone(chat._id, message._id);
      toastSuccess('Message deleted for everyone');
    } catch (err) {
      toastError(err.message || 'Could not delete message');
    }
  };

  const actionMessage = actionMenu?.message;
  const actionMine = actionMessage && (actionMessage.senderId === meId || actionMessage.sender?._id === meId);

  return (
    <>
      {selectionMode ? (
        <ChatSelectionBar
          count={selectedIds.size}
          onCopy={handleCopySelected}
          onDelete={handleDeleteSelected}
          onClear={clearSelection}
        />
      ) : (
        <ChatHeader chat={chat} me={me} typing={typing} statuses={statuses} onBack={onBack} onAudio={onAudio} onVideo={onVideo} />
      )}

      <MessageList
        messages={messages}
        me={me}
        chat={chat}
        sendEpoch={sendEpoch}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onEnterSelectionMode={(messageId) => {
          setSelectionMode(true);
          setSelectedIds(new Set([messageId]));
        }}
        onOpenActions={(message, position) => setActionMenu({ message, position })}
      />

      <Composer
        chat={chat}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSend={(payload) => {
          onSend({ ...payload, replyTo: replyTo ? {
            messageId: replyTo._id,
            body: replyTo.body || replyTo.fileName || replyTo.type,
            senderId: replyTo.senderId,
            type: replyTo.type,
            mediaUrl: replyTo.mediaUrl || ''
          } : null });
          setReplyTo(null);
        }}
        onUpload={onUpload}
        isMobile={isMobile}
      />

      {actionMenu && (
        <MessageActionsMenu
          message={actionMenu.message}
          mine={actionMine}
          position={actionMenu.position}
          onClose={() => setActionMenu(null)}
          onReply={setReplyTo}
          onCopy={copyText}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForEveryone={handleDeleteForEveryone}
        />
      )}
    </>
  );
}
