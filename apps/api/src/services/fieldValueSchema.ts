import { z, type ZodTypeAny } from 'zod';
import type { FieldDefinitionRow } from './recordService.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Field types that should be skipped during validation (computed, not user-provided)
const SKIP_FIELD_TYPES = new Set(['formula']);

// ─── Per-field Zod schema builders ───────────────────────────────────────────

function textSchema(options: Record<string, unknown>): ZodTypeAny {
  let schema = z.string();
  const maxLength = options.max_length as number | undefined;
  if (maxLength !== undefined) {
    schema = schema.max(maxLength);
  }
  return schema;
}

function textareaSchema(): ZodTypeAny {
  return z.string();
}

function numberSchema(options: Record<string, unknown>): ZodTypeAny {
  // Accept string or number inputs, coerce to number
  const schema = z.preprocess((val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = Number(val);
      if (!isNaN(n) && isFinite(n)) return n;
    }
    return val; // let z.number() reject it
  }, buildNumberConstraints(z.number(), options));

  return schema;
}

function currencySchema(options: Record<string, unknown>): ZodTypeAny {
  // Same coercion as number
  const opts = { ...options };
  if (opts.min === undefined) opts.min = 0;
  return z.preprocess((val) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = Number(val);
      if (!isNaN(n) && isFinite(n)) return n;
    }
    return val;
  }, buildNumberConstraints(z.number(), opts));
}

function buildNumberConstraints(
  schema: z.ZodNumber,
  options: Record<string, unknown>,
): z.ZodNumber {
  let result = schema;
  const min = options.min as number | undefined;
  const max = options.max as number | undefined;
  if (min !== undefined) result = result.min(min);
  if (max !== undefined) result = result.max(max);
  return result;
}

function dateSchema(): ZodTypeAny {
  return z.string().regex(ISO_DATE_RE, 'Must be a valid date (YYYY-MM-DD)').refine(
    (val) => !isNaN(new Date(val).getTime()),
    { message: 'Must be a valid date (YYYY-MM-DD)' },
  );
}

function datetimeSchema(): ZodTypeAny {
  return z.string().refine(
    (val) => !isNaN(new Date(val).getTime()),
    { message: 'Must be a valid datetime' },
  );
}

function emailSchema(): ZodTypeAny {
  return z.string().regex(EMAIL_RE, 'Must be a valid email');
}

function phoneSchema(): ZodTypeAny {
  return z.string();
}

function urlSchema(): ZodTypeAny {
  return z.string().refine(
    (val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid URL (http or https)' },
  );
}

function booleanSchema(): ZodTypeAny {
  return z.boolean();
}

function dropdownSchema(options: Record<string, unknown>): ZodTypeAny {
  // Pipeline-managed dropdowns get choices from stage_definitions, not options
  if (options.pipeline_managed === true) {
    return z.string();
  }
  const choices = (options.choices as string[]) ?? [];
  if (choices.length === 0) {
    return z.string();
  }
  return z.enum(choices as [string, ...string[]]);
}

function multiSelectSchema(options: Record<string, unknown>): ZodTypeAny {
  const choices = (options.choices as string[]) ?? [];
  if (choices.length === 0) {
    return z.array(z.string());
  }
  return z.array(z.enum(choices as [string, ...string[]]));
}

// ─── Schema builder per field type ───────────────────────────────────────────

function buildFieldSchema(fieldDef: FieldDefinitionRow): ZodTypeAny | null {
  const { fieldType, options } = fieldDef;

  switch (fieldType) {
    case 'text':
      return textSchema(options);
    case 'textarea':
      return textareaSchema();
    case 'number':
      return numberSchema(options);
    case 'currency':
      return currencySchema(options);
    case 'date':
      return dateSchema();
    case 'datetime':
      return datetimeSchema();
    case 'email':
      return emailSchema();
    case 'phone':
      return phoneSchema();
    case 'url':
      return urlSchema();
    case 'boolean':
      return booleanSchema();
    case 'dropdown':
      return dropdownSchema(options);
    case 'multi_select':
      return multiSelectSchema(options);
    default:
      // Unknown field types (formula, etc.) — skip
      return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface FieldValidationErrors {
  [fieldApiName: string]: string;
}

/**
 * Build a dynamic Zod schema from field definitions and validate fieldValues.
 *
 * - Builds a Zod schema per field type, honouring options (max_length, min, max, choices, etc.)
 * - Type coercion: string "123" → number 123 for number/currency fields
 * - Strips unknown fields not present in field definitions
 * - Skips formula and pipeline_managed fields
 * - Returns per-field error messages on failure
 *
 * @param partial  When true, all fields are optional (for updates)
 * @returns An object with `success`, `data` (coerced+stripped values), and `fieldErrors`
 */
export function validateWithZod(
  fieldValues: Record<string, unknown>,
  fieldDefs: FieldDefinitionRow[],
  partial: boolean = false,
): { success: true; data: Record<string, unknown> } | { success: false; fieldErrors: FieldValidationErrors } {
  const shape: Record<string, ZodTypeAny> = {};

  for (const fd of fieldDefs) {
    // Skip computed field types
    if (SKIP_FIELD_TYPES.has(fd.fieldType)) continue;
    // Skip pipeline_managed dropdown fields in partial updates
    // (they're set by stage movement, not direct user input)
    if (fd.fieldType === 'dropdown' && fd.options.pipeline_managed === true && partial) continue;

    const fieldSchema = buildFieldSchema(fd);
    if (!fieldSchema) continue;

    if (partial) {
      // For updates, all fields are optional — only validate what's provided
      shape[fd.apiName] = fieldSchema.optional().nullable();
    } else if (fd.required) {
      // For creates, required fields must be present and non-empty
      shape[fd.apiName] = fieldSchema;
    } else {
      shape[fd.apiName] = fieldSchema.optional().nullable();
    }
  }

  const zodSchema = z.object(shape).strip(); // strip() removes unknown keys

  const result = zodSchema.safeParse(fieldValues);

  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }

  // Convert ZodError into per-field error messages (Zod v4 issue types)
  const fieldErrors: FieldValidationErrors = {};
  const fieldMap = new Map(fieldDefs.map((fd) => [fd.apiName, fd]));

  for (const issue of result.error.issues) {
    const fieldName = String(issue.path[0] ?? '');
    const fd = fieldMap.get(fieldName);
    const label = fd?.label ?? fieldName;

    if (fieldErrors[fieldName]) continue; // keep first error per field

    if (issue.code === 'invalid_type' && issue.message.includes('received undefined')) {
      fieldErrors[fieldName] = `Field '${label}' is required`;
    } else if (issue.code === 'invalid_value') {
      // Zod v4 uses invalid_value for enum mismatches
      const choices = (fd?.options.choices as string[]) ?? [];
      fieldErrors[fieldName] = `Field '${label}' must be one of: ${choices.join(', ')}`;
    } else if (issue.code === 'too_big') {
      const unit = issue.origin === 'string' ? 'characters ' : '';
      fieldErrors[fieldName] = `Field '${label}' must be ${issue.maximum} ${unit}or fewer`;
    } else if (issue.code === 'too_small') {
      fieldErrors[fieldName] = `Field '${label}' must be at least ${issue.minimum}`;
    } else {
      fieldErrors[fieldName] = `Field '${label}': ${issue.message}`;
    }
  }

  return { success: false, fieldErrors };
}
