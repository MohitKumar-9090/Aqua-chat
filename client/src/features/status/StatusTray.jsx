import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Avatar from '../../components/Avatar.jsx';
import { groupStatusesByUser, userHasActiveStatus, userHasUnviewedStatus } from '../../utils/statusHelpers.js';
import StatusCreateModal from './StatusCreateModal.jsx';
import StatusViewer from './StatusViewer.jsx';
import { auth } from '../../firebase.js';

export default function StatusTray({ statuses, me, onCreateStatus, onDeleteStatus }) {
  const [viewerBundle, setViewerBundle] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const meId = me?._id;

  const bundles = useMemo(() => {
    const grouped = groupStatusesByUser(statuses);
    const list = [];
    const currentUid = String(auth.currentUser?.uid || meId || '').trim();
    if (grouped.has(currentUid)) {
      list.push({ userId: currentUid, user: me, items: grouped.get(currentUid) });
    }
    grouped.forEach((items, userId) => {
      const cleanUserId = String(userId || '').trim();
      if (cleanUserId === currentUid) return;
      list.push({ userId: cleanUserId, user: items[0]?.user, items });
    });
    return list.slice(0, 14);
  }, [statuses, me, meId]);

  const myBundle = bundles.find((b) => {
    const currentUid = String(auth.currentUser?.uid || meId || '').trim();
    const ownerUid = String(b.userId || '').trim();
    return currentUid === ownerUid;
  });

  return (
    <>
      <div className="flex gap-3 overflow-x-auto border-b border-aqua-100/40 px-3 py-4 scrollbar-hide">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
        >
          <div className="relative">
            <Avatar user={me} size="lg" statusRing={userHasActiveStatus(statuses, meId)} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-cyan-500 text-white shadow-md">
              <Plus size={12} strokeWidth={3} />
            </span>
          </div>
          <span className="w-full truncate text-center text-[11px] font-bold text-cyan-900">My status</span>
        </button>

        {myBundle && (
          <button
            type="button"
            onClick={() => setViewerBundle(myBundle)}
            className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
          >
            <Avatar user={me} size="lg" statusRing />
            <span className="w-full truncate text-center text-[11px] font-bold text-cyan-900">View mine</span>
          </button>
        )}

        {bundles
          .filter((bundle) => {
            const currentUid = String(auth.currentUser?.uid || meId || '').trim();
            const ownerUid = String(bundle.userId || '').trim();
            return currentUid !== ownerUid;
          })
          .map((bundle) => (
            <button
              key={bundle.userId}
              type="button"
              onClick={() => setViewerBundle(bundle)}
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

      <StatusCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={onCreateStatus}
      />
      {viewerBundle && (
        <StatusViewer
          bundle={viewerBundle}
          meId={meId}
          onClose={() => setViewerBundle(null)}
          onDeleteStatus={onDeleteStatus}
        />
      )}
    </>
  );
}
