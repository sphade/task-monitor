import { useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@/store/auth';

/**
 * Realtime chat transport — a WebSocket straight into the API's ChatRoom
 * Durable Object (`/v1/chat/ws/{conversationId}/?token=…`).
 *
 * - Reconnects with exponential backoff (capped at 15s).
 * - Falls back silently: the screen keeps its slow poll while the socket is
 *   not open, so a flaky network degrades instead of breaking.
 */

export type SocketStatus = 'connecting' | 'open' | 'closed';

export interface ChatSocketEvent {
  type: 'connected' | 'message.new' | 'message.read';
  message?: { conversation: number; [key: string]: unknown };
  conversation?: number;
  reader?: number;
}

/** ws(s)://…/v1/chat/ws/{id}/?token=… derived from EXPO_PUBLIC_API_URL. */
export function chatSocketUrl(conversationId: string, token: string): string {
  const base = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/v1/chat/ws/${conversationId}/?token=${encodeURIComponent(token)}`;
}

export function useConversationSocket(
  conversationId: string | undefined,
  onEvent: (event: ChatSocketEvent) => void,
): SocketStatus {
  const token = useAuthStore((s) => s.session?.token);
  const [status, setStatus] = useState<SocketStatus>('closed');

  // Latest callback without re-running the connection effect.
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!conversationId || !token) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const scheduleRetry = () => {
      if (disposed) return;
      const delay = Math.min(15_000, 1_000 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      try {
        ws = new WebSocket(chatSocketUrl(conversationId, token));
      } catch {
        scheduleRetry();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as ChatSocketEvent;
          handlerRef.current(parsed);
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onclose = () => {
        setStatus('closed');
        scheduleRetry();
      };
    };

    // Kick off asynchronously so the effect body stays free of state writes.
    const kickoff = setTimeout(connect, 0);

    return () => {
      disposed = true;
      clearTimeout(kickoff);
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        ws.close();
      }
    };
  }, [conversationId, token]);

  return status;
}
