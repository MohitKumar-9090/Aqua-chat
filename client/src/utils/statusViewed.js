const KEY = 'aquachat_status_viewed';

const readMap = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};

export const markStatusViewedLocal = (statusId) => {
  if (!statusId) return;
  const map = readMap();
  map[statusId] = Date.now();
  localStorage.setItem(KEY, JSON.stringify(map));
};

export const isStatusViewedLocal = (statusId) => Boolean(readMap()[statusId]);

export const pruneStatusViewedLocal = (activeIds = []) => {
  const keep = new Set(activeIds);
  const map = readMap();
  const next = {};
  Object.keys(map).forEach((id) => {
    if (keep.has(id)) next[id] = map[id];
  });
  localStorage.setItem(KEY, JSON.stringify(next));
};
