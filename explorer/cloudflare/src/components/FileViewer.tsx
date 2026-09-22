import React, { useRef, useEffect, useCallback, useState, useMemo, useImperativeHandle, useLayoutEffect } from 'react';
import { loadAutoScrollSettings } from '../services/AutoScrollSettings';
import { getSharedPosition, saveSharedPosition } from '../services/SharedPositionStore';
import { GatewayFileSystemService } from '../services/GatewayFileSystemService';

function computeScrollProgress(el: HTMLDivElement): number {
  const maxScroll = el.scrollHeight - el.clientHeight;
  return maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollTop / maxScroll)) : 0;
}

const EMPTY_FILE_LABEL = '(Empty file)';

// Serialize the editable body DOM back to plain text.
// The body normally contains only text nodes (plaintext-only mode and
// intercepted Enter/Paste keep it that way), but block elements and <br>
// produced by browser defaults are converted back to newlines as a safety
// net so the text round-trips on any browser.
function readEditableText(el: HTMLElement): string {
  let out = '';
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const name = node.nodeName;
    if (name === 'BR') {
      out += '\n';
      return;
    }
    const isBlock =
      name === 'DIV' ||
      name === 'P' ||
      name === 'BLOCKQUOTE' ||
      name === 'LI' ||
      name === 'TR' ||
      /^H[1-6]$/.test(name);
    if (isBlock && out.length > 0 && !out.endsWith('\n')) {
      out += '\n';
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
    }
    if (isBlock && !out.endsWith('\n')) {
      out += '\n';
    }
  };
  for (let i = 0; i < el.childNodes.length; i++) {
    walk(el.childNodes[i]);
  }
  // Some browsers append a trailing <br> to a contenteditable host. It is an
  // artifact, not a real trailing newline (real newlines are inserted as "\n").
  if (el.lastChild && el.lastChild.nodeName === 'BR' && out.endsWith('\n')) {
    out = out.slice(0, -1);
  }
  return out;
}

export interface FileViewerHandle {
  getEditedText(): string | null;
}

