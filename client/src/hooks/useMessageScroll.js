import { useLayoutEffect, useRef } from 'react';

const NEAR_BOTTOM_THRESHOLD = 120;

export const isNearBottom = (element, threshold = NEAR_BOTTOM_THRESHOLD) => {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
};

const scrollSignature = (messages) => {
  if (!messages.length) return '0';
  const last = messages[messages.length - 1];
  return `${messages.length}:${last?.localKey || last?._id || ''}:${last?.pending ? 1 : 0}`;
};

/**
 * WhatsApp-style scroll: stick to bottom on send or near-bottom incoming only.
 * Ignores status/seen-only updates; preserves anchor during sync.
 */
export function useMessageScroll(messages, chatKey, sendEpoch = 0) {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);
  const prevRef = useRef({ signature: '', sendEpoch: 0 });
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

  const signature = scrollSignature(messages);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prevLayout = layoutRef.current;
    const prev = prevRef.current;
    const userJustSent = sendEpoch > prev.sendEpoch;
    const signatureChanged = signature !== prev.signature;
    const wasNearBottom = prevLayout
      ? prevLayout.scrollHeight - prevLayout.scrollTop - prevLayout.clientHeight <= NEAR_BOTTOM_THRESHOLD
      : true;

    if (!messages.length) {
      prevRef.current = { signature, sendEpoch };
    } else if (userJustSent) {
      prevRef.current = { signature, sendEpoch };
      scrollToBottom('smooth');
    } else if (signatureChanged && wasNearBottom) {
      prevRef.current = { signature, sendEpoch };
      scrollToBottom('smooth');
    } else if (signatureChanged) {
      prevRef.current = { signature, sendEpoch };
      preserveScrollAnchor(container);
    } else {
      prevRef.current = { signature, sendEpoch };
    }

    layoutRef.current = {
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight
    };
  }, [signature, sendEpoch, messages.length]);

  useLayoutEffect(() => {
    if (!chatKey) return;
    prevRef.current = { signature: '', sendEpoch: 0 };
    layoutRef.current = null;
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [chatKey]);

  return { containerRef, bottomRef, scrollToBottom, isNearBottom: () => isNearBottom(containerRef.current) };
}
