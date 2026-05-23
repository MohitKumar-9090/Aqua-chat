import { useEffect, useRef } from 'react';
import { Ban, Download, FileJson, FileText, Search, UserCheck } from 'lucide-react';

export default function ChatOptionsMenu({
  open,
  anchorRef,
  onClose,
  isDirect,
  isBlocked,
  onSearch,
  onToggleBlock,
  onDownloadTxt,
  onDownloadJson
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (menuRef.current?.contains(event.target) || anchorRef?.current?.contains(event.target)) return;
      onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const itemClass =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-aqua-50';

  return (
    <div
      ref={menuRef}
      className="absolute right-2 top-full z-30 mt-1 min-w-[220px] animate-pop overflow-hidden rounded-2xl border border-aqua-100/80 bg-white py-1.5 shadow-soft-lg sm:right-3"
    >
      <button type="button" className={itemClass} onClick={onSearch}>
        <Search size={18} className="text-cyan-600" />
        Search messages
      </button>
      {isDirect && (
        <button type="button" className={itemClass} onClick={onToggleBlock}>
          {isBlocked ? <UserCheck size={18} className="text-emerald-600" /> : <Ban size={18} className="text-rose-600" />}
          {isBlocked ? 'Unblock user' : 'Block user'}
        </button>
      )}
      <button type="button" className={itemClass} onClick={onDownloadTxt}>
        <FileText size={18} className="text-cyan-600" />
        Download chat (.txt)
      </button>
      <button type="button" className={itemClass} onClick={onDownloadJson}>
        <FileJson size={18} className="text-cyan-600" />
        Download chat (.json)
      </button>
    </div>
  );
}
