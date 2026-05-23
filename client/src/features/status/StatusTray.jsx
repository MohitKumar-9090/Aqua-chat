import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { groupStatusesByUser, userHasActiveStatus, userHasUnviewedStatus } from '../../utils/statusHelpers.js';
import StatusViewer from './StatusViewer.jsx';

export default function StatusTray({ statuses, me, onCreate }) {
  const inputRef = useRef(null);
  const [viewerBundle, setViewerBundle] = useState(null);
  const meId = me?._id;

  const bundles = useMemo(() => {
    const grouped = groupStatusesByUser(statuses);
    const list = [];
    if (grouped.has(meId)) {
      list.push({ userId: meId, user: me, items: grouped.get(meId) });
    }
    grouped.forEach((items, userId) => {
      if (userId === meId) return;
      list.push({ userId, user: items[0]?.user, items });
    });
    return list.slice(0, 14);
  }, [statuses, me, meId]);

  const openBundle = (bundle) => setViewerBundle(bundle);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto border-b border-aqua-100/40 px-3 py-4 scrollbar-hide">
        <button type="button" onClick={() => inputRef.current?.click()} className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5">
          <div className="relative">
            <Avatar user={me} size="lg" statusRing={userHasActiveStatus(statuses, meId)} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-cyan-500 text-white">
              <Plus size={12} />
            </span>
          </div>
          <span className="w-full truncate text-center text-[11px] font-bold text-cyan-900">Add</span>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onCreate(e.target.files?.[0])} />
        </button>

        <button type="button" onClick={() => onCreate()} className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5">
          <Avatar user={me} size="lg" />
          <span className="w-full truncate text-center text-[11px] font-bold text-cyan-900">Text</span>
        </button>

        {bundles
          .filter((bundle) => bundle.userId !== meId)
          .map((bundle) => (
            <button
              key={bundle.userId}
              type="button"
              onClick={() => openBundle(bundle)}
              className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
            >
              <Avatar
                user={bundle.user}
                size="lg"
                statusRing={userHasUnviewedStatus(statuses, bundle.userId, meId)}
              />
              <span className="w-full truncate text-center text-[11px] font-bold text-cyan-900">
                {bundle.user?.displayName || 'Contact'}
              </span>
            </button>
          ))}
      </div>

      {viewerBundle && <StatusViewer bundle={viewerBundle} onClose={() => setViewerBundle(null)} />}
    </>
  );
}
