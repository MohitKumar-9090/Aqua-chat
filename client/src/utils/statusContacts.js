/** User IDs allowed to appear in status tray (self + chats + connections). */
export const buildStatusContactIds = (meId, chats = [], connections = []) => {
  const ids = new Set();
  if (meId) ids.add(meId);
  (connections || []).forEach((id) => ids.add(id));
  chats.forEach((chat) => {
    (chat.participantIds || []).forEach((id) => {
      if (id && id !== meId) ids.add(id);
    });
    (chat.participants || []).forEach((participant) => {
      const id = participant?.user?._id || participant?.userId;
      if (id && id !== meId) ids.add(id);
    });
  });
  return ids;
};

const normalizeUid = (uid) => String(uid || '').trim();

const canViewStatus = (status, meId, contactIds) => {
  const ownerId = normalizeUid(status.ownerId || status.userId || status.user?._id || status.user?.uid);
  const viewerId = normalizeUid(meId);
  if (!ownerId || !viewerId) return false;
  if (ownerId === viewerId) return true;

  const privacy = status.user?.settings?.statusPrivacy || {};
  const mode = status.visibility || privacy.mode || 'everyone';
  const selectedIds = status.selectedViewerIds || privacy.selectedIds || [];

  if (mode === 'selected') {
    return selectedIds.map(normalizeUid).includes(viewerId);
  }

  if (mode === 'connections') {
    const ownerConnections = (status.user?.connections || []).map(normalizeUid);
    return ownerConnections.includes(viewerId) || Boolean(contactIds?.has(ownerId));
  }

  return true;
};

export const filterStatusesForContacts = (statuses = [], contactIds, meId) => {
  if (!meId) return [];
  return statuses.filter((status) => canViewStatus(status, meId, contactIds));
};
