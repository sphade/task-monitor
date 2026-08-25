import { drizzle } from 'drizzle-orm/d1';

import * as schema from '@/db/schema';
import type { AppDb, Env, Services } from '@/types';

/** The drizzle instance every repository function takes. */
export type Db = AppDb;

export function makeDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export function getServices(env: Env): Services {
  const namespace = env.CHAT_ROOM;
  return {
    db: makeDb(env.DB),
    kv: env.KV,
    jwtSecret: new TextEncoder().encode(env.JWT_SECRET),
    environment: env.ENVIRONMENT ?? 'development',
    showOtpInResponses: env.DEBUG_SHOW_OTP === 'true',
    roomStub: (roomName) => {
      // RPC surface of the ChatRoom Durable Object.
      const stub = namespace.getByName(roomName);
      return {
        broadcast: (payload) => stub.broadcast(payload),
        forward: (request) => stub.forward(request),
      };
    },
  };
}
