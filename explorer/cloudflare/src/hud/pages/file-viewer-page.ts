import { TextContainerProperty } from "@evenrealities/even_hub_sdk";
import { BasePage, PageRenderResult } from "../page-manager";
import { FileSystemItem } from "../../domain/types";
import { FileSystemService } from "../../services/FileSystemService";
import { GatewayFileSystemService } from "../../services/GatewayFileSystemService";
import { loadAutoScrollSettings } from "../../services/AutoScrollSettings";
import { getG2SharedPosition, saveG2SharedPosition } from "../services/g2-shared-position-store";
import { addG2ToHistory } from "../services/g2-viewer-history-store";

export const G2_VIEWER_LINES = 9;
export const G2_VIEWER_MAX_WIDTH = 56;
const VIEWER_SCROLL_STEP = 8;

/**
 * Compute G2 scroll position from a shared progress value,
 * correcting for the viewport size difference between PWA and G2.
 *
 * PWA saves progress relative to its own viewport (typically 30-60+ lines).
 * G2 has only 9 visible lines. Without correction, the same progress
 * places G2 significantly ahead of where PWA was viewing.
 *
 * Correction is bounded (not proportional to file length) to avoid
 * over-correction on long files. Two components:
 *
 * 1. Viewport correction: G2 shows 9 lines, PWA shows ~30-60 lines.
 *    We subtract 2×G2_VIEWER_LINES (18 lines) from the denominator,
 *    which approximates the typical viewport difference.
 *
 * 2. Wrapping correction: G2 wraps at 56 chars, PWA at browser width.
 *    If G2 wraps more, wrappedLines.length > lines.length.
 *    We add a bounded correction based on the wrapping ratio,
 *    capped to prevent runaway correction on very long files.
 */
function computeG2RestorePosition(
  savedProgress: number,
  wrappedLinesCount: number,
  viewerLines: number,
  logicalLineCount: number,
): number {
  const totalLines = wrappedLinesCount;

  // Viewport correction: 2 screens worth of G2 lines.
  // This accounts for PWA's larger viewport without scaling with file length.
  const viewportCorrection = viewerLines * 2;

  // Wrapping correction: bounded, based on how much G2 wraps beyond 1.2×.
  // wrappedLinesCount / logicalLineCount = wrapping ratio.
  // If G2 wraps 50% more (ratio=1.5), correction = (1.5-1.2) × 30 = 9 lines.
  // Capped at viewerLines × 3 = 27 lines max.
  const wrappingRatio = logicalLineCount > 0
    ? wrappedLinesCount / logicalLineCount
    : 1;
  const wrappingCorrection = Math.min(
    viewerLines * 3,
    Math.max(0, Math.round((wrappingRatio - 1.2) * 30)),
  );

  const maxPosition = Math.max(
    0,
    totalLines - viewerLines - viewportCorrection - wrappingCorrection,
  );
  return Math.round(savedProgress * maxPosition);
}

interface WrappedLine {
  text: string;
  logicalLineIndex: number;
  isFirstOfLogical: boolean;
}

export class FileViewerPage extends BasePage {
  private file: FileSystemItem;
  private fileService: FileSystemService;
  private gatewayService: GatewayFileSystemService | null;
  private onBackToExplorer: () => Promise<boolean>;
  private onNavigateToHistory?: () => Promise<void>;
  private onStateChange?: (file: FileSystemItem, content: string) => void;
  private onAgentSessionList?: () => Promise<void>;
  private content: string = "";
  private lines: string[] = [];
  private wrappedLines: WrappedLine[] = [];
  private scrollPosition: number = 0;
  private scrollInverted: boolean = false;

  // Debounced shared position save (prevents excessive Gateway PATCH on every scroll)
  private positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPositionSave: { progress: number } | null = null;
  private static readonly POSITION_SAVE_DEBOUNCE_MS = 2000;

