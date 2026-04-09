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

/**
 * Maps Lucide-style icon names to emoji equivalents.
 * Used by the ObjectIcon component and resolveIcon function
 * to ensure icon names are always rendered as visual icons.
 */
const TEXT_ICON_MAP: Record<string, string> = {
  building: '🏢',
  'dollar-sign': '💰',
  person: '👤',
  user: '👤',
  'user-plus': '👥',
  'trending-up': '📈',
  calendar: '📅',
  'check-circle': '✅',
  'file-text': '📄',
  'message-square': '💬',
  paperclip: '📎',
  users: '👥',
  briefcase: '💼',
  clipboard: '📋',
  target: '🎯',
  money: '💰',
  chart: '📊',
  wrench: '🔧',
  star: '⭐',
  note: '📝',
  folder: '🗂️',
  package: '📦',
};

/**
 * Resolves an icon identifier string to a displayable emoji character.
 * Returns the mapped emoji for known identifiers, passes through emoji
 * strings as-is, and falls back to 📦 for unrecognised text identifiers.
 */
export function resolveIcon(icon: string): string {
  if (!icon) return '📦';
  if (TEXT_ICON_MAP[icon]) return TEXT_ICON_MAP[icon];
  // If the string contains non-ASCII characters it is likely already an emoji
  if (/[^\x00-\x7F]/.test(icon)) return icon;
  // Unknown text identifier — show generic fallback instead of raw text
  return '📦';
}
