const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const highlightText = (text, query) => {
  if (!text || !query?.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded bg-amber-200/90 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    )
  );
};

export const messageMatchesQuery = (message, query) => {
  if (!query?.trim()) return true;
  const q = query.trim().toLowerCase();
  const haystack = [message.body, message.fileName, message.sender?.displayName, message.type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
};
