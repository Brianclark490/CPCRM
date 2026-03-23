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
 * Falls back to the raw value when no mapping exists (e.g. if the value is
 * already an emoji).
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

export function resolveIcon(icon: string): string {
  return TEXT_ICON_MAP[icon] ?? icon;
}
