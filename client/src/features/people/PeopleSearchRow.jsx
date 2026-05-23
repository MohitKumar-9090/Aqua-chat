import { memo } from 'react';
import { BadgeCheck, MessageCircle, UserCheck, UserPlus } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { statusText } from '../../utils/chat.js';

function PeopleSearchRow({ user, connecting, onConnect, onAccept, onFollow, onMessage }) {
  const connectionLabel = connecting
    ? 'Connecting...'
    : user.connectionStatus === 'connected'
      ? 'Connected'
      : user.connectionStatus === 'incoming'
        ? 'Accept'
        : user.connectionStatus === 'requested'
          ? 'Requested'
          : 'Connect';
  const connectionIcon = user.connectionStatus === 'connected' ? UserCheck : UserPlus;
  const ConnectionIcon = connectionIcon;
  const canConnect = user.connectionStatus !== 'connected' && user.connectionStatus !== 'requested';
  const preview = user.lastMessagePreview || user.email || user.phoneNumber || user.bio || statusText(user);

  const handleConnect = () => {
    if (connecting) return;
    if (user.connectionStatus === 'incoming') return onAccept(user);
    if (user.connectionStatus === 'connected') return onMessage(user._id);
    if (canConnect) return onConnect(user);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onMessage(user._id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onMessage(user._id);
      }}
      className="w-full cursor-pointer rounded-2xl border border-transparent p-3 text-left transition duration-200 hover:border-blush-100/50 hover:bg-blush-50/60"
    >
      <div className="flex items-start gap-3">
        <Avatar user={user} online={user.isOnline} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-bold text-cyan-950">{user.displayName}</h3>
            {user.verified && <BadgeCheck size={15} className="shrink-0 fill-cyan-500 text-white" />}
            {user.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black text-white">{user.unreadCount}</span>}
          </div>
          <p className="truncate text-sm text-slate-500">@{user.username || 'username'} - {statusText(user)}</p>
          <p className="truncate text-xs text-slate-400">{preview}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleConnect();
              }}
              disabled={connecting || (!canConnect && user.connectionStatus !== 'incoming' && user.connectionStatus !== 'connected')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                user.connectionStatus === 'connected'
                  ? 'bg-emerald-50 text-emerald-700'
                  : user.connectionStatus === 'requested'
                    ? 'bg-slate-100 text-slate-500'
                    : 'bg-cyan-500 text-white hover:bg-cyan-600'
              } disabled:cursor-default disabled:opacity-70`}
            >
              <ConnectionIcon size={14} />
              {connectionLabel}
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onMessage(user._id); }} className="inline-flex items-center gap-1.5 rounded-xl bg-aqua-50 px-3 py-1.5 text-xs font-black text-cyan-800 transition hover:bg-aqua-100">
              <MessageCircle size={14} />
              Message
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onFollow(user); }} className="rounded-xl bg-blush-50 px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-blush-100">
              {user.isFollowing ? 'Following' : user.followsMe ? 'Follow back' : 'Follow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PeopleSearchRow);
