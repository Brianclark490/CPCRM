/**
 * @deprecated The legacy opportunity CRUD functions have been retired. All
 * opportunity CRUD now goes through the dynamic records engine
 * (recordService + /api/objects/opportunity/records).
 *
 * Only the validation helpers are kept here for potential reuse.
 */

/**
 * Validates the opportunity title.
 * Returns an error message string, or null if valid.
 */
export function validateTitle(title: unknown): string | null {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return 'Opportunity title is required';
  }
  if (title.trim().length > 200) {
    return 'Opportunity title must be 200 characters or fewer';
  }
  return null;
}

/**
 * Validates the accountId field when provided.
 * Returns an error message string, or null if valid.
 */
export function validateAccountId(accountId: unknown): string | null {
  if (accountId === undefined || accountId === null) return null;
  if (typeof accountId !== 'string' || accountId.trim().length === 0) {
    return 'Account ID must be a non-empty string';
  }
  return null;
}

/**
 * Validates the estimated value field.
 * Returns an error message string, or null if valid.
 */
export function validateValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return 'Estimated value must be a valid number';
  }
  return null;
}

/**
 * Validates the expected close date field.
 * Returns an error message string, or null if valid.
 */
export function validateExpectedCloseDate(date: unknown): string | null {
  if (date === undefined || date === null || date === '') return null;
  const d = new Date(date as string);
  if (isNaN(d.getTime())) {
    return 'Close date must be a valid date';
  }
  return null;
}
