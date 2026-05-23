import { Smile } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-100 to-aqua-100 shadow-soft">
          <Smile size={48} className="text-cyan-600" />
        </div>
        <h2 className="text-2xl font-black text-cyan-950 mb-2">Pick a conversation</h2>
        <p className="text-slate-500 text-sm">Select a chat from the sidebar to get started</p>
      </div>
    </div>
  );
}
