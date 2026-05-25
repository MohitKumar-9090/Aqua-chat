import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Phone,
  Play,
  Video,
  X
} from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { api } from '../../api.js';
import { statusText } from '../../utils/chat.js';
import { formatFileSize } from '../../utils/messageMedia.js';
import { optimizeCloudinaryUrl } from '../../services/cloudinary.js';
import { success as toastSuccess, error as toastError } from '../../utils/toast.js';

const MediaPreview = ({ item, onClose }) => {
  if (!item) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
      >
        <X size={22} />
      </button>
      <div className="max-h-[90vh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
        {item.type === 'video' ? (
          <video
            src={item.mediaUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[90vh] max-w-[95vw] rounded-2xl"
          />
        ) : (
          <img
            src={item.mediaUrl}
            alt=""
            className="max-h-[90vh] max-w-[95vw] rounded-2xl object-contain"
          />
        )}
      </div>
    </div>
  );
};

const TABS = [
  { key: 'media', label: 'Media', icon: ImageIcon },
  { key: 'links', label: 'Links', icon: Link2 },
  { key: 'docs', label: 'Docs', icon: FileText }
];

const extractUrls = (text) => {
  if (!text) return [];
  const regex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return text.match(regex) || [];
};

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function UserInfoPanel({
  peer,
  chat,
  me,
  blockState,
  onClose,
  onAudio,
  onVideo,
  onToggleBlock
}) {
  const [activeTab, setActiveTab] = useState('media');
  const [sharedMedia, setSharedMedia] = useState({ media: [], links: [], docs: [] });
  const [mediaLoading, setMediaLoading] = useState(true);
  const [previewItem, setPreviewItem] = useState(null);

  const isBlocked = Boolean(peer?._id && blockState?.blocked?.has(peer._id));
  const isBlockedBy = Boolean(peer?._id && blockState?.blockedBy?.has(peer._id));

  // Fetch shared media
  useEffect(() => {
    if (!chat?._id) return;
    let cancelled = false;
    setMediaLoading(true);
    api.getSharedMedia(chat._id).then((result) => {
      if (!cancelled) {
        setSharedMedia(result);
        setMediaLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setMediaLoading(false);
    });
    return () => { cancelled = true; };
  }, [chat?._id]);

  const handleToggleBlock = useCallback(async () => {
    if (!peer?._id) return;
    try {
      if (isBlocked) {
        await api.unblockUser(peer._id);
        toastSuccess(`${peer.displayName || 'User'} unblocked`);
      } else {
        await api.blockUser(peer._id);
        toastSuccess(`${peer.displayName || 'User'} blocked`);
      }
      onToggleBlock?.();
    } catch (err) {
      toastError(err.message || 'Could not update block status.');
    }
  }, [peer, isBlocked, onToggleBlock]);

  const currentData = sharedMedia[activeTab] || [];

  if (!peer) return null;

  return (
    <>
      <div className="fixed inset-y-0 right-0 z-40 flex h-full w-full flex-col border-l border-aqua-100/40 bg-slate-50 shadow-2xl transition-all duration-300 transform translate-x-0 sm:w-[380px] animate-slide-in">

        {/* Header */}
        <header className="flex items-center gap-3 bg-white px-4 py-4 shadow-sm border-b border-aqua-100/20">
          <button
            onClick={onClose}
            className="rounded-2xl p-1.5 text-cyan-700 hover:bg-aqua-50 transition active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-md font-black text-cyan-950">User Info</h2>
            <p className="text-xs text-slate-500">{statusText(peer)}</p>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 scroll-smooth">

          {/* Profile Card */}
          <div className="flex flex-col items-center bg-white rounded-3xl p-6 border border-aqua-100/20 shadow-sm relative overflow-hidden">
            {/* Decorative gradient blob */}
            <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-400/20 via-aqua-300/10 to-transparent blur-2xl" />

            <div className="relative rounded-full bg-gradient-to-tr from-cyan-500 via-aqua-400 to-emerald-400 p-[3px] shadow-lg mb-4">
              <Avatar name={peer.displayName} image={peer.photoURL} size="xl" />
              {/* Online indicator */}
              {peer.isOnline && (
                <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-400 shadow" />
              )}
            </div>

            <h3 className="text-lg font-black text-cyan-950 text-center">
              {peer.displayName || 'AquaChat User'}
            </h3>

            {peer.username && (
              <p className="text-sm font-semibold text-cyan-600 mt-0.5">
                @{peer.username}
              </p>
            )}

            <p className={`mt-1 text-xs font-semibold ${peer.isOnline ? 'text-emerald-500' : 'text-slate-400'}`}>
              {statusText(peer)}
            </p>

            {peer.bio && peer.bio !== 'Hey there! I am using AquaChat.' && (
              <p className="mt-3 text-center text-sm text-slate-600 leading-relaxed max-w-xs">
                {peer.bio}
              </p>
            )}

            {peer.lastSeen && !peer.isOnline && (
              <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-400">
                <Calendar size={13} />
                <span>Joined {formatDate(peer.lastSeen)}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {!isBlocked && !isBlockedBy && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={onAudio}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-5 py-3 border border-aqua-100/30 shadow-sm transition hover:shadow-md active:scale-95"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-aqua-400 text-white shadow">
                  <Phone size={18} />
                </div>
                <span className="text-[11px] font-bold text-cyan-800">Audio</span>
              </button>
              <button
                onClick={onVideo}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-5 py-3 border border-aqua-100/30 shadow-sm transition hover:shadow-md active:scale-95"
              >
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-aqua-400 text-white shadow">
                  <Video size={18} />
                </div>
                <span className="text-[11px] font-bold text-cyan-800">Video</span>
              </button>
            </div>
          )}

          {/* Shared Media Section */}
          <div className="bg-white rounded-3xl border border-aqua-100/20 shadow-sm overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-aqua-100/20">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const count = (sharedMedia[tab.key] || []).length;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold transition
                      ${activeTab === tab.key
                        ? 'border-b-2 border-cyan-500 text-cyan-700 bg-cyan-50/40'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50/50'
                      }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                    {count > 0 && (
                      <span className={`min-w-[18px] rounded-full px-1 py-0.5 text-[10px] font-black leading-none ${
                        activeTab === tab.key ? 'bg-cyan-500 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="p-3 min-h-[120px]">
              {mediaLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-cyan-500" />
                </div>
              ) : currentData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-300 mb-2">
                    {activeTab === 'media' && <ImageIcon size={22} />}
                    {activeTab === 'links' && <Link2 size={22} />}
                    {activeTab === 'docs' && <FileText size={22} />}
                  </div>
                  <p className="text-xs font-semibold text-slate-400">
                    No shared {activeTab} yet
                  </p>
                </div>
              ) : activeTab === 'media' ? (
                /* Media Grid */
                <div className="grid grid-cols-3 gap-1.5">
                  {currentData.map((msg) => (
                    <button
                      key={msg._id}
                      onClick={() => setPreviewItem(msg)}
                      className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 transition hover:opacity-80 active:scale-95"
                    >
                      {msg.type === 'video' ? (
                        <>
                          <img
                            src={optimizeCloudinaryUrl(msg.mediaUrl, { width: 200, quality: 'auto:low', format: 'auto' })}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play size={22} className="text-white drop-shadow" fill="white" />
                          </div>
                        </>
                      ) : (
                        <img
                          src={optimizeCloudinaryUrl(msg.mediaUrl, { width: 200, quality: 'auto:low', format: 'auto' })}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </button>
                  ))}
                </div>
              ) : activeTab === 'links' ? (
                /* Links List */
                <div className="space-y-2">
                  {currentData.map((msg) => {
                    const urls = extractUrls(msg.body);
                    return (
                      <div key={msg._id} className="rounded-2xl border border-aqua-100/30 bg-aqua-50/30 p-3">
                        <p className="text-xs text-slate-600 line-clamp-2 mb-1.5">{msg.body}</p>
                        {urls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs font-semibold text-cyan-600 hover:text-cyan-800 transition truncate"
                          >
                            <ExternalLink size={12} className="shrink-0" />
                            <span className="truncate">{url}</span>
                          </a>
                        ))}
                        <p className="text-[10px] text-slate-400 mt-1">{formatDate(msg.createdAt)}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Docs List */
                <div className="space-y-2">
                  {currentData.map((msg) => (
                    <a
                      key={msg._id}
                      href={msg.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-2xl border border-aqua-100/30 bg-aqua-50/30 p-3 transition hover:bg-aqua-50/60"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-100 text-cyan-600">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-cyan-900">
                          {msg.fileName || 'Document'}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {msg.fileSize ? formatFileSize(msg.fileSize) : ''}
                          {msg.fileSize && msg.createdAt ? ' · ' : ''}
                          {formatDate(msg.createdAt)}
                        </p>
                      </div>
                      <ExternalLink size={14} className="shrink-0 text-slate-400" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Block Section */}
          <div className="bg-white rounded-3xl border border-aqua-100/20 shadow-sm overflow-hidden">
            <button
              onClick={handleToggleBlock}
              className={`flex w-full items-center gap-3 px-5 py-4 text-sm font-bold transition active:scale-[0.98] ${
                isBlocked
                  ? 'text-cyan-700 hover:bg-cyan-50/50'
                  : 'text-rose-600 hover:bg-rose-50/50'
              }`}
            >
              <Ban size={18} />
              {isBlocked ? `Unblock ${peer.displayName || 'user'}` : `Block ${peer.displayName || 'user'}`}
            </button>
          </div>

          {/* Blocked by them banner */}
          {isBlockedBy && !isBlocked && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-xs font-semibold text-rose-600">
              This user has restricted messages from you.
            </div>
          )}

          {/* Bottom padding for scroll */}
          <div className="h-4" />
        </div>
      </div>

      {/* Fullscreen Media Preview */}
      {previewItem && (
        <MediaPreview item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </>
  );
}
