import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | undefined;

/**
 * Returns a lazily-initialised Anthropic client. The API key is read on first
 * call so startup doesn't fail in environments where the key is absent (for
 * example, tests that never touch the email-ingest path).
 *
 * Throws if `ANTHROPIC_API_KEY` is missing at call time so the caller surfaces
 * a clear 503 rather than a cryptic SDK error.
 */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
