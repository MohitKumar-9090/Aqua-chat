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

export const filterStatusesForContacts = (statuses = [], contactIds) => {
  if (!contactIds?.size) return [];
  return statuses.filter((status) => contactIds.has(status.userId || status.user?._id));
};
