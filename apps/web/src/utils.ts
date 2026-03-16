/**
 * Converts a display label to a snake_case API name.
 *
 * Examples:
 *   "My Custom Object" → "my_custom_object"
 *   "  Hello World  "  → "hello_world"
 *   "Object! v2.0"     → "object_v2_0"
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}
