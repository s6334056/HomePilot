const MAX_DISPLAY_LENGTH = 40;

/**
 * Truncate a path for single-line display, keeping the tail (end) portion.
 * Uses "..." as prefix when truncation is needed.
 *
 * Examples:
 *   "C:\foo\bar\baz\file.ts" → "...\bar\baz\file.ts"
 *   "/home/user/project/src/components/QRScanner.tsx" → "...\components/QRScanner.tsx"
 *   "/home" → "/home"
 */
export function truncatePath(path: string, maxLength: number = MAX_DISPLAY_LENGTH): string {
  if (!path) return '';
  if (path.length <= maxLength) return path;

  const ellipsis = '...';
  const available = maxLength - ellipsis.length;

  // Keep from the end
  const tail = path.slice(-available);
  // Find first separator in the tail to avoid splitting a segment name
  const firstSep = tail.search(/[\/\\]/);
  if (firstSep > 0) {
    return ellipsis + tail.slice(firstSep);
  }
  return ellipsis + tail;
}

/**
 * Get a display name for a session, with fallback to first user message.
 * Multi-line content is collapsed to a single line.
 */
export function getSessionTitle(
  formalTitle: string | undefined,
  firstUserMessage: string | undefined,
  maxLength: number = 40
): string {
  let raw: string;

  if (formalTitle && formalTitle.trim().length > 0) {
    raw = formalTitle;
  } else if (firstUserMessage && firstUserMessage.trim().length > 0) {
    raw = firstUserMessage;
  } else {
    raw = 'New Session';
  }

  // Collapse newlines to spaces and trim
  const singleLine = raw.replace(/\s*\n\s*/g, ' ').trim();

  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + '...';
}
