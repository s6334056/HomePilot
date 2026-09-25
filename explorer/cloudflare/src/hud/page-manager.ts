import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  formatEvenHubPageContainerValidationError,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  StartUpPageCreateResult,
  RebuildPageContainer,
  TextContainerProperty,
  validateEvenHubPageContainer,
  waitForEvenAppBridge,
} from "@evenrealities/even_hub_sdk";

// ── [G2-VIEWER-DEBUG] temporary instrumentation (remove after device investigation) ──
// ConsoleJS requires objects to be stringified; never log raw Error objects.
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({ name: error.name, message: error.message, stack: error.stack });
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export interface PageRenderResult {
  containerTotalNum: number;
  textObject?: TextContainerProperty[];
  listObject?: unknown[];
  imageObject?: unknown[];
  menuObject?: {
    menuList: { id: string; title: string }[];
  };
}

export abstract class BasePage {
  public isActive: boolean = true;
  public pageType: string = "BasePage";
  protected bridge!: EvenAppBridge;
  protected navigate!: (page: BasePage) => Promise<boolean>;
  protected renderPage!: () => Promise<void>;
  protected notifyStatus!: (status: string) => void;

  /**
   * Optional callback set by PageManager during init().
   * Pages call this when their auto-tick requirement changes
   * (e.g. auto-scroll ON/OFF) so PageManager can start/stop
   * the shared ~400ms interval accordingly.
   */
  protected onAutoTickChanged?: () => void;

  /**
   * Whether this page currently requires the shared ~400ms interval tick.
   * Override in pages that need periodic updates (e.g. auto-scroll).
   * Default is false — pages that don't need ticks can safely ignore this.
   */
  public get isAutoTickNeeded(): boolean { return false; }

  public init(
    navigate: (page: BasePage) => Promise<boolean>,
    renderPage: () => Promise<void>,
    bridge: EvenAppBridge,
    notifyStatus: (status: string) => void,
    onAutoTickChanged?: () => void
  ) {
    this.navigate = navigate;
    this.renderPage = renderPage;
    this.bridge = bridge;
    this.notifyStatus = notifyStatus;
    this.onAutoTickChanged = onAutoTickChanged;
    this.isActive = true;
  }

  public onDeactivate() {
    this.isActive = false;
  }

  public abstract render(): PageRenderResult;
  public async afterRender(): Promise<void> {}

  // G2 Hardware Gesture & Input Event Handlers
  public onScrollUp(_event?: unknown) {}
  public onScrollDown(_event?: unknown) {}
  public onClick(_event?: unknown) {}
  public onDoubleClick(_event?: unknown) {}
  public onLongPress(_event?: unknown) {}
  public onLongPressRelease(_event?: unknown) {}
  public onMenuItemClick(_menuId: string, _event?: unknown) {}

  /**
   * Called by PageManager's shared ~400ms interval tick.
   * Override in pages that need periodic updates (e.g. auto-scroll).
   * Default implementation is empty — pages that don't need ticks can
   * safely ignore this.
   */
  public onAutoTick(): void {}

  /**
   * Character width calculation table based on G2 hardware font measurement.
   */
  public getCharWidth(char: string): number {
    // Zenkaku (Full-width Japanese)
    if (/[^\x00-\xff]/.test(char)) {
      return 2.0;
    }

    const CHAR_WIDTHS: Record<string, number> = {
      '1': 0.75,
      '0': 1.15, '2': 1.15, '3': 1.15, '4': 1.15, '5': 1.15,
      '6': 1.15, '7': 1.15, '8': 1.15, '9': 1.15,
      'i': 0.5, 'l': 0.5, 'j': 0.5, 'f': 0.8, 't': 0.8, 'r': 0.8,
      'c': 0.9, 's': 0.9, 'x': 0.9, 'z': 0.9, 'm': 1.5, 'w': 1.3,
      'a': 1.1, 'b': 1.1, 'd': 1.1, 'e': 1.1, 'g': 1.1, 'h': 1.1,
      'k': 1.1, 'n': 1.1, 'o': 1.1, 'p': 1.1, 'q': 1.1, 'u': 1.1,
      'v': 1.1, 'y': 1.1,
      'I': 0.7, 'M': 1.6, 'W': 1.8, 'A': 1.3, 'B': 1.3, 'C': 1.3,
      'D': 1.3, 'E': 1.3, 'F': 1.3, 'G': 1.3, 'H': 1.3, 'J': 1.1,
      'K': 1.3, 'L': 1.3, 'N': 1.3, 'O': 1.3, 'P': 1.3, 'Q': 1.3,
      'R': 1.3, 'S': 1.3, 'T': 1.3, 'U': 1.3, 'V': 1.3, 'X': 1.3,
      'Y': 1.3, 'Z': 1.3,
      ' ': 0.8, '!': 0.5, '"': 0.8, '#': 1.5, '$': 1.2, '%': 2.0,
      '&': 1.6, "'": 0.5, '(': 0.6, ')': 0.6, '*': 0.8, '+': 1.2,
      ',': 0.5, '-': 0.8, '.': 0.5, '/': 0.7, ':': 0.4, ';': 0.4,
      '<': 1.2, '=': 1.2, '>': 1.2, '?': 1.1, '@': 2.0, '[': 0.6,
      '\\': 0.8, ']': 0.6, '^': 1.0, '_': 1.1, '`': 0.6, '{': 0.6,
      '|': 0.5, '}': 0.6, '~': 1.2
    };

    return CHAR_WIDTHS[char] ?? 1.0;
  }

