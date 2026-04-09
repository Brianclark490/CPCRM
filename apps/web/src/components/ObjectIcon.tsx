import { resolveIcon } from '../utils.js';

interface ObjectIconProps {
  /** Icon identifier string (e.g. "building", "users") or emoji */
  icon: string;
  /** Display size in pixels. Controls font-size and dimensions. */
  size?: number;
}

/**
 * Renders an object icon consistently across the application.
 * Maps Lucide-style icon names to emoji via `resolveIcon` and displays them
 * at the requested pixel size. Always produces a visual icon — never raw text.
 */
export function ObjectIcon({ icon, size = 20 }: ObjectIconProps) {
  return (
    <span
      role="img"
      aria-hidden="true"
      style={{
        fontSize: size,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {resolveIcon(icon)}
    </span>
  );
}
