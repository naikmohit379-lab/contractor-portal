import mongoose from "mongoose";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./core/logger";

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info("MongoDB connected");

  const server = createApp().listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "failed to start");
  process.exit(1);
});