  public getStringWidth(str: string): number {
    let total = 0;
    for (const char of str) total += this.getCharWidth(char);
    return total;
  }

  /**
   * Build a header line by combining an optional tag, a prefix (path/filename),
   * and a suffix (page indicator). The suffix width is measured first, and the
   * remaining width is used for tag + prefix (with truncation of the prefix if needed).
   */
  protected buildHeaderLine(prefix: string, suffix: string, maxWidth: number, tag?: string): string {
    const tagStr = tag ? `${tag} ` : "";
    const tagWidth = this.getStringWidth(tagStr);
    if (!suffix) return this.truncateName(`${tagStr}${prefix}`, maxWidth);
    const suffixWidth = this.getStringWidth(suffix);
    const spaceWidth = this.getCharWidth(" ");
    const availableWidth = maxWidth - suffixWidth - spaceWidth - tagWidth;
    const truncatedPrefix = this.truncateName(prefix, availableWidth);
    return `${tagStr}${truncatedPrefix} ${suffix}`;
  }

  public truncateName(name: string, maxWidth: number): string {
    let totalWidth = 0;
    for (const char of name) totalWidth += this.getCharWidth(char);
    if (totalWidth <= maxWidth) return name;

    const SUFFIX_LEN = 8;
    const suffix = name.substring(Math.max(0, name.length - SUFFIX_LEN));
    let suffixWidth = 0;
    for (const char of suffix) suffixWidth += this.getCharWidth(char);

    const ellipsisWidth = this.getCharWidth('.') * 3;
    const availablePrefixWidth = maxWidth - ellipsisWidth - suffixWidth;

    let currentWidth = 0;
    let prefix = "";
    for (let i = 0; i < name.length - SUFFIX_LEN; i++) {
      const char = name[i];
      const w = this.getCharWidth(char);
      if (currentWidth + w > availablePrefixWidth) break;
      prefix += char;
      currentWidth += w;
    }

    return `${prefix}...${suffix}`;
  }
}

export class PageManager {
  private currentPage?: BasePage;
  private bridge?: EvenAppBridge;
  private isBridgeReady: boolean = false;
  private isStartupCreated: boolean = false;
  private onStatusUpdate?: (status: string) => void;
  private lastRenderedText: string = '';
  private menuItemIdMap: Map<number, string> = new Map();

  // Shared auto-scroll tick (~400ms interval, DocsReader4EH pattern)
  private autoScrollTickTimer: ReturnType<typeof setInterval> | null = null;

  // ── [G2-VIEWER-DEBUG] temporary instrumentation ──
  // Set while the shared ~400ms interval is running so per-tick renders are
  // not logged (keeps ConsoleJS output bounded to taps / navigations).
  private inAutoTick: boolean = false;
  private debugLastRenderKey: string | null = null;

  constructor(onStatusUpdate?: (status: string) => void) {
    this.onStatusUpdate = onStatusUpdate;
  }

  public async initialize(): Promise<boolean> {
    try {
      this.updateStatus("Connecting to Even Realities G2 Bridge...");
      const bridge = await waitForEvenAppBridge();
      if (bridge) {
        this.bridge = bridge;
        this.isBridgeReady = true;
        this.updateStatus("Even Realities G2 Connected.");
        this.setupEventListeners();
        return true;
      }
    } catch (e) {
      console.warn("[PageManager] Running in browser standalone / simulator mode:", e);
    }
    this.updateStatus("Browser Standalone Mode (G2 Emulation Active)");
    return false;
  }

  public getCurrentPage(): BasePage | undefined {
    return this.currentPage;
  }

