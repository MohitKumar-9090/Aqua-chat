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

export function formatLastSeen(value) {
  if (!value) return 'offline';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'offline';

  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 45_000) return 'last seen just now';
  if (diffMs < 3_600_000) {
    const mins = Math.max(1, Math.floor(diffMs / 60_000));
    return `last seen ${mins} min ago`;
  }

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return `last seen today at ${formatTime(value)}`;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `last seen yesterday at ${formatTime(value)}`;
  }

  const datePart = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `last seen ${datePart} at ${formatTime(value)}`;
}

export function statusText(user) {
  if (user?.isOnline || user?.online) return 'online';
  return formatLastSeen(user?.lastSeen);
}
