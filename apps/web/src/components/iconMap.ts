/**
 * Maps icon identifier strings (returned by the component registry API)
 * to emoji characters for display in the builder palette and canvas.
 */
const ICON_MAP: Record<string, string> = {
  'text-cursor': '✏️',
  list: '📋',
  clock: '🕐',
  target: '🎯',
  square: '⬜',
  gauge: '📊',
  // Field-type icons
  text: '✏️',
  textarea: '📝',
  number: '🔢',
  currency: '💲',
  date: '📅',
  datetime: '📅',
  email: '📧',
  phone: '📞',
  url: '🔗',
  boolean: '✅',
  dropdown: '📋',
  multi_select: '🏷️',
};

/**
 * Resolves an icon identifier string to a displayable emoji character.
 * If the identifier is already an emoji (not in the map), it is returned as-is.
 * Unknown text identifiers fall back to 📦.
 */
export function resolveIcon(icon: string): string {
  if (!icon) return '📦';
  if (ICON_MAP[icon]) return ICON_MAP[icon];
  // If the string contains non-ASCII characters it is likely already an emoji
  if (/[\u0080-\uFFFF]/.test(icon)) return icon;
  return '📦';
}
