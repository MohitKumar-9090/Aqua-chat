import { useCallback, useMemo, useState } from 'react';
import { directPeer } from '../../utils/chat.js';
import { downloadChatExport } from '../../utils/chatExport.js';
import { success as toastSuccess, error as toastError } from '../../utils/toast.js';
import { api, canContactUser } from '../../api.js';
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
  blockState,
  isMobile,
  onBack,
  onAudio,
  onVideo,
  onSend,
  onUpload,
  onDeleteForMe,
  onDeleteForEveryone,
  onBulkDeleteForMe,
  onDeleteGroup,
  onOpenGroupInfo,
  onOpenUserInfo
}) {
  const meId = me._id || me.uid;
  const peer = useMemo(() => directPeer(chat, me), [chat, me]);
  const contactAllowed = chat.type !== 'direct' || canContactUser(blockState, peer?._id);
  const isBlocked = Boolean(peer?._id && blockState?.blocked?.has(peer._id));

  const [replyTo, setReplyTo] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [actionMenu, setActionMenu] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleToggleBlock = async () => {
    if (!peer?._id) return;
    try {
      if (isBlocked) {
        await api.unblockUser(peer._id);
        toastSuccess('User unblocked');
      } else {
        await api.blockUser(peer._id);
        toastSuccess('User blocked');
      }
    } catch (err) {
      toastError(err.message || 'Could not update block status.');
    }
  };

  const handleDownload = async (format) => {
    try {
      const { messages: history } = await api.exportChatHistory(chat._id);
      const exportChat = {
        _id: chat._id,
        type: chat.type,
        name: chat.name,
        participants: chat.participants
      };
      downloadChatExport(exportChat, history, me, format);
      toastSuccess('Chat downloaded');
    } catch (err) {
      toastError(err.message || 'Could not download chat.');
    }
  };

  const actionMessage = actionMenu?.message;
  const actionMine = actionMessage && (actionMessage.senderId === meId || actionMessage.sender?._id === meId);
  const showTyping = contactAllowed ? typing : null;

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
        <ChatHeader
          chat={chat}
          me={me}
          typing={showTyping}
          statuses={statuses}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          onSearchOpen={() => setSearchOpen(true)}
          onSearchQueryChange={setSearchQuery}
          onSearchClose={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
          onBack={onBack}
          onAudio={onAudio}
          onVideo={onVideo}
          callsEnabled={contactAllowed}
          isBlocked={isBlocked}
          onToggleBlock={handleToggleBlock}
          onDownloadTxt={() => handleDownload('txt')}
          onDownloadJson={() => handleDownload('json')}
          onDeleteGroup={onDeleteGroup}
          onOpenGroupInfo={onOpenGroupInfo}
          onOpenUserInfo={onOpenUserInfo}
        />
      )}

      <MessageList
        messages={messages}
        me={me}
        chat={chat}
        sendEpoch={sendEpoch}
        searchQuery={searchOpen ? searchQuery : ''}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onEnterSelectionMode={(messageId) => {
          setSelectionMode(true);
          setSelectedIds(new Set([messageId]));
        }}
        onOpenActions={(message, position) => setActionMenu({ message, position })}
      />

      {!contactAllowed && chat.type === 'direct' && (
        <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-center text-xs font-semibold text-rose-700">
          {isBlocked ? 'You blocked this user. Unblock to message or call.' : 'You cannot message or call this user.'}
        </p>
      )}

      <Composer
        chat={chat}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        disabled={!contactAllowed}
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
