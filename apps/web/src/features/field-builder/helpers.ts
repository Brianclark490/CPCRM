import type { FieldDefinition, FieldForm } from './types.js';

export function buildOptionsPayload(form: FieldForm): Record<string, unknown> | undefined {
  const { fieldType } = form;

  if (fieldType === 'dropdown' || fieldType === 'multi_select') {
    const choices = form.choices.map((c) => c.trim()).filter(Boolean);
    return choices.length > 0 ? { choices } : undefined;
  }

  if (fieldType === 'number' || fieldType === 'currency') {
    const opts: Record<string, number> = {};
    if (form.min !== '') opts.min = Number(form.min);
    if (form.max !== '') opts.max = Number(form.max);
    if (form.precision !== '') opts.precision = Number(form.precision);
    return Object.keys(opts).length > 0 ? opts : undefined;
  }

  if (fieldType === 'text') {
    if (form.maxLength !== '') {
      return { max_length: Number(form.maxLength) };
    }
  }

  if (fieldType === 'formula') {
    const opts: Record<string, unknown> = {
      expression: form.expression.trim(),
    };
    if (form.outputType) opts.output_type = form.outputType;
    if (form.precision !== '') opts.precision = Number(form.precision);
    return opts;
  }

  return undefined;
}

export function formFromField(field: FieldDefinition): FieldForm {
  const opts = field.options ?? {};
  return {
    label: field.label,
    apiName: field.apiName,
    fieldType: field.fieldType,
    description: field.description ?? '',
    required: field.required,
    defaultValue: field.defaultValue ?? '',
    choices: Array.isArray(opts.choices) ? (opts.choices as string[]) : [''],
    min: typeof opts.min === 'number' ? String(opts.min) : '',
    max: typeof opts.max === 'number' ? String(opts.max) : '',
    precision: typeof opts.precision === 'number' ? String(opts.precision) : '',
    maxLength: typeof opts.max_length === 'number' ? String(opts.max_length) : '',
    expression: typeof opts.expression === 'string' ? (opts.expression as string) : '',
    outputType: typeof opts.output_type === 'string' ? (opts.output_type as string) : 'number',
  };
}
