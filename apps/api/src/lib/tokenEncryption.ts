import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for OAuth refresh tokens stored at rest.
 *
 * The key is a 32-byte (base64-encoded) secret from `MAILBOX_TOKEN_ENC_KEY`,
 * which in production lives in Azure Key Vault and is surfaced via an App
 * Service reference. Each encrypt call uses a fresh 12-byte IV; the output
 * format is the raw byte concatenation `iv || tag || ciphertext` stored as a
 * BYTEA column (no base64 wrapping — the DB column handles binary).
 *
 * Never log or return the raw plaintext to clients. The only code paths that
 * should ever hold the plaintext are the OAuth exchange and the Graph API
 * call immediately before a request is sent.
 */
const IV_LEN = 12;
const TAG_LEN = 16;
const ALGORITHM = 'aes-256-gcm';

function loadKey(): Buffer {
  const raw = process.env.MAILBOX_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error('MAILBOX_TOKEN_ENC_KEY is not configured');
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      'MAILBOX_TOKEN_ENC_KEY must decode to 32 bytes (base64 of a 32-byte key)',
    );
  }
  return buf;
}

export function encryptToken(plaintext: string): Buffer {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

export function decryptToken(payload: Buffer): string {
  if (payload.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Encrypted token payload is truncated');
  }
  const key = loadKey();
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
