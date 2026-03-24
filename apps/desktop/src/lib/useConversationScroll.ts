import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type ScrollSnapshot = {
  conversationId: string | null;
  messageCount: number;
  lastMessageId: string | null;
};

type UseConversationScrollInput = {
  conversationId: string | null;
  messageCount: number;
  lastMessageId: string | null;
  tailSignal?: string;
};

type UseConversationScrollResult = {
  containerRef: RefObject<HTMLDivElement>;
  contentRef: RefObject<HTMLDivElement>;
  handleScroll: () => void;
  jumpToLatest: () => void;
  showJumpToLatest: boolean;
  pendingMessageCount: number;
};

const SCROLL_RESTORE_BY_CONVERSATION = new Map<string, number>();
const STICK_TO_BOTTOM_BY_CONVERSATION = new Map<string, boolean>();
const PENDING_MESSAGES_BY_CONVERSATION = new Map<string, number>();

const BOTTOM_THRESHOLD_PX = 64;

function isNearBottom(element: HTMLDivElement): boolean {
  const distance = element.scrollHeight - (element.scrollTop + element.clientHeight);
  return distance <= BOTTOM_THRESHOLD_PX;
}

export function useConversationScroll({
  conversationId,
  messageCount,
  lastMessageId,
  tailSignal
}: UseConversationScrollInput): UseConversationScrollResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const forceBottomOnEntryRef = useRef(false);
  const stickToLatestRef = useRef(false);
  const previousSnapshotRef = useRef<ScrollSnapshot>({
    conversationId: null,
    messageCount: 0,
    lastMessageId: null
  });
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [pendingMessageCount, setPendingMessageCount] = useState(0);

  const persistContainerState = useCallback((id: string, element: HTMLDivElement) => {
    SCROLL_RESTORE_BY_CONVERSATION.set(id, element.scrollTop);
    STICK_TO_BOTTOM_BY_CONVERSATION.set(id, isNearBottom(element));
  }, []);

  const setBottomState = useCallback((id: string, element: HTMLDivElement) => {
    SCROLL_RESTORE_BY_CONVERSATION.set(id, element.scrollTop);
    STICK_TO_BOTTOM_BY_CONVERSATION.set(id, true);
    PENDING_MESSAGES_BY_CONVERSATION.set(id, 0);
    setPendingMessageCount(0);
    setShowJumpToLatest(false);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior) => {
      if (!conversationId) {
        return;
      }
      const element = containerRef.current;
      if (!element) {
        return;
      }

      element.scrollTo({ top: element.scrollHeight, behavior });
      requestAnimationFrame(() => {
        const target = containerRef.current;
        if (!target) {
          return;
        }
        setBottomState(conversationId, target);
      });
    },
    [conversationId, setBottomState]
  );

  const jumpToLatest = useCallback(() => {
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!conversationId) {
      return;
    }
    const element = containerRef.current;
    if (!element) {
      return;
    }

    persistContainerState(conversationId, element);
    const atBottom = isNearBottom(element);
    if (atBottom) {
      PENDING_MESSAGES_BY_CONVERSATION.set(conversationId, 0);
      setPendingMessageCount(0);
      stickToLatestRef.current = true;
    } else {
      setPendingMessageCount(PENDING_MESSAGES_BY_CONVERSATION.get(conversationId) ?? 0);
      stickToLatestRef.current = false;
    }
    setShowJumpToLatest(!atBottom);
  }, [conversationId, persistContainerState]);

  useLayoutEffect(() => {
    const previousConversation = activeConversationRef.current;
    const currentElement = containerRef.current;
    if (previousConversation && currentElement) {
      persistContainerState(previousConversation, currentElement);
    }

    activeConversationRef.current = conversationId;

    previousSnapshotRef.current = {
      conversationId,
      messageCount,
      lastMessageId
    };

    if (!conversationId) {
      setPendingMessageCount(0);
      setShowJumpToLatest(false);
      forceBottomOnEntryRef.current = false;
      return;
    }

    // Conversation/channel first-open behavior must always start from latest messages.
    // We keep persisted snapshots only for future heuristics, but never restore them on open.
    forceBottomOnEntryRef.current = true;
    stickToLatestRef.current = true;
    PENDING_MESSAGES_BY_CONVERSATION.set(conversationId, 0);
    setPendingMessageCount(0);
    setShowJumpToLatest(false);

    const raf = requestAnimationFrame(() => {
      const element = containerRef.current;
      if (!element) {
        return;
      }

      element.scrollTop = element.scrollHeight;
      setBottomState(conversationId, element);
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [conversationId, persistContainerState, setBottomState]);

  useLayoutEffect(() => {
    if (!conversationId) {
      previousSnapshotRef.current = {
        conversationId,
        messageCount,
        lastMessageId
      };
      return;
    }

    const previous = previousSnapshotRef.current;
    const sameConversation = previous.conversationId === conversationId;
    const appendedNewTail =
      sameConversation && messageCount > previous.messageCount && lastMessageId !== previous.lastMessageId;

    previousSnapshotRef.current = {
      conversationId,
      messageCount,
      lastMessageId
    };

    if (!appendedNewTail) {
      return;
    }

    const element = containerRef.current;
    const shouldStick =
      forceBottomOnEntryRef.current ||
      stickToLatestRef.current ||
      (element ? isNearBottom(element) : (STICK_TO_BOTTOM_BY_CONVERSATION.get(conversationId) ?? true));

    if (shouldStick) {
      forceBottomOnEntryRef.current = false;
      stickToLatestRef.current = true;
      scrollToBottom("auto");
      return;
    }

    const delta = Math.max(1, messageCount - previous.messageCount);
    const nextPending = (PENDING_MESSAGES_BY_CONVERSATION.get(conversationId) ?? 0) + delta;
    PENDING_MESSAGES_BY_CONVERSATION.set(conversationId, nextPending);
    setPendingMessageCount(nextPending);
    setShowJumpToLatest(true);
  }, [conversationId, lastMessageId, messageCount, scrollToBottom]);

  useEffect(() => {
    if (!conversationId || !tailSignal) {
      return;
    }

    const element = containerRef.current;
    const shouldStick =
      stickToLatestRef.current ||
      (element ? isNearBottom(element) : (STICK_TO_BOTTOM_BY_CONVERSATION.get(conversationId) ?? true));

    if (!shouldStick) {
      return;
    }

    scrollToBottom("auto");
  }, [conversationId, scrollToBottom, tailSignal]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observed = contentRef.current ?? containerRef.current;
    if (!observed) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!stickToLatestRef.current) {
        return;
      }
      scrollToBottom("auto");
    });
    observer.observe(observed);
    return () => observer.disconnect();
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    return () => {
      const conversation = activeConversationRef.current;
      const element = containerRef.current;
      if (conversation && element) {
        persistContainerState(conversation, element);
      }
    };
  }, [persistContainerState]);

  return {
    containerRef,
    contentRef,
    handleScroll,
    jumpToLatest,
    showJumpToLatest,
    pendingMessageCount
  };
}
