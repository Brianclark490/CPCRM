import { describe, it, expect } from 'vitest';
import { resolveIcon } from '../components/iconMap.js';

describe('resolveIcon', () => {
  it('maps known icon identifiers to emoji characters', () => {
    expect(resolveIcon('clock')).toBe('🕐');
    expect(resolveIcon('target')).toBe('🎯');
    expect(resolveIcon('square')).toBe('⬜');
    expect(resolveIcon('text-cursor')).toBe('✏️');
    expect(resolveIcon('list')).toBe('📋');
    expect(resolveIcon('gauge')).toBe('📊');
  });

  it('maps field type identifiers to emoji characters', () => {
    expect(resolveIcon('text')).toBe('✏️');
    expect(resolveIcon('textarea')).toBe('📝');
    expect(resolveIcon('number')).toBe('🔢');
    expect(resolveIcon('currency')).toBe('💲');
    expect(resolveIcon('date')).toBe('📅');
    expect(resolveIcon('datetime')).toBe('📅');
    expect(resolveIcon('email')).toBe('📧');
    expect(resolveIcon('phone')).toBe('📞');
    expect(resolveIcon('url')).toBe('🔗');
    expect(resolveIcon('boolean')).toBe('✅');
    expect(resolveIcon('dropdown')).toBe('📋');
    expect(resolveIcon('multi_select')).toBe('🏷️');
  });

  it('returns emoji strings as-is when not in the map', () => {
    expect(resolveIcon('📝')).toBe('📝');
    expect(resolveIcon('📋')).toBe('📋');
    expect(resolveIcon('🏢')).toBe('🏢');
  });

  it('falls back to 📦 for empty strings', () => {
    expect(resolveIcon('')).toBe('📦');
  });

  it('returns generic fallback for unknown text identifiers', () => {
    expect(resolveIcon('unknown-icon')).toBe('📦');
  });
});