  public async navigateTo(page: BasePage): Promise<boolean> {
    if (this.currentPage) {
      this.currentPage.onDeactivate();
    }

    this.currentPage = page;
    page.init(
      (nextPage) => this.navigateTo(nextPage),
      () => this.renderCurrentPage(),
      this.bridge!,
      (status) => this.updateStatus(status),
      () => this.refreshAutoTick()
    );

    // First render (may be empty if data not loaded yet)
    await this.renderCurrentPage();

    // Wait for G2 native side to settle after rebuildPageContainer.
    // DocsReader4EH uses the same pattern: rebuild → 200ms wait → afterRender.
    // Without this delay, the native side may not finish processing the container
    // rebuild before afterRender triggers data load + second render.
    await new Promise(resolve => setTimeout(resolve, 200));

    // afterRender loads data (e.g., directory listing), then re-render with data
    await page.afterRender();

    // Re-render after data is loaded
    await this.renderCurrentPage();

    // Start or stop shared tick based on current page's needs
    this.refreshAutoTick();

    return true;
  }

  public async renderCurrentPage(): Promise<void> {
    if (!this.currentPage) return;

    const renderResult = this.currentPage.render();
    const textContainers = renderResult.textObject || [];
    const plainText = textContainers
      .map((t) => (t as unknown as { content?: string }).content ?? '')
      .join('\n');
    this.lastRenderedText = plainText;

    // ── [G2-VIEWER-DEBUG] structure-change gated trace ──
    // Logged only when NOT inside the shared ~400ms auto-scroll tick and only
    // when the container structure changed, so ConsoleJS output stays bounded
    // (no per-tick / per-scroll spam). Content is excluded from the change key.
    const debugContainers = textContainers.map((t) => {
      const c = t as unknown as {
        containerID?: unknown;
        containerName?: unknown;
        xPosition?: unknown;
        yPosition?: unknown;
        width?: unknown;
        height?: unknown;
        isEventCapture?: unknown;
        content?: unknown;
      };
      return {
        containerID: c.containerID ?? null,
        containerName: c.containerName ?? null,
        xPosition: c.xPosition ?? null,
        yPosition: c.yPosition ?? null,
        width: c.width ?? null,
        height: c.height ?? null,
        isEventCapture: c.isEventCapture ?? null,
        content: typeof c.content === "string" ? c.content.slice(0, 80) : c.content ?? null,
      };
    });
    const debugKey = JSON.stringify({
      pageType: this.currentPage.pageType,
      containerTotalNum: renderResult.containerTotalNum,
      menuCount: renderResult.menuObject?.menuList?.length ?? 0,
      containers: debugContainers.map(({ containerID, containerName, xPosition, yPosition, width, height, isEventCapture }) => ({
        containerID, containerName, xPosition, yPosition, width, height, isEventCapture,
      })),
    });
    const trace = !this.inAutoTick && debugKey !== this.debugLastRenderKey;
    if (trace) {
      this.debugLastRenderKey = debugKey;
      console.log(
        "[G2-VIEWER-DEBUG] renderPage START:",
        JSON.stringify({
          pageType: this.currentPage.pageType,
          containerTotalNum: renderResult.containerTotalNum,
          menuCount: renderResult.menuObject?.menuList?.length ?? 0,
          bridgeReady: this.isBridgeReady,
          isStartupCreated: this.isStartupCreated,
          containers: debugContainers,
        }),
      );
    }

    if (!this.isBridgeReady || !this.bridge) {
      if (trace) {
        console.log(
          "[G2-VIEWER-DEBUG] renderPage SKIP: bridge not ready (browser/simulator path - rebuildPageContainer is never called)",
        );
      }
      return;
    }

    // Build MenuContainerProperty from page's menuList
    let menuContainer: MenuContainerProperty | undefined;
    if (renderResult.menuObject?.menuList?.length) {
      this.menuItemIdMap.clear();
      const menuItems = renderResult.menuObject.menuList.map((item, index) => {
        const numericId = index + 1;
        this.menuItemIdMap.set(numericId, item.id);
        return new MenuItemProperty({ itemID: numericId, itemName: item.title });
      });
      menuContainer = new MenuContainerProperty({ menuItems });
    } else {
      this.menuItemIdMap.clear();
    }

    try {
      const containerTotalNum = renderResult.containerTotalNum || 1;

      if (trace) {
        // SDK-side pre-flight: rebuildPageContainer() runs this same
        // validation internally and returns false (without throwing) when it
        // fails, so mirror the result here before the native call.
        const validation = validateEvenHubPageContainer({
          containerTotalNum,
          textObject: textContainers as any,
          listObject: renderResult.listObject as any,
          imageObject: renderResult.imageObject as any,
          menuObject: menuContainer,
        } as any);
        console.log(
          "[G2-VIEWER-DEBUG] SDK validation:",
          validation.valid ? "VALID" : JSON.stringify({ code: validation.code, message: validation.message }),
        );
        if (!validation.valid) {
          console.log(
            "[G2-VIEWER-DEBUG] SDK validation message:",
            formatEvenHubPageContainerValidationError(validation),
          );
        }
      }

      if (!this.isStartupCreated) {
        const startupConfig = new CreateStartUpPageContainer({
          containerTotalNum,
          textObject: textContainers as any,
          listObject: renderResult.listObject as any,
          imageObject: renderResult.imageObject as any,
          menuObject: menuContainer,
        });
        if (trace) console.log("[G2-VIEWER-DEBUG] createStartUpPageContainer START");
        try {
          const result: StartUpPageCreateResult = await this.bridge.createStartUpPageContainer(startupConfig);
          if (trace) {
            console.log(`[G2-VIEWER-DEBUG] createStartUpPageContainer RESULT: type=${typeof result} value=${String(result)}`);
          }
          if (result === StartUpPageCreateResult.success) {
            this.isStartupCreated = true;
          }
        } catch (error) {
          if (trace) {
            console.log("[G2-VIEWER-DEBUG] createStartUpPageContainer ERROR:", describeError(error));
          }
          throw error;
        }
      } else {
        const rebuildConfig = new RebuildPageContainer({
          containerTotalNum,
          textObject: textContainers as any,
          listObject: renderResult.listObject as any,
          imageObject: renderResult.imageObject as any,
          menuObject: menuContainer,
        });
        if (trace) {
          console.log(
            "[G2-VIEWER-DEBUG] rebuildPageContainer START:",
            JSON.stringify({ containerTotalNum, textCount: textContainers.length }),
          );
        }
        try {
          const result = await this.bridge.rebuildPageContainer(rebuildConfig);
          if (trace) {
            console.log(`[G2-VIEWER-DEBUG] rebuildPageContainer RESULT: type=${typeof result} value=${String(result)}`);
          }
        } catch (error) {
          if (trace) {
            console.log("[G2-VIEWER-DEBUG] rebuildPageContainer ERROR:", describeError(error));
          }
          throw error;
        }
      }
    } catch (err) {
      if (trace) {
        console.log("[G2-VIEWER-DEBUG] render ERROR:", describeError(err));
      }
      console.error("[PageManager] Failed to render on G2 glasses:", err);
    }
    if (trace) console.log("[G2-VIEWER-DEBUG] renderPage END");
  }

