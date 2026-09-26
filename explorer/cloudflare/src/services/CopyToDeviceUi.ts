/**
 * Presentation rules for the cross file system copy actions.
 *
 * Kept apart from `FileSystemCopy` (which only plans and moves content) so the
 * UI contract — the menu label, the in-progress message, the success/failure
 * wording, the rule that blocks a second run, and the bracket that always
 * lowers the indicator again — can be stated and tested on its own.
 *
 * Both directions share every rule below; only the wording differs, which is
 * why it is gathered in one `CopyDirectionUi` per direction.
 */

export type CopyDirection = 'to-device' | 'to-pc';

export interface CopyDirectionUi {
  /** Menu item label. */
  label: string;
  /** Message shown while the copy runs. */
  inProgress: string;
  /** Success toast. */
  done: string;
  /** Prefix of the failure alert. */
  failed: string;
  /** What the destination file system is called in conflict messages. */
  target: string;
}

export const COPY_TO_DEVICE_UI: CopyDirectionUi = {
  label: 'アプリへコピー',
  inProgress: 'アプリへコピーしています…',
  done: 'アプリへコピーしました',
  failed: 'アプリへコピーできませんでした',
  target: 'アプリ',
};

export const COPY_TO_PC_UI: CopyDirectionUi = {
  label: '自宅PCへコピー',
  inProgress: '自宅PCへコピーしています…',
  done: '自宅PCへコピーしました',
  failed: '自宅PCへコピーできませんでした',
  target: '自宅PC',
};

export const DIRECTION_UI: Record<CopyDirection, CopyDirectionUi> = {
  'to-device': COPY_TO_DEVICE_UI,
  'to-pc': COPY_TO_PC_UI,
};

export const COPY_TO_DEVICE_LABEL = COPY_TO_DEVICE_UI.label;
export const COPY_TO_PC_LABEL = COPY_TO_PC_UI.label;
export const COPY_IN_PROGRESS_MESSAGE = COPY_TO_DEVICE_UI.inProgress;

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
