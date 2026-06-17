import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";

export class SessionEncryptionError extends Error {
  status = 503;

  constructor(message = "OUTREACH_SESSION_ENCRYPTION_KEY is not configured.") {
    super(message);
    this.name = "SessionEncryptionError";
  }
}

export function hasSessionEncryptionKey() {
  return Boolean(process.env.OUTREACH_SESSION_ENCRYPTION_KEY?.trim());
}

function getSessionEncryptionKey() {
  const raw = process.env.OUTREACH_SESSION_ENCRYPTION_KEY?.trim();

  if (!raw) {
    throw new SessionEncryptionError();
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to deterministic hashing for human-readable keys.
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getSessionEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;

  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) {
    throw new SessionEncryptionError("Stored session secret has an invalid format.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getSessionEncryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
