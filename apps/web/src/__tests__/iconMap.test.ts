import { describe, it, expect } from 'vitest';
import { resolveIcon } from '../../components/iconMap.js';

describe('resolveIcon', () => {
  it('maps known icon identifiers to emoji characters', () => {
    expect(resolveIcon('clock')).toBe('🕐');
    expect(resolveIcon('target')).toBe('🎯');
    expect(resolveIcon('square')).toBe('⬜');
    expect(resolveIcon('text-cursor')).toBe('✏️');
    expect(resolveIcon('list')).toBe('📋');
  });

  it('returns emoji strings as-is when not in the map', () => {
    expect(resolveIcon('📝')).toBe('📝');
    expect(resolveIcon('📋')).toBe('📋');
    expect(resolveIcon('🏢')).toBe('🏢');
  });

  it('falls back to 📦 for empty strings', () => {
    expect(resolveIcon('')).toBe('📦');
  });

  it('returns unknown identifiers as-is', () => {
    expect(resolveIcon('unknown-icon')).toBe('unknown-icon');
  });
});
