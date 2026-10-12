import pino from "pino";
import { env, isProd } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  redact: ["req.headers.authorization", "req.headers.cookie", "password", "*.password"],
  transport: isProd ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
