import { useRef, useState } from 'react';
import { FileText, Mic, Paperclip, Send, Smile, X } from 'lucide-react';
import { setTyping as setFirebaseTyping } from '../../api.js';
import { detectMessageType, prepareUploadFile } from '../../utils/messageMedia.js';

const emptyRecorder = { recording: false, stream: null, mediaRecorder: null, chunks: [] };

export default function Composer({ chat, replyTo, onClearReply, onSend, onUpload, isMobile, disabled = false }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recorder, setRecorder] = useState(emptyRecorder);
  const fileRef = useRef(null);
  const typingTimerRef = useRef(null);

  const type = () => {
    if (disabled) return;
    setFirebaseTyping(chat._id, true).catch(console.error);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setFirebaseTyping(chat._id, false).catch(console.error), 700);
  };

  const submit = (event) => {
    event.preventDefault();
    if (disabled || !text.trim() || uploading) return;
    onSend({ type: 'text', body: text.trim() });
    setText('');
  };

  const uploadWithRetry = async (file, attempt = 0) => {
    try {
      const prepared = await prepareUploadFile(file);
      const uploaded = await onUpload(prepared, {
        onProgress: (value) => setUploadProgress(value)
      });
      const kind = detectMessageType(prepared);
      onSend({
        type: kind,
        body: kind === 'file' ? '' : '',
        mediaUrl: uploaded.url,
        storagePath: uploaded.storagePath || uploaded.publicId,
        fileName: uploaded.fileName || prepared.name,
        fileSize: uploaded.fileSize || prepared.size,
        mimeType: uploaded.mimeType || prepared.type,
        duration: uploaded.duration || 0
      });
    } catch (error) {
      if (attempt < 1) {
        await uploadWithRetry(file, attempt + 1);
        return;
      }
      throw error;
    }
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      await uploadWithRetry(file);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleRecord = async () => {
    if (recorder.recording) {
      recorder.mediaRecorder.stop();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];
    mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      stream.getTracks().forEach((track) => track.stop());
      setRecorder(emptyRecorder);
      await uploadFile(file);
    };
    mediaRecorder.start();
    setRecorder({ recording: true, stream, mediaRecorder, chunks });
  };

  return (
    <form
      onSubmit={submit}
      className={`composer-keyboard-safe sticky bottom-0 z-20 shrink-0 border-t border-aqua-100/40 bg-white/95 backdrop-blur-sm ${isMobile ? 'pb-[calc(env(safe-area-inset-bottom)+0.25rem)]' : ''}`}
    >
      {replyTo && (
        <div className="mx-auto flex max-w-3xl items-center gap-2 border-b border-aqua-100/60 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1 border-l-4 border-cyan-500 pl-3">
            <p className="text-xs font-black text-cyan-700">Replying</p>
            <p className="truncate text-sm text-slate-600">{replyTo.body || replyTo.fileName || replyTo.type}</p>
          </div>
          <button type="button" onClick={onClearReply} className="rounded-xl p-2 text-slate-400 hover:bg-aqua-50" aria-label="Cancel reply">
            <X size={18} />
          </button>
        </div>
      )}

      {uploading && (
        <div className="mx-auto max-w-3xl px-3 pt-2 sm:px-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-aqua-100">
            <div className="h-full rounded-full bg-cyan-500 transition-all duration-200" style={{ width: `${uploadProgress || 8}%` }} />
          </div>
          <p className="mt-1 text-center text-[11px] font-semibold text-slate-500">Uploading… {uploadProgress}%</p>
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-end gap-1.5 px-2 py-3 sm:gap-2.5 sm:px-3 sm:py-4">
        <button type="button" className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Emoji">
          <Smile size={20} />
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled || uploading} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700 disabled:opacity-50" title="Attach">
          <Paperclip size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
          className="hidden"
          onChange={(e) => uploadFile(e.target.files?.[0])}
        />
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); type(); }}
          placeholder={disabled ? 'Messaging unavailable' : 'Message...'}
          enterKeyHint="send"
          disabled={disabled || uploading}
          className="min-w-0 flex-1 rounded-2xl border border-aqua-100/60 bg-white px-4 py-2.5 text-base placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft disabled:cursor-not-allowed disabled:bg-slate-50 sm:px-5 sm:py-3 sm:text-sm"
        />
        <button
          type="button"
          onClick={toggleRecord}
          disabled={disabled || uploading}
          className={`rounded-2xl p-2.5 transition duration-200 ${recorder.recording ? 'bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-lg shadow-rose-200/50' : 'text-slate-600 hover:bg-aqua-100/60 hover:text-cyan-700'} disabled:opacity-50`}
          title="Voice note"
        >
          <Mic size={20} />
        </button>
        <button
          type="submit"
          disabled={disabled || uploading || !text.trim()}
          className="rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 p-2.5 text-white shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-60 disabled:shadow-none"
          title="Send"
        >
          {uploading ? <FileText size={20} className="animate-pulse" /> : <Send size={20} />}
        </button>
      </div>
    </form>
  );
}
