const messageLine = (message) => {
  const name = message.sender?.displayName || message.senderId || 'User';
  const time = message.createdAt ? new Date(message.createdAt).toLocaleString() : '';
  if (message.deletedForEveryone) return `[${time}] ${name}: [deleted]`;
  const body = message.body || message.fileName || `[${message.type || 'message'}]`;
  const media = message.mediaUrl ? ` ${message.mediaUrl}` : '';
  return `[${time}] ${name}: ${body}${media}`;
};

export const formatChatExportTxt = (chatTitle, messages) => {
  const header = `AquaChat export — ${chatTitle}\nExported: ${new Date().toLocaleString()}\n${'—'.repeat(40)}\n\n`;
  const body = messages.map((m) => messageLine(m)).join('\n');
  return `${header}${body}\n`;
};

export const formatChatExportJson = (chat, messages, me) => ({
  exportedAt: new Date().toISOString(),
  chat: { id: chat._id, title: chat.name || chatTitleFromChat(chat, me), type: chat.type },
  messages: messages.map((m) => ({
    id: m._id,
    senderId: m.senderId,
    senderName: m.sender?.displayName || m.senderId,
    type: m.type,
    body: m.body || '',
    mediaUrl: m.mediaUrl || '',
    fileName: m.fileName || '',
    createdAt: m.createdAt,
    clientCreatedAt: m.clientCreatedAt
  }))
});

const chatTitleFromChat = (chat, me) => {
  if (chat.type === 'group') return chat.name || 'Group';
  const peer = chat.participants?.find((p) => p.user._id !== me?._id)?.user;
  return peer?.displayName || 'Chat';
};

export const downloadTextFile = (filename, content, mime = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const downloadChatExport = (chat, messages, me, format) => {
  const title = chatTitleFromChat(chat, me).replace(/[^\w\s-]/g, '').trim() || 'chat';
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    const json = JSON.stringify(formatChatExportJson(chat, messages, me), null, 2);
    downloadTextFile(`${title}-${stamp}.json`, json, 'application/json');
    return;
  }
  downloadTextFile(`${title}-${stamp}.txt`, formatChatExportTxt(title, messages));
};
