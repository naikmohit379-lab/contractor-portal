import { Router } from "express";
import { requireAuth } from "../../core/auth";
import { subscribe } from "../../core/realtime";

/**
 * GET /api/v1/events: Server-Sent Events. The browser cannot send an Authorization header with EventSource,
 * so the web app reads this stream with fetch. The stream ends after 10 minutes; the client reconnects with a
 * fresh access token, so a revoked session cannot keep listening for long.
 */
export const eventsRouter = Router();

eventsRouter.get("/", requireAuth, (req, res) => {
  const { companyId, userId } = req.auth!;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tell nginx not to buffer the stream
  });
  res.flushHeaders();
  res.write(": connected\n\n");

  const unsubscribe = subscribe(companyId, userId, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000); // keeps proxies from closing an idle stream
  const lifetime = setTimeout(() => res.end(), 10 * 60 * 1000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    unsubscribe();
  });
});