  public getLastRenderedText(): string {
    return this.lastRenderedText;
  }

  private updateStatus(status: string) {
    if (this.onStatusUpdate) {
      this.onStatusUpdate(status);
    }
  }

  private setupEventListeners() {
    if (!this.bridge) return;

    this.bridge.onEvenHubEvent((event) => {
      // ── [G2-VIEWER-DEBUG] log every event while the File Viewer is active ──
      // Logged before the isActive guard so a dropped/inactive dispatch is visible.
      const currentPageType = this.currentPage?.pageType ?? null;
      if (currentPageType === "FileViewerPage") {
        console.log(
          "[G2-VIEWER-DEBUG] EVENT:",
          JSON.stringify({
            pageType: currentPageType,
            isActive: this.currentPage?.isActive ?? false,
            hasMenuClick: !!event.menuItemClickEvent,
            hasTextEvent: !!event.textEvent,
            hasListEvent: !!event.listEvent,
            hasSysEvent: !!event.sysEvent,
            textEventType: event.textEvent?.eventType ?? null,
            listEventType: event.listEvent?.eventType ?? null,
            sysEventType: event.sysEvent?.eventType ?? null,
            textContainerID: event.textEvent?.containerID ?? null,
            textContainerName: event.textEvent?.containerName ?? null,
            listContainerID: event.listEvent?.containerID ?? null,
            eventSource: event.sysEvent?.eventSource ?? null,
          }),
        );
      }

      if (!this.currentPage?.isActive) return;

      // Menu item click (context menu on G2)
      if (event.menuItemClickEvent) {
        const numericId = event.menuItemClickEvent.itemID;
        const stringId = numericId != null ? this.menuItemIdMap.get(numericId) ?? String(numericId) : undefined;
        if (stringId) {
          this.currentPage.onMenuItemClick(stringId, event);
        }
        return;
      }

      // Extract eventType from listEvent, textEvent, or sysEvent
      const eventType = event.listEvent?.eventType ?? event.textEvent?.eventType ?? event.sysEvent?.eventType;

      switch (eventType) {
        case OsEventTypeList.SCROLL_TOP_EVENT:
          this.currentPage.onScrollUp(event);
          break;
        case OsEventTypeList.SCROLL_BOTTOM_EVENT:
          this.currentPage.onScrollDown(event);
          break;
        case OsEventTypeList.CLICK_EVENT:
        case undefined:
          this.currentPage.onClick(event);
          break;
        case OsEventTypeList.DOUBLE_CLICK_EVENT:
          this.currentPage.onDoubleClick(event);
          break;
        case OsEventTypeList.LONG_PRESS_EVENT:
          this.currentPage.onLongPress(event);
          break;
        case OsEventTypeList.LONG_PRESS_RELEASE_EVENT:
          this.currentPage.onLongPressRelease(event);
          break;
      }
    });
  }

