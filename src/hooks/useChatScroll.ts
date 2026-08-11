import { useEffect, useRef, useState } from 'react';
import { Message } from '../types';

/** Manages chat scroll behaviour — auto-scroll during streaming, scroll-to-bottom on chat open, and the floating scroll button. */
export function useChatScroll(messages: Message[], isLoading: boolean) {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastScrollTimeRef = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingScrollRef = useRef(false);

  const isNearBottom = () => {
    if (!mainScrollRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = mainScrollRef.current;
    // If the user is within 100px of the bottom, treat as near bottom.
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  const handleScroll = () => {
    if (!mainScrollRef.current) return;
    const { scrollTop } = mainScrollRef.current;
    const nearBottom = isNearBottom();
    shouldAutoScrollRef.current = nearBottom;
    setShowScrollButton(!nearBottom && messages.length > 0);
    setShowScrollTopButton(scrollTop > 200 && messages.length > 0);
  };

  const scrollToTop = (force = false) => {
    if (!mainScrollRef.current) return;
    mainScrollRef.current.scrollTo({ top: 0, behavior: force ? 'smooth' : 'auto' });
    shouldAutoScrollRef.current = false;
  };

  const scrollToBottom = (force = false) => {
    const now = Date.now();
    if (force === true) {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      lastScrollTimeRef.current = now;
      return;
    }

    if (shouldAutoScrollRef.current) {
      if (now - lastScrollTimeRef.current > 100) {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        lastScrollTimeRef.current = now;
      } else if (!scrollTimeoutRef.current) {
        scrollTimeoutRef.current = setTimeout(() => {
          if (shouldAutoScrollRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            lastScrollTimeRef.current = Date.now();
          }
          scrollTimeoutRef.current = null;
        }, 100);
      }
    }
  };

  useEffect(() => {
    if (pendingScrollRef.current && messages.length > 0) {
      scrollToTop(true);
      pendingScrollRef.current = false;
      return;
    }

    const nearBottom = isNearBottom();
    shouldAutoScrollRef.current = nearBottom;
    if (nearBottom) scrollToBottom();
  }, [messages, isLoading]);

  const setPendingScroll = () => {
    pendingScrollRef.current = true;
  };

  return {
    messagesEndRef,
    mainScrollRef,
    handleScroll,
    scrollToBottom,
    scrollToTop,
    shouldAutoScrollRef,
    scrollTimeoutRef,
    showScrollButton,
    showScrollTopButton,
    setPendingScroll
  };
}
