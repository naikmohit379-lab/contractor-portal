import bcrypt from "bcryptjs";
import { AppError } from "./errors";

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new AppError(422, "password_too_long", "Use a password that is at most 72 UTF-8 bytes");
  }
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (passwordHash.startsWith("$2")) {
    return Buffer.byteLength(password, "utf8") <= 72 && bcrypt.compare(password, passwordHash);
  }

  // Keep local accounts created with the previous Argon2 format usable where
  // that native package is installed. New Vercel accounts use bundled bcrypt.
  if (passwordHash.startsWith("$argon2")) {
    try {
      const argon2 = await import("argon2");
      return argon2.default.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  return false;
}
