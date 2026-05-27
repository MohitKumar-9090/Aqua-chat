import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';
import { markStatusViewedLocal } from '../../utils/statusViewed.js';
import { auth } from '../../firebase.js';

export default function StatusViewer({ bundle, meId, onClose, onDeleteStatus }) {
  const [index, setIndex] = useState(0);
  const [deletedIds, setDeletedIds] = useState(() => new Set());
  const items = (bundle?.items || []).filter((item) => !deletedIds.has(item._id));

  useEffect(() => {
    setIndex(0);
    setDeletedIds(new Set());
  }, [bundle?.userId]);

  useEffect(() => {
    if (!current?._id) return;
    markStatusViewedLocal(current._id);
    api.markStatusSeen(current._id).catch(console.error);
  }, [current?._id]);

  useEffect(() => {
    if (!current) return undefined;
    const duration = current.type === 'video' ? 15000 : 5500;
    const timer = setTimeout(() => {
      if (index < items.length - 1) setIndex((value) => value + 1);
      else onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [current, index, items.length, onClose]);

  if (!bundle || !current) return null;

  const media = current.statusMedia || current.mediaUrl;
  const text = current.statusText || current.caption || '';

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (index < items.length - 1) setIndex((i) => i + 1);
    else onClose();
  };
  const currentUid = String(auth.currentUser?.uid || meId || '').trim();
  const ownerUid = String(
    current?.userId ||
    current?.ownerId ||
    current?.uid ||
    bundle?.userId ||
    ''
  ).trim();
  const mine = currentUid === ownerUid;
  const deleteCurrent = async () => {
    if (!current?._id || !mine) return;
    await onDeleteStatus?.(current._id);
    setDeletedIds((currentIds) => new Set([...currentIds, current._id]));
    if (items.length <= 1) {
      onClose();
      return;
    }
    setIndex((value) => Math.min(value, items.length - 2));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-cyan-950 via-cyan-900 to-cyan-950">
      <div className="absolute inset-x-0 top-0 z-10 flex gap-1 px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        {items.map((item, itemIndex) => (
          <span
            key={item._id}
            className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25"
          >
            <span
              className={`block h-full rounded-full bg-white transition-all duration-300 ${
                itemIndex < index ? 'w-full' : itemIndex === index ? 'w-full animate-pulse' : 'w-0'
              }`}
            />
          </span>
        ))}
      </div>

      <div className="relative z-10 flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <Avatar user={bundle.user} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{bundle.user?.displayName || 'Status'}</p>
          <p className="text-xs text-cyan-200/90">
            {new Date(current.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white/90 hover:bg-white/10">
          <X size={22} />
        </button>
        {mine && (
          <button type="button" onClick={deleteCurrent} className="rounded-full p-2 text-white/90 hover:bg-white/10" title="Delete status">
            <Trash2 size={20} />
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <button type="button" className="absolute left-0 z-10 h-full w-1/4" onClick={goPrev} aria-label="Previous" />
        <button type="button" className="absolute right-0 z-10 h-full w-1/4" onClick={goNext} aria-label="Next" />

        <div className="relative max-h-full max-w-full px-4">
          {current.type === 'image' && media ? (
            <img src={media} alt="" className="max-h-[70dvh] max-w-full rounded-xl object-contain shadow-2xl" />
          ) : current.type === 'video' && media ? (
            <video src={media} controls autoPlay playsInline className="max-h-[70dvh] max-w-full rounded-xl" />
          ) : (
            <p className="max-w-md px-6 text-center text-2xl font-semibold leading-relaxed text-white drop-shadow-lg">
              {text}
            </p>
          )}
          {text && current.type !== 'text' && (
            <p className="mt-4 text-center text-sm font-medium text-white/90">{text}</p>
          )}
        </div>

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white disabled:opacity-30"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
