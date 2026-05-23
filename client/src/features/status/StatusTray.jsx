import { useRef } from 'react';
import { Plus } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';

export default function StatusTray({ statuses, onCreate, me }) {
  const inputRef = useRef(null);
  const grouped = statuses.slice(0, 12);

  return (
    <div className="flex gap-3 overflow-x-auto border-b border-aqua-100/40 px-3 py-4 scrollbar-hide">
      <button onClick={() => inputRef.current?.click()} className="flex w-16 shrink-0 flex-col items-center gap-2">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-aqua-400 text-white shadow-lg shadow-cyan-200/50 transition hover:shadow-cyan-300/70">
          <Plus size={22} />
        </div>
        <span className="w-full truncate text-xs font-bold text-cyan-900 text-center">Status</span>
        <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onCreate(e.target.files?.[0])} />
      </button>
      <button onClick={() => onCreate()} className="flex w-16 shrink-0 flex-col items-center gap-2">
        <Avatar user={me} size="lg" />
        <span className="w-full truncate text-xs font-bold text-cyan-900 text-center">Text</span>
      </button>
      {grouped.map((status) => (
        <button 
          key={status._id} 
          onClick={() => api.markStatusSeen(status._id)} 
          className="flex w-16 shrink-0 flex-col items-center gap-2 transition duration-200 hover:scale-105"
        >
          <div className="rounded-2xl bg-gradient-to-br from-cyan-400 to-aqua-300 p-1 ring-2 ring-cyan-400/30">
            <Avatar user={status.user} size="lg" />
          </div>
          <span className="w-full truncate text-xs font-bold text-cyan-900 text-center">{status.user.displayName}</span>
        </button>
      ))}
    </div>
  );
}
