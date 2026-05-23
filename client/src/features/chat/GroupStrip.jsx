import { api } from '../../api.js';

export default function GroupStrip({ chat, me, users, onRefresh }) {
  const amAdmin = chat.participants.some((participant) => participant.user._id === me._id && participant.role === 'admin');
  if (!amAdmin) return null;

  const addable = users.filter((user) => !chat.participants.some((participant) => participant.user._id === user._id));

  return (
    <div className="hidden border-t border-aqua-100/40 bg-gradient-to-t from-aqua-25/50 to-white/95 px-4 py-3 lg:block backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 overflow-x-auto scrollbar-hide">
        {addable.slice(0, 8).map((user) => (
          <button 
            key={user._id} 
            onClick={async () => { await api.addMembers(chat._id, [user._id]); await onRefresh(); }} 
            className="shrink-0 rounded-2xl bg-gradient-to-r from-aqua-100/60 to-cyan-100/50 px-4 py-2.5 text-xs font-bold text-cyan-700 transition duration-200 hover:from-aqua-100/80 hover:to-cyan-100/70 border border-aqua-200/40"
          >
            + {user.displayName}
          </button>
        ))}
        {chat.participants.filter((participant) => participant.user._id !== me._id).map((participant) => (
          <button 
            key={participant.user._id} 
            onClick={async () => { await api.removeMember(chat._id, participant.user._id); await onRefresh(); }} 
            className="shrink-0 rounded-2xl bg-gradient-to-r from-rose-100/60 to-blush-100/50 px-4 py-2.5 text-xs font-bold text-rose-600 transition duration-200 hover:from-rose-100/80 hover:to-blush-100/70 border border-rose-200/40"
          >
            ✕ {participant.user.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
