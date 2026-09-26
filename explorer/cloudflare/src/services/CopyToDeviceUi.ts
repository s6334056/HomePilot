/**
 * Presentation rules for the "この端末へコピー" action.
 *
 * Kept apart from `FileSystemCopy` (which only plans and moves content) so the
 * UI contract — the label, the in-progress message, the rule that blocks a
 * second run, and the bracket that always lowers the indicator again — can be
 * stated and tested on its own.
 */

export const COPY_TO_DEVICE_LABEL = 'この端末へコピー';
export const COPY_IN_PROGRESS_MESSAGE = 'この端末へコピーしています…';

export interface CopyToDeviceAvailability {
  isExplorerReady: boolean;
  selectedCount: number;
  isCopying: boolean;
}

/** Never offer a second run: no selection, no explorer, or a copy already going. */
export function isCopyToDeviceDisabled(a: CopyToDeviceAvailability): boolean {
  return !a.isExplorerReady || a.selectedCount === 0 || a.isCopying;
}

/**
 * Raise the in-progress indicator before the first `await` and lower it again
 * however the operation ends — success, failure, or handing over to the
 * overwrite confirmation dialog.
 */
export async function withCopyIndicator<T>(
  show: () => void,
  hide: () => void,
  run: () => Promise<T>,
): Promise<T> {
  show();
  try {
    return await run();
  } finally {
    hide();
  }
}
