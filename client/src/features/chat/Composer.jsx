import { useRef, useState } from 'react';
import { Image, Mic, Paperclip, Send, Smile } from 'lucide-react';
import { setTyping as setFirebaseTyping } from '../../api.js';

const emptyRecorder = { recording: false, stream: null, mediaRecorder: null, chunks: [] };

export default function Composer({ chat, onSend, onUpload, isMobile }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [recorder, setRecorder] = useState(emptyRecorder);
  const fileRef = useRef(null);
  const typingTimerRef = useRef(null);

  const type = () => {
    setFirebaseTyping(chat._id, true).catch(console.error);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setFirebaseTyping(chat._id, false).catch(console.error), 700);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend({ type: 'text', body: text.trim() });
    setText('');
  };

  const uploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await onUpload(file);
      const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';
      onSend({ type: kind, mediaUrl: uploaded.url, cloudinaryPublicId: uploaded.publicId, duration: uploaded.duration || 0 });
    } finally {
      setUploading(false);
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
      className={`composer-keyboard-safe sticky bottom-0 z-20 shrink-0 border-t border-aqua-100/40 bg-white/95 px-2 py-3 backdrop-blur-sm sm:px-3 sm:py-4 ${isMobile ? 'pb-[calc(env(safe-area-inset-bottom)+0.25rem)]' : ''}`}
    >
      <div className="mx-auto flex max-w-3xl items-end gap-1.5 sm:gap-2.5">
        <button type="button" className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Emoji">
          <Smile size={20} />
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-2xl p-2.5 text-slate-600 transition duration-200 hover:bg-aqua-100/60 hover:text-cyan-700" title="Attach">
          <Paperclip size={20} />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} />
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); type(); }}
          placeholder="Message..."
          enterKeyHint="send"
          className="min-w-0 flex-1 rounded-2xl border border-aqua-100/60 bg-white px-4 py-2.5 text-base placeholder-slate-400 outline-none transition duration-200 focus:border-aqua-300/80 focus:shadow-inner-soft sm:px-5 sm:py-3 sm:text-sm"
        />
        <button 
          type="button" 
          onClick={toggleRecord} 
          className={`rounded-2xl p-2.5 transition duration-200 ${recorder.recording ? 'bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-lg shadow-rose-200/50' : 'text-slate-600 hover:bg-aqua-100/60 hover:text-cyan-700'}`} 
          title="Voice note"
        >
          <Mic size={20} />
        </button>
        <button
          type="submit"
          disabled={uploading || !text.trim()}
          className="rounded-2xl bg-gradient-to-r from-cyan-500 to-aqua-400 p-2.5 text-white shadow-lg shadow-cyan-200/50 transition duration-200 hover:shadow-cyan-300/70 disabled:opacity-60 disabled:shadow-none"
          title="Send"
        >
          {uploading ? <Image size={20} className="animate-pulse" /> : <Send size={20} />}
        </button>
      </div>
    </form>
  );
}
