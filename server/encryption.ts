import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
// 16-byte IV + 16-byte auth tag + at least 1 byte of ciphertext
const MIN_ENCRYPTED_BUFFER_LENGTH = 33;

function getKey(): Buffer {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error("FIELD_ENCRYPTION_KEY not set");
  if (key.length !== 64) throw new Error("Key must be 64 hex chars");
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";
  try {
    const buf = Buffer.from(ciphertext, "base64");
    if (buf.length < MIN_ENCRYPTED_BUFFER_LENGTH) return ciphertext;
    const iv = buf.subarray(0, 16);
    const authTag = buf.subarray(16, 32);
    const encrypted = buf.subarray(32);
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return ciphertext;
  }
}
