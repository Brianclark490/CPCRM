import { describe, it, expect } from 'vitest';
import {
  COMPONENT_REGISTRY,
  VALID_COMPONENT_TYPES,
  getComponentDefinition,
  isComponentAllowedInZone,
} from '../componentRegistry.js';

describe('componentRegistry', () => {
  describe('VALID_COMPONENT_TYPES', () => {
    it('contains one entry per registered component', () => {
      expect(VALID_COMPONENT_TYPES.size).toBe(COMPONENT_REGISTRY.length);
    });

    it('includes the rail palette types (issue #518)', () => {
      expect(VALID_COMPONENT_TYPES.has('identity')).toBe(true);
      expect(VALID_COMPONENT_TYPES.has('contacts')).toBe(true);
      expect(VALID_COMPONENT_TYPES.has('activity')).toBe(true);
    });
  });

  describe('getComponentDefinition', () => {
    it('returns the definition for a registered type', () => {
      const def = getComponentDefinition('identity');
      expect(def?.type).toBe('identity');
      expect(def?.allowedZones).toContain('leftRail');
      expect(def?.allowedZones).toContain('rightRail');
      expect(def?.allowedZones).toContain('main');
      expect(def?.allowedZones).not.toContain('kpi');
    });

    it('returns undefined for an unregistered type', () => {
      expect(getComponentDefinition('nonexistent')).toBeUndefined();
    });
  });

  describe('isComponentAllowedInZone', () => {
    it('allows rail components (identity, contacts, activity) in the rails and main', () => {
      for (const type of ['identity', 'contacts', 'activity']) {
        expect(isComponentAllowedInZone(type, 'leftRail')).toBe(true);
        expect(isComponentAllowedInZone(type, 'rightRail')).toBe(true);
        expect(isComponentAllowedInZone(type, 'main')).toBe(true);
      }
    });

    it('rejects rail components in the kpi zone', () => {
      for (const type of ['identity', 'contacts', 'activity']) {
        expect(isComponentAllowedInZone(type, 'kpi')).toBe(false);
      }
    });

    it('returns false for unknown component types', () => {
      expect(isComponentAllowedInZone('nonexistent', 'kpi')).toBe(false);
    });
  });
});
