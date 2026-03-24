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
};

/**
 * Resolves an icon identifier string to a displayable emoji character.
 * If the identifier is already an emoji (not in the map), it is returned as-is.
 */
export function resolveIcon(icon: string): string {
  return ICON_MAP[icon] ?? (icon || '📦');
}
