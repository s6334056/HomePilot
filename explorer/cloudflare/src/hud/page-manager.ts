import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  MenuContainerProperty,
  MenuItemProperty,
  OsEventTypeList,
  StartUpPageCreateResult,
  RebuildPageContainer,
  TextContainerProperty,
  waitForEvenAppBridge,
} from "@evenrealities/even_hub_sdk";

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

  public init(
    navigate: (page: BasePage) => Promise<boolean>,
    renderPage: () => Promise<void>,
    bridge: EvenAppBridge,
    notifyStatus: (status: string) => void
  ) {
    this.navigate = navigate;
    this.renderPage = renderPage;
    this.bridge = bridge;
    this.notifyStatus = notifyStatus;
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
  public onMenuItemClick(_menuId: string, _event?: unknown) {}

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
   * Build a header line by combining a prefix (path/filename) and a suffix
   * (page indicator). The suffix width is measured first, and the remaining
   * width is used for the prefix (with truncation if needed).
   */
  protected buildHeaderLine(prefix: string, suffix: string, maxWidth: number): string {
    if (!suffix) return this.truncateName(prefix, maxWidth);
    const suffixWidth = this.getStringWidth(suffix);
    const spaceWidth = this.getCharWidth(" ");
    const availableWidth = maxWidth - suffixWidth - spaceWidth;
    const truncatedPrefix = this.truncateName(prefix, availableWidth);
    return `${truncatedPrefix} ${suffix}`;
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
  /** Diagnostic: true while createStartUpPageContainer or rebuildPageContainer is executing */
  private isRendering: boolean = false;
  /** Diagnostic: when true, next renderCurrentPage() uses createStartUpPageContainer instead of rebuild */
  private diagForceCreateStartUp: boolean = false;

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

  /**
   * Diagnostic: Force next renderCurrentPage() to use createStartUpPageContainer
   * instead of rebuildPageContainer. Used to test the Loading → real page pattern.
   */
  public resetStartUpForDiag(): void {
    console.log('[PageManager] resetStartUpForDiag: forcing createStartUpPageContainer on next render');
    this.isStartupCreated = false;
    this.diagForceCreateStartUp = true;
  }

  public async navigateTo(page: BasePage): Promise<boolean> {
    console.log(`[PageManager] navigateTo START → ${page.pageType}`);

    if (this.currentPage) {
      console.log(`[PageManager] deactivate START ← ${this.currentPage.pageType}`);
      this.currentPage.onDeactivate();
      console.log(`[PageManager] deactivate END`);
    } else {
      console.log('[PageManager] no currentPage to deactivate');
    }

    this.currentPage = page;
    console.log('[PageManager] page.init START');
    page.init(
      (nextPage) => this.navigateTo(nextPage),
      () => this.renderCurrentPage(),
      this.bridge!,
      (status) => this.updateStatus(status)
    );
    console.log('[PageManager] page.init END');

    // First render (may be empty if data not loaded yet)
    console.log('[PageManager] renderCurrentPage #1 START');
    await this.renderCurrentPage();
    console.log('[PageManager] renderCurrentPage #1 END');

    // Wait for G2 native side to settle after rebuildPageContainer.
    // DocsReader4EH uses the same pattern: rebuild → 200ms wait → afterRender.
    // Without this delay, the native side may not finish processing the container
    // rebuild before afterRender triggers data load + second render.
    console.log('[PageManager] waiting 200ms for native side to settle');
    await new Promise(resolve => setTimeout(resolve, 200));

    // afterRender loads data (e.g., directory listing), then re-render with data
    console.log('[PageManager] page.afterRender START');
    await page.afterRender();
    console.log('[PageManager] page.afterRender END');

    // Re-render after data is loaded
    console.log('[PageManager] renderCurrentPage #2 START');
    await this.renderCurrentPage();
    console.log('[PageManager] renderCurrentPage #2 END');

    console.log('[PageManager] navigateTo END');
    return true;
  }

  public async renderCurrentPage(): Promise<void> {
    console.log(`[PageManager] renderCurrentPage START (currentPage=${this.currentPage?.pageType ?? 'none'})`);
    if (!this.currentPage) {
      console.log('[PageManager] renderCurrentPage ABORT: no currentPage');
      return;
    }

    const renderResult = this.currentPage.render();
    const textContainers = renderResult.textObject || [];
    // TextContainerProperty stores the display text in `content` (not `text`)
    const plainText = textContainers
      .map((t) => (t as unknown as { content?: string }).content ?? '')
      .join('\n');
    this.lastRenderedText = plainText;
    console.log(`[PageManager] render() done, textContainers=${textContainers.length}`);

    if (!this.isBridgeReady || !this.bridge) {
      console.log('[PageManager] renderCurrentPage END (no bridge, skipped G2 render)');
      return;
    }

    // Build MenuContainerProperty from page's menuList
    let menuContainer: MenuContainerProperty | undefined;
    console.log('[PageManager] menu generation START');
    if (renderResult.menuObject?.menuList?.length) {
      this.menuItemIdMap.clear();
      const menuItems = renderResult.menuObject.menuList.map((item, index) => {
        const numericId = index + 1;
        this.menuItemIdMap.set(numericId, item.id);
        return new MenuItemProperty({ itemID: numericId, itemName: item.title });
      });
      menuContainer = new MenuContainerProperty({ menuItems });
      console.log(`[PageManager] menu generation END: ${menuItems.length} items`);
    } else {
      this.menuItemIdMap.clear();
      console.log('[PageManager] menu generation END: no menu');
    }

    try {
      const currentPageType = this.currentPage.pageType;

      // ── PageContainer structure summary ──
      const containerTotalNum = renderResult.containerTotalNum || 1;
      const textCount = textContainers.length;
      const listCount = (renderResult.listObject as any[])?.length ?? 0;
      const imageCount = (renderResult.imageObject as any[])?.length ?? 0;
      const menuCount = menuContainer ? 1 : 0;
      console.log(`[PageManager] PageContainer detail currentPage=${currentPageType}`);
      console.log(`[PageManager]   containerTotalNum=${containerTotalNum} textObject=${textCount} listObject=${listCount} imageObject=${imageCount} menuObject=${menuCount}`);

      // ── TextObject detailed properties ──
      for (let i = 0; i < textContainers.length; i++) {
        const t = textContainers[i] as any;
        const id = t?.containerID ?? 'undef';
        const name = t?.containerName ?? 'undef';
        const x = t?.xPosition ?? 'undef';
        const y = t?.yPosition ?? 'undef';
        const w = t?.width ?? 'undef';
        const h = t?.height ?? 'undef';
        const bw = t?.borderWidth ?? 'undef';
        const bc = t?.borderColor ?? 'undef';
        const br = t?.borderRadius ?? 'undef';
        const pl = t?.paddingLength ?? 'undef';
        const ec = t?.isEventCapture ?? 'undef';
        const z = t?.zOrderIndex ?? 'undef';
        const content = t?.content ?? 'undef';
        const contentLen = typeof content === 'string' ? content.length : 'N/A';
        const contentPreview = typeof content === 'string' ? JSON.stringify(content.substring(0, 40)) : 'N/A';
        // Flag suspicious values
        const flags: string[] = [];
        if (typeof x === 'number' && (isNaN(x) || x < 0)) flags.push(`x=${x}`);
        if (typeof y === 'number' && (isNaN(y) || y < 0)) flags.push(`y=${y}`);
        if (typeof w === 'number' && (isNaN(w) || w <= 0)) flags.push(`w=${w}`);
        if (typeof h === 'number' && (isNaN(h) || h <= 0)) flags.push(`h=${h}`);
        if (typeof bw === 'number' && (isNaN(bw) || bw < 0)) flags.push(`bw=${bw}`);
        if (typeof ec === 'number' && ec !== 0 && ec !== 1) flags.push(`ec=${ec}`);
        if (typeof pl === 'number' && (isNaN(pl) || pl < 0)) flags.push(`pl=${pl}`);
        if (content === '' || content === null || content === undefined) flags.push('content=empty');
        const flagStr = flags.length > 0 ? ` FLAGS=[${flags.join(',')}]` : '';
        console.log(`[PageManager]   text[${i}] id=${id} name=${name} pos=(${x},${y}) size=(${w}x${h}) borderWidth=${bw} borderColor=${bc} borderRadius=${br} padding=${pl} isEventCapture=${ec} zOrder=${z}${flagStr}`);
        console.log(`[PageManager]     content len=${contentLen} preview=${contentPreview}`);
      }

      // ── MenuObject detailed properties ──
      if (menuContainer) {
        const menuItems = (menuContainer as any).menuItems ?? (menuContainer as any).items ?? [];
        console.log(`[PageManager]   menu: itemCount=${menuItems.length}`);
        for (let i = 0; i < menuItems.length; i++) {
          const item = menuItems[i] as any;
          const itemId = item?.itemID ?? 'undef';
          const itemName = item?.itemName ?? item?.title ?? 'undef';
          const flags: string[] = [];
          if (typeof itemId === 'number' && (isNaN(itemId) || itemId <= 0)) flags.push(`itemID=${itemId}`);
          if (!itemName || itemName === '') flags.push('itemName=empty');
          const flagStr = flags.length > 0 ? ` FLAGS=[${flags.join(',')}]` : '';
          console.log(`[PageManager]     menu[${i}] itemID=${itemId} itemName=${itemName}${flagStr}`);
        }
        // Log any other properties on the menu container itself
        const menuKeys = Object.keys(menuContainer as any);
        const extraMenuProps = menuKeys.filter(k => k !== 'menuItems' && k !== 'items');
        if (extraMenuProps.length > 0) {
          console.log(`[PageManager]   menu extra props: [${extraMenuProps.join(', ')}]`);
        }
      } else {
        console.log('[PageManager]   menu: none');
      }

      // Diagnostic: use createStartUpPageContainer if flagged (for Loading→real page test)
      const useCreate = !this.isStartupCreated || this.diagForceCreateStartUp;
      if (this.diagForceCreateStartUp) {
        this.diagForceCreateStartUp = false;
        console.log('[PageManager] diagForceCreateStartUp: using createStartUpPageContainer (flag cleared)');
      }

      if (useCreate) {
        console.log(`[PageManager] createStartUpPageContainer START currentPage=${currentPageType}`);
        this.isRendering = true;
        const t0 = performance.now();
        const startupConfig = new CreateStartUpPageContainer({
          containerTotalNum,
          textObject: textContainers as any,
          listObject: renderResult.listObject as any,
          imageObject: renderResult.imageObject as any,
          menuObject: menuContainer,
        });
        const result: StartUpPageCreateResult = await this.bridge.createStartUpPageContainer(startupConfig);
        const elapsed = Math.round(performance.now() - t0);
        this.isRendering = false;
        if (result === StartUpPageCreateResult.success) {
          this.isStartupCreated = true;
        }
        console.log(`[PageManager] createStartUpPageContainer END currentPage=${currentPageType} result=${result} elapsed=${elapsed}ms`);
      } else {
        console.log(`[PageManager] rebuildPageContainer START currentPage=${currentPageType}`);
        this.isRendering = true;
        const t0 = performance.now();
        const rebuildConfig = new RebuildPageContainer({
          containerTotalNum,
          textObject: textContainers as any,
          listObject: renderResult.listObject as any,
          imageObject: renderResult.imageObject as any,
          menuObject: menuContainer,
        });
        const rebuildResult = await this.bridge.rebuildPageContainer(rebuildConfig);
        const elapsed = Math.round(performance.now() - t0);
        this.isRendering = false;
        console.log(`[PageManager] rebuildPageContainer END currentPage=${currentPageType} result=${rebuildResult} elapsed=${elapsed}ms`);
      }
    } catch (err) {
      this.isRendering = false;
      console.error("[PageManager] Failed to render on G2 glasses:", err);
    }
    console.log('[PageManager] renderCurrentPage END');
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
      const currentPageType = this.currentPage?.pageType ?? 'none';
      const currentPageActive = this.currentPage?.isActive ?? false;
      console.log(`[PageManager] onEvenHubEvent START currentPage=${currentPageType} active=${currentPageActive} rendering=${this.isRendering}`);

      // Safely extract event type from the event object
      try {
        const keys = Object.keys(event);
        console.log(`[PageManager] event keys: [${keys.join(', ')}]`);
        if (event.menuItemClickEvent) {
          console.log(`[PageManager] menuItemClickEvent itemID=${event.menuItemClickEvent.itemID}`);
        }
        if (event.listEvent) {
          console.log(`[PageManager] listEvent: eventType=${event.listEvent.eventType}`);
        }
        if (event.textEvent) {
          console.log(`[PageManager] textEvent: eventType=${event.textEvent.eventType}`);
        }
        if (event.sysEvent) {
          console.log(`[PageManager] sysEvent: eventType=${event.sysEvent.eventType}`);
        }
      } catch {
        console.log('[PageManager] (event inspection failed)');
      }

      if (!currentPageActive) {
        console.log('[PageManager] onEvenHubEvent SKIP: currentPage not active');
        return;
      }

      if (!this.currentPage) {
        console.log('[PageManager] onEvenHubEvent SKIP: no currentPage');
        return;
      }

      // Menu item click (context menu on G2)
      if (event.menuItemClickEvent) {
        const numericId = event.menuItemClickEvent.itemID;
        const stringId = numericId != null ? this.menuItemIdMap.get(numericId) ?? String(numericId) : undefined;
        console.log(`[PageManager] dispatch → onMenuItemClick(menuId=${stringId})`);
        if (stringId) {
          this.currentPage.onMenuItemClick(stringId, event);
        }
        console.log(`[PageManager] onEvenHubEvent END currentPage=${currentPageType} rendering=${this.isRendering}`);
        return;
      }

      // Extract eventType from listEvent, textEvent, or sysEvent
      const eventType = event.listEvent?.eventType ?? event.textEvent?.eventType ?? event.sysEvent?.eventType;

      switch (eventType) {
        case OsEventTypeList.SCROLL_TOP_EVENT:
          console.log(`[PageManager] dispatch → onScrollUp (eventType=${eventType})`);
          this.currentPage.onScrollUp(event);
          break;
        case OsEventTypeList.SCROLL_BOTTOM_EVENT:
          console.log(`[PageManager] dispatch → onScrollDown (eventType=${eventType})`);
          this.currentPage.onScrollDown(event);
          break;
        case OsEventTypeList.CLICK_EVENT:
        case undefined:
          console.log(`[PageManager] dispatch → onClick (eventType=${eventType})`);
          this.currentPage.onClick(event);
          break;
        case OsEventTypeList.DOUBLE_CLICK_EVENT:
          console.log(`[PageManager] dispatch → onDoubleClick (eventType=${eventType})`);
          this.currentPage.onDoubleClick(event);
          break;
        case OsEventTypeList.LONG_PRESS_EVENT:
          console.log(`[PageManager] dispatch → onLongPress (eventType=${eventType})`);
          this.currentPage.onLongPress(event);
          break;
        default:
          console.log(`[PageManager] dispatch → UNKNOWN eventType=${eventType}`);
          break;
      }
      console.log(`[PageManager] onEvenHubEvent END currentPage=${currentPageType} rendering=${this.isRendering}`);
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

  /**
   * Destroy the PageManager and release all resources.
   * Safe to call multiple times (idempotent).
   */
  public destroy(): void {
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
