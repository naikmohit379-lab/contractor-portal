export type DetectedType = { contentType: string; ext: string; kind: "photo" | "document" };

const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString("latin1");

/**
 * Identifies a file from its first bytes. The type the browser claims is never trusted: a script renamed to
 * photo.jpg is rejected here. Returns null for anything that is not a JPEG, PNG, WebP, HEIC or PDF.
 */
export function detectFileType(b: Buffer): DetectedType | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg", kind: "photo" };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: "image/png", ext: "png", kind: "photo" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { contentType: "image/webp", ext: "webp", kind: "photo" };
  if (ascii(b, 0, 5) === "%PDF-") return { contentType: "application/pdf", ext: "pdf", kind: "document" };
  if (ascii(b, 4, 8) === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1"].includes(ascii(b, 8, 12))) return { contentType: "image/heic", ext: "heic", kind: "photo" };
  return null;
}

/** A safe display name: no path parts, no control characters, bounded length. Never used to build a storage path. */
export function cleanFilename(raw: string | undefined): string {
  let name = "";
  try { name = decodeURIComponent(raw ?? ""); } catch { name = raw ?? ""; }
  name = name.split(/[\\/]/).pop() ?? "";
  name = name.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 120);
  return name || "upload";
}
