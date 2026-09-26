import React from 'react';
import { COPY_IN_PROGRESS_MESSAGE } from '../services/CopyToDeviceUi';

interface CopyInProgressIndicatorProps {
  isVisible: boolean;
}

/**
 * Bottom pill shown while "この端末へコピー" is running — planning, reading
 * the home PC, or writing to this device. Unlike `Toast` it never auto
 * dismisses: it disappears as soon as `isVisible` goes back to false.
 */
export const CopyInProgressIndicator: React.FC<CopyInProgressIndicatorProps> = ({ isVisible }) => {
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
      <div className="hp-toast-message">{COPY_IN_PROGRESS_MESSAGE}</div>
    </div>
  );
};
