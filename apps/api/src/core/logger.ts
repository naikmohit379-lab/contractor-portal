import pino from "pino";
import { env, isProd } from "../config/env";

type RequestLogFields = {
  id?: string | number;
  method?: string;
  url?: string;
  remoteAddress?: string;
  remotePort?: number;
};

/** Exclude headers so bearer tokens, webhook signatures, cookies, and proxy credentials never enter request logs. */
export function serializeRequestForLog(request: RequestLogFields) {
  return {
    id: request.id,
    method: request.method,
    url: request.url,
    remoteAddress: request.remoteAddress,
    remotePort: request.remotePort,
  };
}

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  redact: ["req.headers.*", "password", "*.password"],
  transport: isProd ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
