import { Copy, CornerUpLeft, Trash2, X } from 'lucide-react';

export default function MessageActionsMenu({
  message,
  mine,
  position,
  onClose,
  onReply,
  onCopy,
  onDeleteForMe,
  onDeleteForEveryone
}) {
  if (!message) return null;

  const text = message.deletedForEveryone
    ? ''
    : message.body || (message.type === 'image' ? 'Photo' : message.type === 'video' ? 'Video' : message.fileName || '');

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-black/20" onClick={onClose} aria-label="Close menu" />
      <div
        className="fixed z-[60] min-w-[200px] animate-pop overflow-hidden rounded-2xl border border-aqua-100 bg-white py-1 shadow-soft-xl"
        style={{ top: position.top, left: position.left }}
        role="menu"
      >
        {text && (
          <button type="button" role="menuitem" onClick={() => { onCopy(text); onClose(); }} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-aqua-50">
            <Copy size={16} />
            Copy
          </button>
        )}
        {!message.deletedForEveryone && (
          <button type="button" role="menuitem" onClick={() => { onReply(message); onClose(); }} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-aqua-50">
            <CornerUpLeft size={16} />
            Reply
          </button>
        )}
        <button type="button" role="menuitem" onClick={() => { onDeleteForMe(message); onClose(); }} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-aqua-50">
          <Trash2 size={16} />
          Delete for me
        </button>
        {mine && !message.deletedForEveryone && (
          <button type="button" role="menuitem" onClick={() => { onDeleteForEveryone(message); onClose(); }} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">
            <Trash2 size={16} />
            Delete for everyone
          </button>
        )}
        <button type="button" role="menuitem" onClick={onClose} className="flex w-full items-center gap-3 border-t border-aqua-50 px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-aqua-50">
          <X size={16} />
          Cancel
        </button>
      </div>
    </>
  );
}
