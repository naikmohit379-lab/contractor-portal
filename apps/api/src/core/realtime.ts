import { EventEmitter } from "node:events";
import type { LiveEvent } from "@roofdesk/shared";

/**
 * In-process publish/subscribe for the live event stream (Server-Sent Events).
 * Works for a single API instance. To run several instances, replace the body of publish/subscribe with
 * Redis pub/sub; the callers do not change.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

interface Envelope {
  userId: string | null; // null = everyone in the company
  event: LiveEvent;
}

export const publish = (companyId: string, userId: string | null, event: LiveEvent) => {
  bus.emit(`company:${companyId}`, { userId, event } satisfies Envelope);
};

export function subscribe(companyId: string, userId: string, send: (e: LiveEvent) => void): () => void {
  const handler = (env: Envelope) => {
    if (env.userId === null || env.userId === userId) send(env.event);
  };
  bus.on(`company:${companyId}`, handler);
  return () => bus.off(`company:${companyId}`, handler);
}
