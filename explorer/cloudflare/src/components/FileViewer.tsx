import React, { useRef, useEffect, useCallback, useState } from 'react';
import { getReadingPosition, saveReadingPosition } from '../services/FileViewerPositionStore';
import { loadAutoScrollSettings } from '../services/AutoScrollSettings';

interface FileViewerProps {
  content: string;
  filePath?: string;
}

export const FileViewer: React.FC<FileViewerProps> = ({
  content,
  filePath,
}) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionRestoredRef = useRef(false);

  // Auto Scroll state
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollEnabledRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const [indicatorText, setIndicatorText] = useState<string | null>(null);
  const indicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reading Position Save ──────────────────────────────────

  const savePosition = useCallback(() => {
    if (!filePath || !viewerRef.current) return;
    saveReadingPosition('pwa', filePath, viewerRef.current.scrollTop);
  }, [filePath]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      savePosition();
    }, 400);
  }, [savePosition]);

  useEffect(() => {
    positionRestoredRef.current = false;
  }, [filePath, content]);

  // ── Auto Scroll Logic ──────────────────────────────────────

  const clearAutoScrollTimer = useCallback(() => {
    if (autoScrollTimerRef.current !== null) {
      clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  const showIndicator = useCallback((text: string) => {
    setIndicatorText(text);
    if (indicatorTimerRef.current !== null) {
      clearTimeout(indicatorTimerRef.current);
    }
    indicatorTimerRef.current = setTimeout(() => {
      setIndicatorText(null);
      indicatorTimerRef.current = null;
    }, 1500);
  }, []);

  const isAtEnd = useCallback((): boolean => {
    const el = viewerRef.current;
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  }, []);

  const stopAutoScroll = useCallback(() => {
    autoScrollEnabledRef.current = false;
    clearAutoScrollTimer();
  }, [clearAutoScrollTimer]);

  const scheduleNextAutoScroll = useCallback(() => {
    clearAutoScrollTimer();
    if (!autoScrollEnabledRef.current) return;

    const settings = loadAutoScrollSettings();
    autoScrollTimerRef.current = setTimeout(() => {
      autoScrollTimerRef.current = null;

      if (!autoScrollEnabledRef.current) return;

      const el = viewerRef.current;
      if (!el) return;

      if (isAtEnd()) {
        stopAutoScroll();
        return;
      }

      const viewHeight = el.clientHeight;
      const currentSettings = loadAutoScrollSettings();
      let amount: number;
      switch (currentSettings.amount) {
        case 'small':  amount = viewHeight * 0.25; break;
        case 'large':  amount = viewHeight * 0.50; break;
        default:       amount = viewHeight * 0.33; break;
      }

      isAutoScrollingRef.current = true;
      el.scrollBy({ top: amount, behavior: 'smooth' });

      // Release the flag after smooth scroll settles
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 500);

      scheduleNextAutoScroll();
    }, settings.interval * 1000);
  }, [clearAutoScrollTimer, isAtEnd, stopAutoScroll]);

  const toggleAutoScroll = useCallback(() => {
    if (autoScrollEnabledRef.current) {
      stopAutoScroll();
      showIndicator('\u25CF AUTO');
    } else {
      autoScrollEnabledRef.current = true;
      showIndicator('\u25B6 AUTO');
      scheduleNextAutoScroll();
    }
  }, [stopAutoScroll, showIndicator, scheduleNextAutoScroll]);

  // Scroll listener: save position + reset auto scroll timer on manual scroll
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const handleScroll = () => {
      debouncedSave();
      if (autoScrollEnabledRef.current && !isAutoScrollingRef.current) {
        clearAutoScrollTimer();
        scheduleNextAutoScroll();
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [debouncedSave, clearAutoScrollTimer, scheduleNextAutoScroll]);

  // Restore reading position
  useEffect(() => {
    if (!filePath || positionRestoredRef.current) return;

    const el = viewerRef.current;
    if (!el) return;

    const saved = getReadingPosition('pwa', filePath);
    if (saved !== null && saved > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = saved;
        positionRestoredRef.current = true;
      });
    } else {
      positionRestoredRef.current = true;
    }
  }, [filePath, content]);

  // Cleanup on unmount or file change
  useEffect(() => {
    return () => {
      clearAutoScrollTimer();
      autoScrollEnabledRef.current = false;
      if (indicatorTimerRef.current !== null) {
        clearTimeout(indicatorTimerRef.current);
        indicatorTimerRef.current = null;
      }
    };
  }, [filePath, clearAutoScrollTimer]);

  return (
    <div className="file-viewer-container">
      <div
        ref={viewerRef}
        className="file-viewer-content"
        onClick={toggleAutoScroll}
      >
        <pre className="file-content-body">{content || '(Empty file)'}</pre>
      </div>
      {indicatorText && (
        <div className="auto-scroll-indicator">{indicatorText}</div>
      )}
    </div>
  );
};
