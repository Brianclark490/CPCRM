import type { FieldForm, RelationshipForm } from './types.js';

export const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Datetime' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'formula', label: 'Formula (Calculated)' },
];

export const EMPTY_FORM: FieldForm = {
  label: '',
  apiName: '',
  fieldType: 'text',
  description: '',
  required: false,
  defaultValue: '',
  choices: [''],
  min: '',
  max: '',
  precision: '',
  maxLength: '',
  expression: '',
  outputType: 'number',
};

export const RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'lookup', label: 'Lookup' },
  { value: 'parent_child', label: 'Parent–Child' },
];

export const EMPTY_RELATIONSHIP_FORM: RelationshipForm = {
  targetObjectId: '',
  relationshipType: 'lookup',
  label: '',
  reverseLabel: '',
  required: false,
};
