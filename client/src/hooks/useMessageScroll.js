import { useEffect, useLayoutEffect, useRef } from 'react';

const NEAR_BOTTOM_THRESHOLD = 140;

export const isNearBottom = (element, threshold = NEAR_BOTTOM_THRESHOLD) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
};

/**
 * WhatsApp-style scroll: stick to bottom only when the user is already there,
 * or when the current user sends a message.
 */
export function useMessageScroll(messages, meId, chatKey) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const snapshotRef = useRef({ count: 0, lastId: null, signature: '' });

  const scrollToBottom = (behavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !messages.length) return;

    const last = messages[messages.length - 1];
    const lastId = last?._id ?? null;
    const signature = messages
      .map((m) => `${m._id}:${m.status}:${m.deletedForEveryone}:${m.pending}`)
      .join('|');

    const prev = snapshotRef.current;
    const countIncreased = messages.length > prev.count;
    const lastChanged = lastId !== prev.lastId;
    const contentChanged = signature !== prev.signature;

    snapshotRef.current = { count: messages.length, lastId, signature };

    if (!contentChanged) return;

    const mine = last && (last.senderId === meId || last.pending);
    const nearBottom = isNearBottom(container);

    if (mine && (countIncreased || lastChanged)) {
      scrollToBottom('smooth');
      return;
    }

    if (nearBottom && countIncreased) {
      scrollToBottom('smooth');
    }
  }, [messages, meId]);

  useLayoutEffect(() => {
    if (!chatKey) return;
    snapshotRef.current = { count: 0, lastId: null, signature: '' };
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [chatKey]);

  return { containerRef, bottomRef, scrollToBottom, isNearBottom: () => isNearBottom(containerRef.current) };
}
