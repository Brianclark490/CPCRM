import { describe, it, expect } from 'vitest';
import {
  queryKeys,
  recordsKeys,
  objectDefinitionsKeys,
  fieldDefinitionsKeys,
  pipelinesKeys,
  pageLayoutsKeys,
} from '../queryKeys.js';

describe('queryKeys factory', () => {
  it('records keys are hierarchical so partial invalidation works', () => {
    const list = recordsKeys.list('account', { limit: 25, offset: 0 });
    const detail = recordsKeys.detail('account', 'rec-1');

    expect(list[0]).toBe('records');
    expect(list[1]).toBe('account');
    expect(list[2]).toBe('list');
    expect(list[3]).toEqual({ limit: 25, offset: 0 });

    expect(detail).toEqual(['records', 'account', 'detail', 'rec-1']);

    // Both share the per-object prefix, so invalidating that prefix nukes both.
    expect(list.slice(0, 2)).toEqual(recordsKeys.byObject('account'));
    expect(detail.slice(0, 2)).toEqual(recordsKeys.byObject('account'));
  });

  it('records.list defaults params to an empty object for stable keys', () => {
    expect(recordsKeys.list('account')).toEqual(['records', 'account', 'list', {}]);
  });

  it('object definitions expose root, all, and detail', () => {
    expect(objectDefinitionsKeys.root()).toEqual(['objectDefinitions']);
    expect(objectDefinitionsKeys.all()).toEqual(['objectDefinitions', 'all']);
    expect(objectDefinitionsKeys.detail('obj-1')).toEqual(['objectDefinitions', 'detail', 'obj-1']);
  });

  it('field definitions are scoped under their owning object', () => {
    expect(fieldDefinitionsKeys.list('obj-1')).toEqual(['fieldDefinitions', 'obj-1', 'list']);
    expect(fieldDefinitionsKeys.byObject('obj-1')).toEqual(['fieldDefinitions', 'obj-1']);
  });

  it('pipelines expose detail keyed by pipeline id', () => {
    expect(pipelinesKeys.detail('pipe-1')).toEqual(['pipelines', 'detail', 'pipe-1']);
  });

  it('page layouts cover both per-object lists and individual layouts', () => {
    expect(pageLayoutsKeys.list('obj-1')).toEqual(['pageLayouts', 'object', 'obj-1', 'list']);
    expect(pageLayoutsKeys.detail('layout-1')).toEqual(['pageLayouts', 'detail', 'layout-1']);
  });

  it('aggregate `queryKeys` re-exports each factory', () => {
    expect(queryKeys.records).toBe(recordsKeys);
    expect(queryKeys.objectDefinitions).toBe(objectDefinitionsKeys);
    expect(queryKeys.fieldDefinitions).toBe(fieldDefinitionsKeys);
    expect(queryKeys.pipelines).toBe(pipelinesKeys);
    expect(queryKeys.pageLayouts).toBe(pageLayoutsKeys);
  });
});
