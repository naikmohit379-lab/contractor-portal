import { describe, expect, it } from "vitest";
import { cleanFilename, detectFileType } from "./fileType";

const pad = (b: number[] | Buffer) => Buffer.concat([Buffer.from(b as number[]), Buffer.alloc(16)]);

describe("file type detection", () => {
  it("reads the type from the bytes", () => {
    expect(detectFileType(pad([0xff, 0xd8, 0xff, 0xe0]))?.contentType).toBe("image/jpeg");
    expect(detectFileType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(detectFileType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]))?.contentType).toBe("image/webp");
    expect(detectFileType(pad(Buffer.from("%PDF-1.7")))?.kind).toBe("document");
    expect(detectFileType(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypheic"), Buffer.alloc(8)]))?.contentType).toBe("image/heic");
  });
  it("rejects scripts and tiny files no matter what they are called", () => {
    expect(detectFileType(pad(Buffer.from("<script>alert(1)</script>")))).toBeNull();
    expect(detectFileType(Buffer.from("tiny"))).toBeNull();
  });
  it("cleans file names", () => {
    expect(cleanFilename("..\\..\\evil/../roof%20photo.jpg")).toBe("roof photo.jpg");
    expect(cleanFilename("a\u0000b<c>.png")).toBe("abc.png");
    expect(cleanFilename("")).toBe("upload");
    expect(cleanFilename("x".repeat(500)).length).toBe(120);
  });
});
