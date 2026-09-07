import React, { useRef, useEffect, useCallback } from 'react';
import { getReadingPosition, saveReadingPosition } from '../services/FileViewerPositionStore';

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

  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const handleScroll = () => {
      debouncedSave();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [debouncedSave]);

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

  return (
    <div className="file-viewer-container">
      <div
        ref={viewerRef}
        className="file-viewer-content"
      >
        <pre className="file-content-body">{content || '(Empty file)'}</pre>
      </div>
    </div>
  );
};
