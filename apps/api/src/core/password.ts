import bcrypt from "bcryptjs";
import { argon2Verify } from "hash-wasm";
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

  // Keep accounts created with the previous Argon2 format usable without a
  // native runtime dependency. New accounts use portable bcrypt hashes.
  if (passwordHash.startsWith("$argon2")) {
    try {
      return await argon2Verify({ hash: passwordHash, password });
    } catch {
      return false;
    }
  }

  return false;
}
