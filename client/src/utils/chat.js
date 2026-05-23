export function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function directPeer(chat, me) {
  return chat?.participants?.find((participant) => participant.user._id !== me?._id)?.user;
}

export function chatTitle(chat, me) {
  if (!chat) return 'AquaChat';
  if (chat.type === 'group') return chat.name;
  const peer = directPeer(chat, me);
  return peer?.displayName || peer?.email || peer?.phoneNumber || 'New chat';
}

export function chatImage(chat, me) {
  if (chat?.type === 'group') return chat.avatarUrl;
  return directPeer(chat, me)?.photoURL;
}

export function statusText(user) {
  if (user?.isOnline) return 'online';
  return user?.lastSeen ? `last seen ${formatTime(user.lastSeen)}` : 'offline';
}
