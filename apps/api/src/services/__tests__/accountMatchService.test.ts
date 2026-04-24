import { describe, it, expect } from 'vitest';
import {
  FREE_MAIL_DOMAINS,
  hostFromWebsite,
  jaccardSimilarity,
  normaliseName,
  stripFreeMail,
  trigrams,
} from '../accountMatchService.js';

describe('accountMatchService helpers', () => {
  describe('stripFreeMail', () => {
    it('returns undefined for free-mail domains', () => {
      for (const d of ['gmail.com', 'hotmail.com', 'outlook.com']) {
        expect(FREE_MAIL_DOMAINS.has(d)).toBe(true);
        expect(stripFreeMail(d)).toBeUndefined();
      }
    });
    it('returns the domain for corporate senders', () => {
      expect(stripFreeMail('Acme.com')).toBe('acme.com');
    });
    it('passes through undefined', () => {
      expect(stripFreeMail(undefined)).toBeUndefined();
    });
  });

  describe('normaliseName', () => {
    it('lowercases and strips corporate suffixes', () => {
      expect(normaliseName('Acme, Inc.')).toBe('acme');
      expect(normaliseName('Acme Ltd')).toBe('acme');
      expect(normaliseName('Acme GmbH')).toBe('acme');
      expect(normaliseName('Acme LLC')).toBe('acme');
    });
    it('collapses whitespace and punctuation', () => {
      expect(normaliseName('  Acme   &  Co. ')).toBe('acme');
    });
  });

  describe('hostFromWebsite', () => {
    it('extracts the hostname from a URL', () => {
      expect(hostFromWebsite('https://www.acme.com/about')).toBe('acme.com');
      expect(hostFromWebsite('http://sub.acme.co.uk')).toBe('sub.acme.co.uk');
    });
    it('accepts bare hostnames', () => {
      expect(hostFromWebsite('acme.com')).toBe('acme.com');
    });
    it('returns undefined for invalid input', () => {
      expect(hostFromWebsite(undefined)).toBeUndefined();
      expect(hostFromWebsite('')).toBeUndefined();
      expect(hostFromWebsite('not a url')).toBeUndefined();
    });
  });

  describe('trigrams + jaccardSimilarity', () => {
    it('produces padded trigrams for short strings', () => {
      const grams = trigrams('acme');
      // '  a', ' ac', 'acm', 'cme', 'me '
      expect(grams.size).toBe(5);
      expect(grams.has('acm')).toBe(true);
      expect(grams.has('cme')).toBe(true);
    });

    it('tokenises on whitespace so no cross-word trigrams appear (pg_trgm parity)', () => {
      const grams = trigrams('foo bar');
      // Cross-word grams like 'o b', 'oo ', ' ba' should NOT appear; each
      // word is padded and scanned independently.
      expect(grams.has('o b')).toBe(false);
      // 'foo' and 'bar' per-word trigrams should both be present.
      expect(grams.has('foo')).toBe(true);
      expect(grams.has('bar')).toBe(true);
      expect(grams.has('  f')).toBe(true);
      expect(grams.has('  b')).toBe(true);
    });

    it('splits on non-alphanumeric separators (pg_trgm parity)', () => {
      const hyphen = trigrams('foo-bar');
      const space = trigrams('foo bar');
      // Same tokens, same grams regardless of separator character.
      expect([...hyphen].sort()).toEqual([...space].sort());
    });

    it('returns an empty set for empty / whitespace-only input', () => {
      expect(trigrams('').size).toBe(0);
      expect(trigrams('   ').size).toBe(0);
      // Two empty inputs score 0, not 1.
      expect(jaccardSimilarity(trigrams(''), trigrams(''))).toBe(0);
    });

    it('identical strings score 1.0', () => {
      const a = trigrams('acme');
      const b = trigrams('acme');
      expect(jaccardSimilarity(a, b)).toBe(1);
    });

    it('disjoint strings score 0', () => {
      const a = trigrams('acme');
      const b = trigrams('zzzz');
      expect(jaccardSimilarity(a, b)).toBe(0);
    });

    it('near-identical names score above the 0.35 match threshold', () => {
      const a = trigrams(normaliseName('Acme Corporation'));
      const b = trigrams(normaliseName('ACME Corp'));
      expect(jaccardSimilarity(a, b)).toBeGreaterThan(0.35);
    });

    it('unrelated companies score below the match threshold', () => {
      const a = trigrams(normaliseName('Acme Ltd'));
      const b = trigrams(normaliseName('Contoso Ltd'));
      expect(jaccardSimilarity(a, b)).toBeLessThan(0.35);
    });

    it('empty inputs score 0', () => {
      expect(jaccardSimilarity(new Set(), new Set(['abc']))).toBe(0);
      expect(jaccardSimilarity(new Set(['abc']), new Set())).toBe(0);
    });
  });
});
