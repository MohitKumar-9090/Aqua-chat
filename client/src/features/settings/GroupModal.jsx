import { useState } from 'react';
import { X } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';

export default function GroupModal({ users, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);

  const toggle = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const submit = async (event) => {
    event.preventDefault();
    const { chat } = await api.createGroupChat({ name, memberIds: selected });
    onCreated(chat);
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-end bg-gradient-to-tr from-cyan-950/40 to-aqua-950/20 p-3 backdrop-blur-sm sm:place-items-center">
      <form onSubmit={submit} className="w-full max-w-md animate-pop rounded-3xl border border-white/60 bg-white/95 p-6 shadow-soft-lg backdrop-blur-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-black text-cyan-950">New group</h2>
          <button type="button" onClick={onClose} className="rounded-2xl p-2 text-slate-500 transition duration-200 hover:bg-aqua-100/60"><X size={20} /></button>
        </div>
        <input 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          placeholder="Group name" 
          className="mb-4 w-full rounded-2xl border border-aqua-100/60 bg-white px-5 py-3 text-sm placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft" 
        />
        <div className="max-h-72 overflow-y-auto space-y-1 mb-6">
          {users.map((user) => (
            <label key={user._id} className="flex cursor-pointer items-center gap-3 rounded-2xl p-3 transition duration-200 hover:bg-aqua-50/60">
              <input type="checkbox" checked={selected.includes(user._id)} onChange={() => toggle(user._id)} className="h-4 w-4 accent-cyan-500 rounded" />
              <Avatar user={user} size="sm" />
              <span className="font-bold text-cyan-950 text-sm">{user.displayName}</span>
            </label>
          ))}
        </div>
        <button 
          className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 py-3 font-bold text-white shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-50 disabled:shadow-none" 
          disabled={!name.trim()}
        >
          Create
        </button>
      </form>
    </div>
  );
}
