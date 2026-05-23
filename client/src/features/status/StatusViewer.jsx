import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';
import { markStatusViewedLocal } from '../../utils/statusViewed.js';

export default function StatusViewer({ bundle, onClose }) {
  const [index, setIndex] = useState(0);
  const items = bundle?.items || [];
  const current = items[index];

  useEffect(() => {
    setIndex(0);
  }, [bundle?.userId]);

  useEffect(() => {
    if (!current?._id) return;
    markStatusViewedLocal(current._id);
    api.markStatusSeen(current._id).catch(console.error);
  }, [current?._id]);

  useEffect(() => {
    if (!current) return undefined;
    const timer = setTimeout(() => {
      if (index < items.length - 1) setIndex((value) => value + 1);
      else onClose();
    }, 5500);
    return () => clearTimeout(timer);
  }, [current, index, items.length, onClose]);

  if (!bundle || !current) return null;

  const media = current.statusMedia || current.mediaUrl;
  const text = current.statusText || current.caption || '';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-cyan-950 to-cyan-900">
      <div className="flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <Avatar user={bundle.user} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{bundle.user?.displayName || 'Status'}</p>
          <p className="text-xs text-cyan-200">
            {index + 1} / {items.length}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white/90 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {current.type === 'image' && media ? (
          <img src={media} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        ) : current.type === 'video' && media ? (
          <video src={media} controls autoPlay playsInline className="max-h-full max-w-full rounded-2xl" />
        ) : (
          <p className="max-w-md px-6 text-center text-2xl font-semibold leading-relaxed text-white">{text}</p>
        )}
        {text && current.type !== 'text' && (
          <p className="absolute bottom-6 left-4 right-4 text-center text-sm text-white/90">{text}</p>
        )}
      </div>

      <div className="flex justify-center gap-1.5 px-4 pb-4">
        {items.map((item, itemIndex) => (
          <span
            key={item._id}
            className={`h-1 flex-1 max-w-12 rounded-full transition ${itemIndex <= index ? 'bg-white' : 'bg-white/30'}`}
          />
        ))}
      </div>
    </div>
  );
}
