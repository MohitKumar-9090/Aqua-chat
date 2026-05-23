import { useLayoutEffect, useRef } from 'react';

const NEAR_BOTTOM_THRESHOLD = 120;

export const isNearBottom = (element, threshold = NEAR_BOTTOM_THRESHOLD) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
};

/**
 * WhatsApp-style scroll: stick to bottom on send or near-bottom incoming only.
 * Preserves scroll position during sync/reconciliation updates.
 */
export function useMessageScroll(messages, chatKey, sendEpoch = 0) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const prevRef = useRef({ count: 0, lastId: null, sendEpoch: 0 });
  const layoutRef = useRef(null);

  const scrollToBottom = (behavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  const preserveScrollAnchor = (container) => {
    const prev = layoutRef.current;
    if (!prev || !container) return;
    const distanceFromBottom = prev.scrollHeight - prev.scrollTop - prev.clientHeight;
    const nextTop = container.scrollHeight - container.clientHeight - distanceFromBottom;
    container.scrollTop = Math.max(0, nextTop);
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prevLayout = layoutRef.current;
    const last = messages[messages.length - 1];
    const lastId = last?.localKey || last?._id || null;
    const prev = prevRef.current;
    const countIncreased = messages.length > prev.count;
    const userJustSent = sendEpoch > prev.sendEpoch;
    const wasNearBottom = prevLayout
      ? prevLayout.scrollHeight - prevLayout.scrollTop - prevLayout.clientHeight <= NEAR_BOTTOM_THRESHOLD
      : true;

    if (messages.length) {
      if (userJustSent) {
        prevRef.current = { count: messages.length, lastId, sendEpoch };
        scrollToBottom('smooth');
      } else if (countIncreased && wasNearBottom) {
        prevRef.current = { count: messages.length, lastId, sendEpoch };
        scrollToBottom('smooth');
      } else {
        prevRef.current = { count: messages.length, lastId, sendEpoch };
        preserveScrollAnchor(container);
      }
    }

    layoutRef.current = {
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight
    };
  }, [messages, sendEpoch]);

  useLayoutEffect(() => {
    if (!chatKey) return;
    prevRef.current = { count: 0, lastId: null, sendEpoch };
    layoutRef.current = null;
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [chatKey]);

  return { containerRef, bottomRef, scrollToBottom, isNearBottom: () => isNearBottom(containerRef.current) };
}