  // Auto Scroll state (elapsed-time based, DocsReader4EH pattern)
  private autoScrollEnabled: boolean = false;
  private autoScrollRemainingMs: number = 0;
  private autoScrollLastTickTime: number = 0;
  private autoScrollIndicator: string | null = null;
  private autoScrollIndicatorTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * PageManager checks this on navigateTo() and on each onAutoTickChanged
   * callback to decide whether to start/stop the shared ~400ms interval.
   */
  public get isAutoTickNeeded(): boolean { return this.autoScrollEnabled; }

  constructor(
    file: FileSystemItem,
    fileService: FileSystemService,
    onBackToExplorer: () => Promise<boolean>,
    onStateChange?: (file: FileSystemItem, content: string) => void,
    onAgentSessionList?: () => Promise<void>,
    gatewayService?: GatewayFileSystemService | null,
    onNavigateToHistory?: () => Promise<void>,
  ) {
    super();
    this.pageType = "FileViewerPage";
    this.file = file;
    this.fileService = fileService;
    this.gatewayService = gatewayService ?? null;
    this.onBackToExplorer = onBackToExplorer;
    this.onStateChange = onStateChange;
    this.onAgentSessionList = onAgentSessionList;
    this.onNavigateToHistory = onNavigateToHistory;
  }

  public getCurrentPath(): string {
    return this.file.path;
  }

  public getFile(): FileSystemItem {
    return this.file;
  }

  public getContent(): string {
    return this.content;
  }

  public async afterRender(): Promise<void> {
    if (this.lines.length === 0) {
      await this.loadFileContent();
    } else {
      this.notifyState();
    }
  }

  private async loadFileContent() {
    try {
      this.notifyStatus(`Reading ${this.file.name}...`);
      this.content = await this.fileService.readFile(this.file.path);
      this.lines = this.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      this.buildWrappedLines();

      // Try shared position (Gateway) — no localStorage fallback
      let savedProgress: number | null = null;
      if (this.gatewayService) {
        try {
          savedProgress = await getG2SharedPosition(this.gatewayService, this.file.path);
        } catch {
          // Gateway unavailable — start from top
        }
        // Add to viewing history (fire-and-forget, non-blocking)
        addG2ToHistory(this.gatewayService, this.file.path).catch(() => {});
      }

      if (savedProgress !== null && savedProgress >= 0 && savedProgress <= 1) {
        this.scrollPosition = computeG2RestorePosition(
          savedProgress,
          this.wrappedLines.length,
          G2_VIEWER_LINES,
          this.lines.length,
        );
      } else {
        this.scrollPosition = 0;
      }
      this.notifyStatus(`Loaded ${this.lines.length} lines`);
      if (this.renderPage) {
        await this.renderPage();
      }
      this.notifyState();
    } catch (e: any) {
      this.content = `Error reading file: ${e.message}`;
      this.lines = [this.content];
      this.scrollPosition = 0;
      this.buildWrappedLines();
      if (this.renderPage) {
        await this.renderPage();
      }
      this.notifyState();
    }
  }

  private notifyState() {
    if (this.onStateChange) {
      this.onStateChange(this.file, this.content);
    }
  }

  /**
   * Save reading position as scroll progress (0.0 ~ 1.0) to Gateway (debounced).
   * Gateway PATCH is coalesced: rapid scrolls only trigger one HTTP call
   * after 2s of inactivity. Immediate save on deactivate/top/bottom.
   */
  private saveCurrentPosition(): void {
    const maxPosition = Math.max(0, this.wrappedLines.length - G2_VIEWER_LINES);
    const progress = maxPosition > 0
      ? Math.min(1, Math.max(0, this.scrollPosition / maxPosition))
      : 0;

    // Gateway shared position — debounced
    if (this.gatewayService) {
      this.pendingPositionSave = { progress };
      if (this.positionSaveTimer === null) {
        this.positionSaveTimer = setTimeout(() => {
          this.positionSaveTimer = null;
          if (this.pendingPositionSave && this.gatewayService) {
            const { progress: p } = this.pendingPositionSave;
            this.pendingPositionSave = null;
            saveG2SharedPosition(this.gatewayService, this.file.path, p);
          }
        }, FileViewerPage.POSITION_SAVE_DEBOUNCE_MS);
      }
    }
  }

