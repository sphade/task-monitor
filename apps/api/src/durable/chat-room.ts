import { DurableObject } from 'cloudflare:workers';

import type { Env } from '@/types';

/**
 * One ChatRoom instance owns all live sockets for a conversation.
 *
 * Uses WebSocket hibernation (`acceptWebSocket` + tags): sockets survive
 * eviction without billing for idle wall-clock time, and `getWebSockets()`
 * reconnects instantly on wake.
 */
export class ChatRoom extends DurableObject<Env> {
  /** Worker-side fan-out after REST persistence succeeded. */
  async broadcast(payload: string): Promise<void> {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        // A dying socket must never break the fan-out loop.
      }
    }
  }

  /**
   * WebSocket upgrade forwarded by the worker AFTER it verified JWT +
   * participation. Identity arrives via trusted internal headers.
   */
  async forward(request: Request): Promise<Response> {
    const userId = request.headers.get('X-User-Id');
    if (!userId) return new Response('Unauthorized', { status: 401 });

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [`user:${userId}`]);
    pair[1].send(JSON.stringify({ type: 'connected', user: Number(userId) }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  /** Clients only receive; pings keep intermediaries happy. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === 'string' && message === 'ping') {
      ws.send('pong');
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Hibernation handles cleanup; nothing to persist.
  }
}