interface FileViewerProps {
  content: string;
  filePath?: string;
  gatewayService?: GatewayFileSystemService | null;
  editing?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

export const FileViewer = React.forwardRef<FileViewerHandle, FileViewerProps>(
  function FileViewer({
    content,
    filePath,
    gatewayService,
    editing = false,
    onDirtyChange,
  }, ref) {
    const viewerRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLPreElement>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const positionRestoredRef = useRef(false);

    // Auto Scroll state
    const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoScrollEnabledRef = useRef(false);
    const isAutoScrollingRef = useRef(false);
    const autoScrollNextScrollTimeRef = useRef<number>(0);
    const [indicatorText, setIndicatorText] = useState<string | null>(null);
    const autoScrollIndicatorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Detect contenteditable="plaintext-only" support (Chrome 130+,
    // Safari 17.4+, Firefox 136+). Unsupported browsers report "inherit".
    const supportsPlainTextOnly = useMemo(() => {
      try {
        const probe = document.createElement('div');
        probe.contentEditable = 'plaintext-only';
        return probe.contentEditable === 'plaintext-only';
      } catch {
        return false;
      }
    }, []);

    // ── Edit mode: dirty tracking & body text sync ─────────────

    const reportDirty = useCallback(() => {
      const el = bodyRef.current;
      if (!el) return;
      onDirtyChange?.(readEditableText(el) !== content);
    }, [content, onDirtyChange]);

    // The body text is managed imperatively so React never overwrites the
    // contenteditable DOM (which would reset the caret while typing).
    // Runs before paint: no flicker, same scroll container, no remount.
    useLayoutEffect(() => {
      const el = bodyRef.current;
      if (!el) return;
      const desired = editing ? content : content || EMPTY_FILE_LABEL;
      if (el.textContent !== desired) {
        el.textContent = desired;
      }
      if (editing) {
        onDirtyChange?.(false);
      }
    }, [editing, content, onDirtyChange]);

    useImperativeHandle(
      ref,
      () => ({
        getEditedText: () => {
          if (!editing) return null;
          const el = bodyRef.current;
          return el ? readEditableText(el) : null;
        },
      }),
      [editing],
    );

    // ── Reading Position Save ──────────────────────────────────

    const savePosition = useCallback(() => {
      if (!filePath || !viewerRef.current) return;
      const el = viewerRef.current;
      // Save scroll progress (0.0 ~ 1.0) to Gateway
      if (gatewayService) {
        const progress = computeScrollProgress(el);
        saveSharedPosition(gatewayService, filePath, progress);
      }
    }, [filePath, gatewayService]);

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

    const stopIndicatorInterval = useCallback(() => {
      if (autoScrollIndicatorIntervalRef.current !== null) {
        clearInterval(autoScrollIndicatorIntervalRef.current);
        autoScrollIndicatorIntervalRef.current = null;
      }
    }, []);

    const startIndicatorInterval = useCallback(() => {
      stopIndicatorInterval();
      autoScrollIndicatorIntervalRef.current = setInterval(() => {
        if (!autoScrollEnabledRef.current) {
          stopIndicatorInterval();
          setIndicatorText(null);
          return;
        }
        const remainingMs = autoScrollNextScrollTimeRef.current - Date.now();
        if (remainingMs <= 0) {
          setIndicatorText(null);
          return;
        }
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        setIndicatorText(`${remainingSeconds} AUTO`);
      }, 400);
    }, [stopIndicatorInterval]);

    const isAtEnd = useCallback((): boolean => {
      const el = viewerRef.current;
      if (!el) return true;
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    }, []);

    const stopAutoScroll = useCallback(() => {
      autoScrollEnabledRef.current = false;
      autoScrollNextScrollTimeRef.current = 0;
      clearAutoScrollTimer();
      stopIndicatorInterval();
      setIndicatorText(null);
    }, [clearAutoScrollTimer, stopIndicatorInterval]);

    const scheduleNextAutoScroll = useCallback(() => {
      clearAutoScrollTimer();
      if (!autoScrollEnabledRef.current) return;

      const settings = loadAutoScrollSettings();
      autoScrollNextScrollTimeRef.current = Date.now() + settings.interval * 1000;
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
      } else {
        autoScrollEnabledRef.current = true;
        const settings = loadAutoScrollSettings();
        autoScrollNextScrollTimeRef.current = Date.now() + settings.interval * 1000;
        setIndicatorText(`${settings.interval} AUTO`);
        startIndicatorInterval();
        scheduleNextAutoScroll();
      }
    }, [stopAutoScroll, startIndicatorInterval, scheduleNextAutoScroll]);

    // Editing needs a stable viewport — stop any running auto scroll.
    useEffect(() => {
      if (editing) {
        stopAutoScroll();
      }
    }, [editing, stopAutoScroll]);

    // Click on the body: in view mode this toggles auto scroll (existing
    // behavior); in edit mode a click means "place the caret here", so the
    // viewer click handling must not run.
    const handleContentClick = useCallback(() => {
      if (editing) return;
      toggleAutoScroll();
    }, [editing, toggleAutoScroll]);

    const insertPlainText = useCallback((text: string): boolean => {
      let inserted = false;
      try {
        inserted = document.execCommand('insertText', false, text);
      } catch {
        inserted = false;
      }
      if (!inserted) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return true;
    }, []);

    const handleBodyInput = useCallback(() => {
      reportDirty();
    }, [reportDirty]);

    const handleBodyKeyDown = useCallback((e: React.KeyboardEvent<HTMLPreElement>) => {
      if (!editing || e.key !== 'Enter') return;
      const native = e.nativeEvent;
      // During IME composition Enter confirms the conversion — let it through.
      if (native.isComposing || native.keyCode === 229) return;
      e.preventDefault();
      // Insert a real "\n" so every browser behaves the same inside <pre>.
      if (insertPlainText('\n')) {
        reportDirty();
      }
    }, [editing, insertPlainText, reportDirty]);

    const handleBodyPaste = useCallback((e: React.ClipboardEvent<HTMLPreElement>) => {
      if (!editing) return;
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text && insertPlainText(text)) {
        reportDirty();
      }
    }, [editing, insertPlainText, reportDirty]);

    const handleBodyDrop = useCallback((e: React.DragEvent<HTMLPreElement>) => {
      // Never let a dropped file navigate the app away from an unsaved buffer.
      if (editing) {
        e.preventDefault();
      }
    }, [editing]);

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

    // Restore reading position from shared position (Gateway only — no localStorage fallback)
    useEffect(() => {
      if (!filePath || positionRestoredRef.current) return;

      const el = viewerRef.current;
      if (!el) return;

      const restore = async () => {
        // Try shared position (Gateway)
        if (gatewayService) {
          try {
            const sharedProgress = await getSharedPosition(gatewayService, filePath);
            if (sharedProgress !== null && sharedProgress >= 0 && sharedProgress <= 1) {
              requestAnimationFrame(() => {
                const maxScroll = el.scrollHeight - el.clientHeight;
                el.scrollTop = sharedProgress * maxScroll;
                positionRestoredRef.current = true;
              });
              return;
            }
          } catch {
            // Gateway unavailable — start from top
          }
        }

        // No saved position — start from top
        positionRestoredRef.current = true;
      };

      restore();
    }, [filePath, content, gatewayService]);

    // Cleanup on unmount or file change
    useEffect(() => {
      return () => {
        clearAutoScrollTimer();
        stopIndicatorInterval();
        autoScrollEnabledRef.current = false;
      };
    }, [filePath, clearAutoScrollTimer, stopIndicatorInterval]);

    return (
      <div className="file-viewer-container">
        <div
          ref={viewerRef}
          className="file-viewer-content"
          onClick={handleContentClick}
        >
          <pre
            ref={bodyRef}
            className="file-content-body"
            contentEditable={editing ? (supportsPlainTextOnly ? 'plaintext-only' : 'true') : undefined}
            suppressContentEditableWarning
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onInput={handleBodyInput}
            onKeyDown={handleBodyKeyDown}
            onPaste={handleBodyPaste}
            onDrop={handleBodyDrop}
          />
        </div>
        {indicatorText && (
          <div className="auto-scroll-indicator">{indicatorText}</div>
        )}
      </div>
    );
  },
);

FileViewer.displayName = 'FileViewer';