  /**
   * Flush any pending debounced position save immediately.
   * Called from onDeactivate and explicit save points (top/bottom/refresh).
   */
  private flushPositionSave(): void {
    if (this.positionSaveTimer !== null) {
      clearTimeout(this.positionSaveTimer);
      this.positionSaveTimer = null;
    }
    if (this.pendingPositionSave && this.gatewayService) {
      const { progress } = this.pendingPositionSave;
      this.pendingPositionSave = null;
      saveG2SharedPosition(this.gatewayService, this.file.path, progress);
    }
  }

  /**
   * Wrap a single text line to fit within maxWidth using getCharWidth() for
   * proportional character width calculation. Tries to break at word boundaries
   * (half-width alphanumeric/symbol sequences) to avoid splitting words.
   */
  private wrapLine(text: string, maxWidth: number): string[] {
    if (!text) return [""];
    const result: string[] = [];
    let currentLine = "";
    let currentWidth = 0;

    const isHalfWidthAlphaSym = (char: string) => {
      return char >= "\u0021" && char <= "\u007e";
    };

    for (const char of text) {
      const w = this.getCharWidth(char);
      if (currentWidth + w > maxWidth + 0.01) {
        let splitPos = currentLine.length;

        if (
          currentLine.length > 0 &&
          isHalfWidthAlphaSym(currentLine[currentLine.length - 1]) &&
          isHalfWidthAlphaSym(char)
        ) {
          for (let j = currentLine.length - 1; j >= 0; j--) {
            if (!isHalfWidthAlphaSym(currentLine[j])) {
              splitPos = j + 1;
              break;
            }
          }
        }

        if (splitPos > 0 && splitPos < currentLine.length) {
          const finishedLine = currentLine.substring(0, splitPos);
          const remaining = currentLine.substring(splitPos);
          result.push(finishedLine.replace(/ +$/, ""));
          currentLine = remaining + char;
          currentWidth = 0;
          for (const c of currentLine) {
            currentWidth += this.getCharWidth(c);
          }
        } else {
          result.push(currentLine.replace(/ +$/, ""));
          if (char === " ") {
            currentLine = "";
            currentWidth = 0;
          } else {
            currentLine = char;
            currentWidth = w;
          }
        }
      } else {
        currentLine += char;
        currentWidth += w;
      }
    }

    if (currentLine) {
      const finalLine = currentLine.replace(/ +$/, "");
      if (finalLine) {
        result.push(finalLine);
      }
    }
    return result.length > 0 ? result : [""];
  }

  /**
   * Convert logical lines to visual lines with wrapping.
   * Each WrappedLine knows which logical line it belongs to and whether it is
   * the first visual line of that logical line (for line number display).
   */
  private buildWrappedLines(): void {
    this.wrappedLines = [];
    for (let i = 0; i < this.lines.length; i++) {
      const visualParts = this.wrapLine(this.lines[i] || " ", G2_VIEWER_MAX_WIDTH);
      for (let j = 0; j < visualParts.length; j++) {
        this.wrappedLines.push({
          text: visualParts[j],
          logicalLineIndex: i,
          isFirstOfLogical: j === 0,
        });
      }
    }
  }

  /**
   * Get the range of logical line numbers visible on the current screen.
   * Returns 1-indexed values for display.
   */
  private getVisibleLogicalRange(): { min: number; max: number; total: number } {
    const end = Math.min(this.scrollPosition + G2_VIEWER_LINES, this.wrappedLines.length);
    const minLogical = this.wrappedLines.length > 0
      ? this.wrappedLines[this.scrollPosition].logicalLineIndex + 1
      : 1;
    const maxLogical = this.wrappedLines.length > 0
      ? this.wrappedLines[end - 1].logicalLineIndex + 1
      : 1;
    return { min: minLogical, max: maxLogical, total: this.lines.length };
  }

