import { Copy, Trash2, X } from 'lucide-react';

export default function ChatSelectionBar({ count, onCopy, onDelete, onClear }) {
  return (
    <header className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-cyan-600/20 bg-gradient-to-r from-cyan-600 to-aqua-500 px-3 py-3 text-white shadow-md sm:px-4">
      <button type="button" onClick={onClear} className="rounded-xl p-2 hover:bg-white/15" aria-label="Cancel selection">
        <X size={20} />
      </button>
      <p className="min-w-0 flex-1 text-sm font-black">{count} selected</p>
      <button type="button" onClick={onCopy} className="rounded-xl p-2 hover:bg-white/15" title="Copy">
        <Copy size={18} />
      </button>
      <button type="button" onClick={onDelete} className="rounded-xl p-2 hover:bg-white/15" title="Delete">
        <Trash2 size={18} />
      </button>
    </header>
  );
}
