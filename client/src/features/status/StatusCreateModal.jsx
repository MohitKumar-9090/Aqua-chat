import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Type, Video, X } from 'lucide-react';
import { detectMessageType } from '../../utils/messageMedia.js';

const TABS = [
  { id: 'text', label: 'Text', icon: Type },
  { id: 'image', label: 'Photo', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video }
];

export default function StatusCreateModal({ open, onClose, onSubmit }) {
  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTab('text');
    setText('');
    setFile(null);
    setCaption('');
    setProgress(0);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pickFile = (picked, mode) => {
    if (!picked) return;
    const kind = detectMessageType(picked);
    if (tab === 'image' && kind !== 'image') return;
    if (tab === 'video' && kind !== 'video') return;
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    if (mode === 'camera') cameraRef.current && (cameraRef.current.value = '');
    if (mode === 'gallery') galleryRef.current && (galleryRef.current.value = '');
  };

  const clearMedia = () => {
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl('');
    setCaption('');
  };

  const submit = async () => {
    if (busy || !canPost) return;
    setBusy(true);
    setProgress(0);
    try {
      if (tab === 'text') {
        await onSubmit({ type: 'text', statusText: text.trim() });
      } else {
        await onSubmit({
          type: tab === 'video' ? 'video' : 'image',
          file,
          statusText: caption.trim(),
          onProgress: setProgress
        });
      }
      onClose();
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  if (!open) return null;

  const canPost = tab === 'text' ? Boolean(text.trim()) : Boolean(file);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gradient-to-tr from-cyan-950/50 to-aqua-950/30 p-0 backdrop-blur-md sm:items-center sm:p-4">
      <div className="animate-pop flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/50 bg-white/95 shadow-soft-xl backdrop-blur-xl sm:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-aqua-100/60 px-5 py-4">
          <h2 className="text-lg font-black text-cyan-950">New status</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-2xl p-2 text-slate-500 hover:bg-aqua-50">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-2 border-b border-aqua-100/40 px-4 py-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setTab(id); clearMedia(); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition ${
                tab === id ? 'bg-gradient-to-r from-cyan-500 to-aqua-400 text-white shadow-md' : 'bg-aqua-50/80 text-cyan-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'text' ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={700}
              placeholder="What's on your mind?"
              className="w-full resize-none rounded-2xl border border-aqua-100/70 bg-aqua-50/50 px-4 py-3 text-base outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
            />
          ) : (
            <>
              {previewUrl ? (
                <div className="relative overflow-hidden rounded-2xl border border-aqua-100/60 bg-cyan-950/5">
                  {tab === 'video' ? (
                    <video src={previewUrl} controls playsInline className="max-h-64 w-full object-contain" />
                  ) : (
                    <img src={previewUrl} alt="" className="max-h-64 w-full object-contain" />
                  )}
                  <button
                    type="button"
                    onClick={clearMedia}
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => galleryRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-aqua-200 bg-aqua-50/60 px-4 py-8 transition hover:bg-aqua-100/60"
                  >
                    <ImageIcon size={28} className="text-cyan-600" />
                    <span className="text-sm font-bold text-cyan-900">Gallery</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-aqua-200 bg-aqua-50/60 px-4 py-8 transition hover:bg-aqua-100/60"
                  >
                    <Camera size={28} className="text-cyan-600" />
                    <span className="text-sm font-bold text-cyan-900">Camera</span>
                  </button>
                </div>
              )}
              <input
                ref={galleryRef}
                type="file"
                accept={tab === 'video' ? 'video/*' : 'image/*'}
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0], 'gallery')}
              />
              <input
                ref={cameraRef}
                type="file"
                accept={tab === 'video' ? 'video/*' : 'image/*'}
                capture={tab === 'video' ? 'environment' : 'user'}
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0], 'camera')}
              />
              {(file || previewUrl) && (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-500">Caption (optional)</span>
                  <input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    maxLength={200}
                    className="w-full rounded-2xl border border-aqua-100/70 bg-white px-4 py-2.5 text-sm outline-none focus:border-cyan-300"
                  />
                </label>
              )}
            </>
          )}
        </div>

        {busy && progress > 0 && (
          <div className="px-5 pb-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-aqua-100">
              <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-center text-[11px] font-semibold text-slate-500">Uploading {progress}%</p>
          </div>
        )}

        <div className="border-t border-aqua-100/50 px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <button
            type="button"
            disabled={!canPost || busy}
            onClick={submit}
            className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Post status'}
          </button>
        </div>
      </div>
    </div>
  );
}
