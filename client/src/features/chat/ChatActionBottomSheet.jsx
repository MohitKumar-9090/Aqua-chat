import { useEffect, useRef } from 'react';
import { LogOut, Trash2, UserMinus, X } from 'lucide-react';

export default function ChatActionBottomSheet({
  open,
  chat,
  amAdmin,
  onClose,
  onDisconnect,
  onDeleteChat,
  onExitGroup,
  onDeleteGroup
}) {
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !chat) return null;

  const isGroup = chat.type === 'group';

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
      />

      {/* Sheet / Modal Container */}
      <div className="fixed inset-0 z-[100] pointer-events-none flex items-end justify-center sm:items-center sm:p-4">
        {/* Mobile Bottom Sheet (slides up) */}
        <div 
          ref={sheetRef}
          className="pointer-events-auto w-full max-w-md bg-white rounded-t-3xl px-5 py-6 shadow-2xl transition-transform duration-300 animate-slide-up sm:hidden"
        >
          <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />
          
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-slate-900 truncate">
              {chat.name || 'Chat Actions'}
            </h3>
            <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-2">
            {!isGroup ? (
              <>
                <button
                  onClick={() => { onDisconnect(chat); onClose(); }}
                  className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 transition active:scale-[0.99]"
                >
                  <UserMinus size={18} className="text-amber-500" />
                  Disconnect User
                </button>
                <button
                  onClick={() => { onDeleteChat(chat); onClose(); }}
                  className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-bold text-rose-600 hover:bg-rose-50/50 transition active:scale-[0.99]"
                >
                  <Trash2 size={18} className="text-rose-500" />
                  Delete Chat
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { onExitGroup(chat); onClose(); }}
                  className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 transition active:scale-[0.99]"
                >
                  <LogOut size={18} className="text-amber-500" />
                  Exit Group
                </button>
                {amAdmin && (
                  <button
                    onClick={() => { onDeleteGroup(chat); onClose(); }}
                    className="w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-sm font-bold text-rose-600 hover:bg-rose-50/50 transition active:scale-[0.99]"
                  >
                    <Trash2 size={18} className="text-rose-500" />
                    Delete Group (Admin Only)
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Desktop Centered Card Modal */}
        <div 
          className="pointer-events-auto hidden sm:block w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-100/80 transform transition-all duration-300 scale-100 animate-pop"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-black text-slate-900 truncate">
              {chat.name || 'Chat Actions'}
            </h3>
            <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 transition">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-1.5">
            {!isGroup ? (
              <>
                <button
                  onClick={() => { onDisconnect(chat); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 transition active:scale-[0.99]"
                >
                  <UserMinus size={16} className="text-amber-500" />
                  Disconnect User
                </button>
                <button
                  onClick={() => { onDeleteChat(chat); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-bold text-rose-600 hover:bg-rose-50/50 transition active:scale-[0.99]"
                >
                  <Trash2 size={16} className="text-rose-500" />
                  Delete Chat
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { onExitGroup(chat); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 transition active:scale-[0.99]"
                >
                  <LogOut size={16} className="text-amber-500" />
                  Exit Group
                </button>
                {amAdmin && (
                  <button
                    onClick={() => { onDeleteGroup(chat); onClose(); }}
                    className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left text-sm font-bold text-rose-600 hover:bg-rose-50/50 transition active:scale-[0.99]"
                  >
                    <Trash2 size={16} className="text-rose-500" />
                    Delete Group
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
