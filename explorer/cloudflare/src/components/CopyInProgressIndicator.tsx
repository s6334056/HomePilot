import React from 'react';
import { COPY_IN_PROGRESS_MESSAGE } from '../services/CopyToDeviceUi';

interface CopyInProgressIndicatorProps {
  isVisible: boolean;
  /** Direction specific wording; defaults to the "to this device" message. */
  message?: string;
}

/**
 * Bottom pill shown while a cross file system copy is running — planning,
 * reading the source, or writing the destination. Unlike `Toast` it never auto
 * dismisses: it disappears as soon as `isVisible` goes back to false.
 */
export const CopyInProgressIndicator: React.FC<CopyInProgressIndicatorProps> = ({
  isVisible,
  message = COPY_IN_PROGRESS_MESSAGE,
}) => {
  if (!isVisible) return null;

  return (
    <div className="hp-toast hp-toast--processing" role="status" aria-live="polite">
      <svg
        className="spin hp-toast-spinner"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
      <div className="hp-toast-message">{message}</div>
    </div>
  );
};

