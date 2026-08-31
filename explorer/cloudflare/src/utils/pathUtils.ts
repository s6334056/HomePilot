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
 * Compute a head...tail truncated path that fits within availableWidthPx.
 * Keeps the tail (filename) portion longer to prioritize end visibility.
 * Uses 7.2px per character (12px monospace font) with a 2-char safety margin.
 */
export function computeHeadTailPath(
  path: string,
  availableWidthPx: number,
): string {
  if (!path) return '';
  const charWidth = 7.2;
  const safetyMargin = 2;
  const maxChars = Math.max(0, Math.floor(availableWidthPx / charWidth) - safetyMargin);
  if (path.length <= maxChars) return path;

  const ellipsisLen = 3;
  const headBudget = Math.min(12, Math.floor((maxChars - ellipsisLen) * 0.4));
  const tailBudget = maxChars - ellipsisLen - headBudget;

  if (headBudget < 4 || tailBudget < 4) {
    const minTail = Math.max(tailBudget, 6);
    const tail = path.slice(-minTail);
    return '...' + tail;
  }

  const head = path.slice(0, headBudget);
  const tail = path.slice(-tailBudget);
  return head + '...' + tail;
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
