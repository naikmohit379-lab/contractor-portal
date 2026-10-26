import { env } from "../../config/env";
import { createLocalStorage, createS3Storage, createVercelBlobStorage, type StorageDriver } from "./storage";

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) throw new Error("S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY are required when STORAGE_DRIVER=s3");
    driver = createS3Storage({
      endpoint: env.S3_ENDPOINT ?? `https://s3.${env.S3_REGION}.amazonaws.com`,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
      pathStyle: env.S3_PATH_STYLE,
    });
  } else if (env.STORAGE_DRIVER === "vercel-blob") {
    if (!env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=vercel-blob");
    driver = createVercelBlobStorage();
  } else {
    driver = createLocalStorage(env.STORAGE_DIR);
  }
  return driver;
}
