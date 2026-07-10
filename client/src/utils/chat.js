function parseSafeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (e) {
      return null;
    }
  }
  if (typeof value === 'object') {
    if (typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    if (typeof value._seconds === 'number') {
      return new Date(value._seconds * 1000);
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(value) {
  const date = parseSafeDate(value);
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(date);
  } catch (err) {
    return '';
  }
}

export function directPeer(chat, me) {
  return chat?.participants?.find((participant) => participant.user._id !== me?._id)?.user;
}

export function chatTitle(chat, me) {
  if (!chat) return 'AquaChat';
  if (chat.type === 'group') return chat.name;
  const peer = directPeer(chat, me);
  return peer?.displayName || peer?.phoneNumber || 'New chat';
}

export function chatImage(chat, me) {
  if (chat?.type === 'group') return chat.avatarUrl;
  return directPeer(chat, me)?.photoURL;
}

export function formatLastSeen(value) {
  const date = parseSafeDate(value);
  if (!date) return 'offline';

  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 45_000) return 'last seen just now';
  if (diffMs < 300_000) return 'last seen recently';
  if (diffMs < 3_600_000) {
    const mins = Math.max(1, Math.floor(diffMs / 60_000));
    return `last seen ${mins} min ago`;
  }

  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return `last seen today at ${formatTime(date)}`;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `last seen yesterday at ${formatTime(date)}`;
  }

  const datePart = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `last seen ${datePart} at ${formatTime(date)}`;
}

export function statusText(user) {
  if (user?.isOnline || user?.online) return 'online';
  return formatLastSeen(user?.lastSeen);
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 3) {
    return `${localPart[0] || ''}****@${domain}`;
  }
  return `${localPart.slice(0, 3)}****@${domain}`;
}
