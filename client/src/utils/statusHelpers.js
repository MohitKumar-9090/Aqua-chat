import { isStatusViewedLocal } from './statusViewed.js';

const MS_24H = 24 * 60 * 60 * 1000;

export const isStatusExpired = (status) => {
  if (!status?.expiresAt) return false;
  return new Date(status.expiresAt).getTime() <= Date.now();
};

export const activeStatuses = (statuses = []) => statuses.filter((item) => !isStatusExpired(item));

export const groupStatusesByUser = (statuses = []) => {
  const map = new Map();
  activeStatuses(statuses).forEach((status) => {
    const uid = status.userId || status.user?._id;
    if (!uid) return;
    if (!map.has(uid)) map.set(uid, []);
    map.get(uid).push(status);
  });
  map.forEach((items) => items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
  return map;
};

export const userHasActiveStatus = (statuses, userId) => {
  if (!userId) return false;
  return activeStatuses(statuses).some((s) => (s.userId || s.user?._id) === userId);
};

export const userHasUnviewedStatus = (statuses, userId, meId) => {
  if (!userId || userId === meId) return false;
  return activeStatuses(statuses)
    .filter((s) => (s.userId || s.user?._id) === userId)
    .some((s) => !isStatusViewedLocal(s._id) && !(s.seenBy || []).includes(meId));
};

export const statusExpiresAt = () => new Date(Date.now() + MS_24H).toISOString();

export { buildStatusContactIds, filterStatusesForContacts } from './statusContacts.js';
