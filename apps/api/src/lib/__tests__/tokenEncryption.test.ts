import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptToken, encryptToken } from '../tokenEncryption.js';

beforeAll(() => {
  process.env.MAILBOX_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
});

describe('tokenEncryption', () => {
  it('round-trips a token', () => {
    const original = 'refresh-token-' + randomBytes(16).toString('hex');
    const enc = encryptToken(original);
    // The encrypted payload must be different from the plaintext and must
    // include the 12-byte IV, 16-byte tag, and at least one byte of ciphertext.
    expect(enc.length).toBeGreaterThan(29);
    expect(enc.toString('utf8')).not.toBe(original);
    expect(decryptToken(enc)).toBe(original);
  });

  it('produces a different ciphertext for the same plaintext each time (IV randomness)', () => {
    const value = 'stable-value';
    const a = encryptToken(value);
    const b = encryptToken(value);
    expect(a.equals(b)).toBe(false);
    expect(decryptToken(a)).toBe(value);
    expect(decryptToken(b)).toBe(value);
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptToken('payload');
    enc[enc.length - 1] ^= 0xff;
    expect(() => decryptToken(enc)).toThrow();
  });
});