  public render(): PageRenderResult {
    const range = this.getVisibleLogicalRange();
    const scrollMode = this.scrollInverted ? 's' : 'k';
    let pageIndicator = `[${range.min}-${range.max}/${range.total}]${scrollMode}`;
    if (this.autoScrollIndicator) {
      pageIndicator += ` ${this.autoScrollIndicator}`;
    }
    const headerContent = this.buildHeaderLine(this.file.path, pageIndicator, G2_VIEWER_MAX_WIDTH, "[Viewer]");

    const end = Math.min(this.scrollPosition + G2_VIEWER_LINES, this.wrappedLines.length);
    const visibleLines = this.wrappedLines.slice(this.scrollPosition, end);
    const bodyText = visibleLines.map((wl) => wl.text).join("\n");

    const headerProp = new TextContainerProperty({
      containerID: 1,
      containerName: "viewer_header",
      content: headerContent,
      xPosition: 4,
      yPosition: 2,
      width: 572,
      height: 28,
      borderWidth: 0,
      isEventCapture: 0,
    });

    const bodyProp = new TextContainerProperty({
      containerID: 2,
      containerName: "viewer_body",
      content: bodyText,
      xPosition: 4,
      yPosition: 30,
      width: 572,
      height: 256,
      borderWidth: 1,
      borderColor: 0xFFFFFFFF,
      borderRadius: 8,
      paddingLength: 2,
      isEventCapture: 1,
    });

    return {
      containerTotalNum: 2,
      textObject: [headerProp, bodyProp],
      menuObject: {
        menuList: [
          { id: "history", title: "閲覧履歴画面へ" },
          { id: "agent", title: "エージェント画面へ" },
          { id: "refresh", title: "更新" },
          { id: "top", title: "先頭へ" },
          { id: "bottom", title: "末尾へ" },
          { id: "scrollInvert", title: "スクロール操作反転" },
        ],
      },
    };
  }

  // ── Auto Scroll (elapsed-time based, DocsReader4EH pattern) ──

  private clearAutoScrollIndicatorTimer(): void {
    if (this.autoScrollIndicatorTimer !== null) {
      clearTimeout(this.autoScrollIndicatorTimer);
      this.autoScrollIndicatorTimer = null;
    }
  }

  private isAtEnd(): boolean {
    return this.scrollPosition >= Math.max(0, this.wrappedLines.length - G2_VIEWER_LINES);
  }

  /**
   * Called by PageManager's shared ~400ms interval tick.
   * Uses Date.now() elapsed time to determine when to scroll —
   * no setTimeout chain, reliable on G2 Runtime.
   */
  public onAutoTick(): void {
    if (!this.autoScrollEnabled || !this.isActive) return;

    const now = Date.now();
    const elapsed = now - this.autoScrollLastTickTime;
    this.autoScrollLastTickTime = now;

    this.autoScrollRemainingMs -= elapsed;

    if (this.autoScrollRemainingMs <= 0) {
      // Time to scroll
      if (this.isAtEnd()) {
        this.stopAutoScroll();
        return;
      }

      const maxPosition = Math.max(0, this.wrappedLines.length - G2_VIEWER_LINES);
      this.scrollPosition = Math.min(this.scrollPosition + VIEWER_SCROLL_STEP, maxPosition);
      this.saveCurrentPosition();

      // Reset countdown for next scroll
      const settings = loadAutoScrollSettings();
      this.autoScrollRemainingMs = settings.interval * 1000;
      this.autoScrollLastTickTime = Date.now();
    }

    // Update countdown indicator
    const remainingSeconds = Math.ceil(Math.max(0, this.autoScrollRemainingMs) / 1000);
    this.autoScrollIndicator = String(remainingSeconds);
    if (this.renderPage) this.renderPage();
  }

  private stopAutoScroll(): void {
    this.autoScrollEnabled = false;
    this.autoScrollRemainingMs = 0;
    this.autoScrollLastTickTime = 0;
    this.autoScrollIndicator = null;
    this.onAutoTickChanged?.();
    if (this.renderPage) this.renderPage();
    console.log(`[G2 AutoScroll] STOPPED`);
  }

