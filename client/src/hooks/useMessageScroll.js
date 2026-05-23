import { useLayoutEffect, useRef } from 'react';

const NEAR_BOTTOM_THRESHOLD = 120;

export const isNearBottom = (element, threshold = NEAR_BOTTOM_THRESHOLD) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
};

/**
 * WhatsApp-style scroll: bottom only on send or when already near bottom + new message.
 */
export function useMessageScroll(messages, chatKey, sendEpoch = 0) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const prevRef = useRef({ count: 0, lastId: null, sendEpoch: 0 });

  const scrollToBottom = (behavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !messages.length) return;

    const last = messages[messages.length - 1];
    const lastId = last?._id ?? null;
    const prev = prevRef.current;
    const countIncreased = messages.length > prev.count;
    const userJustSent = sendEpoch > prev.sendEpoch;

    if (userJustSent) {
      prevRef.current = { count: messages.length, lastId, sendEpoch };
      scrollToBottom('smooth');
      return;
    }

    prevRef.current = { count: messages.length, lastId, sendEpoch };

    if (!countIncreased) return;

    if (isNearBottom(container)) {
      scrollToBottom('smooth');
    }
  }, [messages, sendEpoch]);

  useLayoutEffect(() => {
    if (!chatKey) return;
    prevRef.current = { count: 0, lastId: null, sendEpoch };
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [chatKey]);

  return { containerRef, bottomRef, scrollToBottom, isNearBottom: () => isNearBottom(containerRef.current) };
}
