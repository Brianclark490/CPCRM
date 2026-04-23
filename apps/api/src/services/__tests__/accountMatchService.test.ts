import { describe, it, expect } from 'vitest';
import {
  FREE_MAIL_DOMAINS,
  hostFromWebsite,
  normaliseName,
  stripFreeMail,
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
});