  private toggleAutoScroll(): void {
    if (this.autoScrollEnabled) {
      this.stopAutoScroll();
    } else {
      this.autoScrollEnabled = true;
      const settings = loadAutoScrollSettings();
      this.autoScrollRemainingMs = settings.interval * 1000;
      this.autoScrollLastTickTime = Date.now();
      this.autoScrollIndicator = String(settings.interval);
      this.onAutoTickChanged?.();
      if (this.renderPage) this.renderPage();
      console.log(`[G2 AutoScroll] STARTED interval=${settings.interval}s`);
    }
  }

  private resetAutoScrollTimer(): void {
    if (this.autoScrollEnabled) {
      const settings = loadAutoScrollSettings();
      this.autoScrollRemainingMs = settings.interval * 1000;
      this.autoScrollLastTickTime = Date.now();
    }
  }

  // ── Scroll Handlers ────────────────────────────────────────

  public async onScrollUp() {
    if (this.scrollInverted) {
      if (this.scrollPosition < this.wrappedLines.length - G2_VIEWER_LINES) {
        this.scrollPosition = Math.min(
          this.scrollPosition + VIEWER_SCROLL_STEP,
          Math.max(0, this.wrappedLines.length - G2_VIEWER_LINES),
        );
        this.saveCurrentPosition();
        this.resetAutoScrollTimer();
        if (this.renderPage) await this.renderPage();
      }
    } else {
      if (this.scrollPosition > 0) {
        this.scrollPosition = Math.max(this.scrollPosition - VIEWER_SCROLL_STEP, 0);
        this.saveCurrentPosition();
        this.resetAutoScrollTimer();
        if (this.renderPage) await this.renderPage();
      }
    }
  }

  /**
   * Scroll down by visual lines.
   */
  public async onScrollDown() {
    if (this.scrollInverted) {
      if (this.scrollPosition > 0) {
        this.scrollPosition = Math.max(this.scrollPosition - VIEWER_SCROLL_STEP, 0);
        this.saveCurrentPosition();
        this.resetAutoScrollTimer();
        if (this.renderPage) await this.renderPage();
      }
    } else {
      if (this.scrollPosition < this.wrappedLines.length - G2_VIEWER_LINES) {
        this.scrollPosition = Math.min(
          this.scrollPosition + VIEWER_SCROLL_STEP,
          Math.max(0, this.wrappedLines.length - G2_VIEWER_LINES),
        );
        this.saveCurrentPosition();
        this.resetAutoScrollTimer();
        if (this.renderPage) await this.renderPage();
      }
    }
  }

  public async onDoubleClick() {
    await this.onBackToExplorer();
  }

  public async onClick() {
    this.toggleAutoScroll();
  }

  public onDeactivate() {
    super.onDeactivate();
    this.stopAutoScroll();
    this.clearAutoScrollIndicatorTimer();
    this.autoScrollIndicator = null;
    // Flush any pending debounced position save before leaving
    this.flushPositionSave();
  }

  public async onLongPress() {
    // G2-2: Long Press is reserved for future Voice Input
  }

  public async onMenuItemClick(menuId: string) {
    switch (menuId) {
      case "history":
        if (this.onNavigateToHistory) {
          await this.onNavigateToHistory();
        }
        break;
      case "agent":
        if (this.onAgentSessionList) {
          await this.onAgentSessionList();
        }
        break;
      case "refresh":
        this.flushPositionSave();
        await this.loadFileContent();
        break;
      case "top":
        this.scrollPosition = 0;
        this.flushPositionSave();
        if (this.renderPage) await this.renderPage();
        break;
      case "bottom":
        this.scrollPosition = Math.max(0, this.wrappedLines.length - G2_VIEWER_LINES);
        this.flushPositionSave();
        if (this.renderPage) await this.renderPage();
        break;
      case "scrollInvert":
        this.scrollInverted = !this.scrollInverted;
        if (this.renderPage) await this.renderPage();
        break;
    }
  }
}