  // Simulated event dispatchers for browser UI & Simulator
  public async dispatchSimulatedEvent(action: 'scroll_up' | 'scroll_down' | 'click' | 'double_click' | 'long_press' | 'menu_click', menuId?: string): Promise<void> {
    if (!this.currentPage) return;
    switch (action) {
      case 'scroll_up':
        await this.currentPage.onScrollUp();
        break;
      case 'scroll_down':
        await this.currentPage.onScrollDown();
        break;
      case 'click':
        await this.currentPage.onClick();
        break;
      case 'double_click':
        await this.currentPage.onDoubleClick();
        break;
      case 'long_press':
        await this.currentPage.onLongPress();
        break;
      case 'menu_click':
        if (menuId) await this.currentPage.onMenuItemClick(menuId);
        break;
    }
  }

  // ── Auto-Scroll Shared Tick ────────────────────────────────

  /**
   * Start or stop the shared ~400ms interval tick based on current page's
   * isAutoTickNeeded. Safe to call on every navigateTo() and on every
   * onAutoTickChanged callback — internal guard prevents double-start,
   * and stop is idempotent.
   *
   * DocsReader4EH pattern: refreshAutoUpdate() checks a condition and
   * delegates to startAutoUpdate()/stopAutoUpdate().
   */
  private refreshAutoTick(): void {
    if (this.currentPage?.isAutoTickNeeded && this.currentPage.isActive) {
      this.startAutoScrollTick();
    } else {
      this.stopAutoScrollTick();
    }
  }

  /**
   * Start the shared ~400ms interval tick.
   * Double-start is prevented by checking autoScrollTickTimer.
   */
  private startAutoScrollTick(): void {
    if (this.autoScrollTickTimer) return;

    console.log("[PageManager] Starting shared auto-scroll tick");
    this.autoScrollTickTimer = setInterval(() => {
      if (!this.currentPage?.isActive) return;
      // ── [G2-VIEWER-DEBUG] suppresses render traces while ticking ──
      this.inAutoTick = true;
      try {
        this.currentPage.onAutoTick();
      } finally {
        this.inAutoTick = false;
      }
    }, 400);
  }

  /**
   * Stop the shared auto-scroll tick. Safe to call multiple times.
   */
  private stopAutoScrollTick(): void {
    if (this.autoScrollTickTimer) {
      clearInterval(this.autoScrollTickTimer);
      this.autoScrollTickTimer = null;
      console.log("[PageManager] Stopped shared auto-scroll tick");
    }
  }

  /**
   * Destroy the PageManager and release all resources.
   * Safe to call multiple times (idempotent).
   */
  public destroy(): void {
    // Stop shared auto-scroll tick
    this.stopAutoScrollTick();

    // Deactivate current page
    if (this.currentPage) {
      this.currentPage.onDeactivate();
      this.currentPage = undefined;
    }

    // Clear menu mapping
    this.menuItemIdMap.clear();

    // Reset initialization state
    this.isStartupCreated = false;
    this.lastRenderedText = '';
  }

  /**
   * Shut down the G2 PageContainer on the glasses.
   * Used when closing the G2 Runtime from PWA side.
   */
  public async shutDownPageContainer(): Promise<void> {
    if (this.bridge && this.isBridgeReady) {
      try {
        await this.bridge.shutDownPageContainer(0);
      } catch (err) {
        console.warn("[PageManager] shutDownPageContainer failed:", err);
      }
    }
  }

  /**
   * Whether the PageManager has an active bridge connection.
   */
  public get isReady(): boolean {
    return this.isBridgeReady;
  }
}
