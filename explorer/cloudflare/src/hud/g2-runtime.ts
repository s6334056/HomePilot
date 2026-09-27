import {
  type EvenAppBridge,
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk';
import { PageManager, BasePage } from './page-manager';
import { ExplorerPage } from './pages/explorer-page';
import { HistoryPage } from './pages/history-page';
import { HomePage, G2ConnectionMode } from './pages/home-page';
import { AgentSessionListPage } from './g2-agent/pages/agent-session-list-page';
import { AgentModelSelectPage } from './g2-agent/pages/agent-model-select-page';
import { AgentChatPage } from './g2-agent/pages/agent-chat-page';
import { GatewayFileSystemService } from '../services/GatewayFileSystemService';
import { LocalFileSystemService } from '../services/LocalFileSystemService';
import { FileSystemService } from '../services/FileSystemService';
import { createFileSystemService } from '../services/FileSystemSelection';
import { HistoryAccess } from '../services/HistoryAccess';
import { createGatewayHistoryAccess } from '../services/ViewerHistoryStore';
import { createLocalHistoryAccess } from '../services/LocalHistoryStore';
import { OpenCodeClient } from '../services/OpenCodeClient';
import { G2AgentController } from './g2-agent/g2-agent-controller';
import { AgentStateStore } from './g2-agent/agent-state-store';
import { resolveConfig } from '../services/ConnectionConfig';
import {
  type G2StartupScreen,
  loadG2StartupScreen,
  resolveG2StartupPage,
} from '../services/G2StartupScreenSettings';

export type G2RuntimeState = 'inactive' | 'starting' | 'active' | 'stopping';

export type G2RuntimeStateListener = (state: G2RuntimeState) => void;

export type G2InitialPage = 'explorer' | 'agent' | 'history' | 'home';

/**
 * Decide which screen the G2 starts on.
 *
 * - Gateway 接続あり → startupScreen 設定に従う（既存動作そのまま）
 * - Gateway 接続なし → startupScreen に関係なく Home へフォールバック
 *
 * Gateway 未接続時に explorer / history / agent を起動すると、
 * FileSystem が無いため表示も操作もできず（Double Tap も効かない）、
 * 画面から抜けられない状態になるため。
 *
 * 設定値 (homepilot.g2StartupScreen) は一切書き換えない。
 * 次回 Gateway が使える状態で起動すれば、従来どおり設定に従う。
 */
export function resolveG2InitialPage(
  configured: G2StartupScreen,
  capabilities: { hasGateway: boolean; hasAgent: boolean },
): G2InitialPage {
  if (!capabilities.hasGateway) return 'home';
  return resolveG2StartupPage(configured, capabilities);
}

/**
 * G2RuntimeManager manages the lifecycle of the G2 Runtime:
 *   - Bridge detection and launch source monitoring
 *   - Lazy PageManager creation and initialization
 *   - Gateway → OpenCode → G2AgentController initialization sequence
 *   - Idempotent shutdown on G2 close events or PWA-side close
 *
 * The G2 Runtime is only started when:
 *   - User taps "グラス起動" in Settings
 *   - App is launched from G2 menu (glassesMenu)
 *
 * When not active, no G2 resources (PageManager, Gateway, OpenCodeClient,
 * G2AgentController) are created or running.
 */
export class G2RuntimeManager {
  private state: G2RuntimeState = 'inactive';
  private listeners: Set<G2RuntimeStateListener> = new Set();
  private bridge: EvenAppBridge | null = null;
  private isBridgeProbed: boolean = false;
  private launchSourceUnsubscribe: (() => void) | null = null;
  private eventUnsubscribe: (() => void) | null = null;

  // G2 Runtime resources (only exist while active)
  private pageManager: PageManager | null = null;
  private gatewayService: GatewayFileSystemService | null = null;
  private localFileService: LocalFileSystemService | null = null;
  private openCodeClient: OpenCodeClient | null = null;
  private g2AgentController: G2AgentController | null = null;
  private agentStateStore: AgentStateStore | null = null;

  // Which file system the Runtime is currently driving.
  // 'gateway' is the legacy default (before Home was introduced).
  // It only changes when the user picks a target on Home — never persisted.
  private connectionMode: G2ConnectionMode = 'gateway';

  // Agent Navigation state
  private agentReturnPage: BasePage | null = null;
  private sessionListPage: AgentSessionListPage | null = null;
  private modelSelectPage: AgentModelSelectPage | null = null;
  private historyPage: HistoryPage | null = null;
  private historyReturnPage: BasePage | null = null;
  private homePage: HomePage | null = null;
  private agentCurrentPath: string = '';

  // Last Agent page state (for Explorer → Agent return)
  private lastAgentPage: 'sessionList' | 'chat' = 'sessionList';
  private lastAgentSessionID: string | null = null;

  // Callback to notify App.tsx of state changes (for UI updates)
  private onStatusUpdate?: (status: string) => void;
  private onRuntimeStateChange?: (state: G2RuntimeState) => void;

  constructor(
    onStatusUpdate?: (status: string) => void,
    onRuntimeStateChange?: (state: G2RuntimeState) => void,
  ) {
    this.onStatusUpdate = onStatusUpdate;
    this.onRuntimeStateChange = onRuntimeStateChange;
  }

  // ── State Management ──────────────────────────────────────

  getState(): G2RuntimeState {
    return this.state;
  }

  subscribe(listener: G2RuntimeStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(newState: G2RuntimeState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const listener of this.listeners) {
      try {
        listener(newState);
      } catch {
        // listener error should not break the runtime
      }
    }
    if (this.onRuntimeStateChange) {
      this.onRuntimeStateChange(newState);
    }
  }

  private updateStatus(status: string): void {
    if (this.onStatusUpdate) {
      this.onStatusUpdate(status);
    }
  }

  // ── Bridge Probe ──────────────────────────────────────────

  /**
   * Probe for EvenAppBridge availability without starting G2 Runtime.
   * Called on PWA startup to determine if G2 options should be shown.
   *
   * Returns true if bridge is available (G2-capable environment).
   * This does NOT start the G2 Runtime — it only detects the environment.
   */
  async probeBridge(): Promise<boolean> {
    if (this.isBridgeProbed) {
      return this.bridge !== null;
    }

    try {
      const bridge = await waitForEvenAppBridge();
      if (bridge) {
        await bridge.getDeviceInfo();
        this.bridge = bridge;
        this.isBridgeProbed = true;
        this.setupBridgeEventListeners();
        return true;
      }
    } catch (e) {
      // Bridge not available (browser/simulator)
    }

    this.isBridgeProbed = true;
    return false;
  }

  /**
   * Whether the bridge is available (G2-capable environment).
   * Only meaningful after probeBridge() has been called.
   */
  isBridgeAvailable(): boolean {
    return this.bridge !== null;
  }

  // ── Bridge Event Listeners ────────────────────────────────

  /**
   * Set up bridge event listeners for launch source and exit events.
   * These are registered once the bridge is detected, regardless of
   * whether G2 Runtime is active.
   */
  private setupBridgeEventListeners(): void {
    if (!this.bridge) return;

    // Listen for launch source (glassesMenu vs appMenu)
    this.launchSourceUnsubscribe = this.bridge.onLaunchSource((source) => {
      if (source === 'glassesMenu') {
        this.startG2Runtime();
      }
    });

    // Listen for exit events from G2 (SYSTEM_EXIT_EVENT, ABNORMAL_EXIT_EVENT)
    this.eventUnsubscribe = this.bridge.onEvenHubEvent((event) => {
      if (event.sysEvent) {
        const type = event.sysEvent.eventType;
        if (
          type === OsEventTypeList.SYSTEM_EXIT_EVENT ||
          type === OsEventTypeList.ABNORMAL_EXIT_EVENT
        ) {
          this.shutdownG2Runtime();
        }
      }
    });
  }

  // ── G2 Runtime Lifecycle ──────────────────────────────────

  /**
   * Start the G2 Runtime. Idempotent — returns immediately if already
   * starting or active.
   *
   * Initialization sequence (must be maintained):
   * 1. EvenAppBridge / G2 environment check
   * 2. PageManager creation + initialize()
   * 3. GatewayFileSystemService initialize()
   * 4. OpenCodeClient creation
   * 5. G2AgentController creation + initialize()
   * 6. Navigate to the configured startup screen
   *    (ホーム / エクスプローラー / エージェント / 履歴 — PWA setting,
   *     default エクスプローラー; 既存値 explorer/history/agent は従来通り)
   */
  async startG2Runtime(): Promise<void> {
    // Prevent double-start
    if (this.state === 'starting' || this.state === 'active') {
      return;
    }

    this.setState('starting');
    this.updateStatus('G2 Runtime starting...');

    try {
      // 1. Ensure bridge is available
      if (!this.bridge) {
        const bridge = await waitForEvenAppBridge();
        if (!bridge) {
          throw new Error('EvenAppBridge not available');
        }
        this.bridge = bridge;
        this.setupBridgeEventListeners();
      }

      // 2. Create and initialize PageManager
      this.updateStatus('Initializing G2 SDK...');
      this.pageManager = new PageManager((status) => this.updateStatus(status));
      await this.pageManager.initialize();

      // 3. Initialize Gateway
      this.updateStatus('Connecting to Gateway...');
      const config = resolveConfig();
      if (config.mode === 'gateway' && config.gatewayToken) {
        this.gatewayService = new GatewayFileSystemService(config.gatewayUrl, config.gatewayToken);
        await this.gatewayService.initialize();
      }

      // 4. Create OpenCodeClient
      if (config.mode === 'gateway' && config.gatewayToken) {
        this.openCodeClient = new OpenCodeClient({
          gatewayUrl: config.gatewayUrl,
          gatewayToken: config.gatewayToken,
        });
      }

      // 5. Create and initialize G2AgentController
      if (this.openCodeClient) {
        this.agentStateStore = new AgentStateStore();
        this.g2AgentController = new G2AgentController(this.agentStateStore);
        this.g2AgentController.initialize(this.openCodeClient);
        this.g2AgentController.setBridge(this.bridge);
      }

      // 6. Create the initial page according to the startup screen setting
      // Gateway is always initialized before this point (step 3).
      // Gateway 未接続時は startupScreen 設定に関係なく Home へフォールバックする
      // (設定値 homepilot.g2StartupScreen は書き換えない)。
      const startupPage = resolveG2InitialPage(loadG2StartupScreen(), {
        hasGateway: this.isGatewayAvailable(),
        hasAgent: this.g2AgentController !== null,
      });

      if (startupPage === 'home') {
        // Home does not touch any file system: the connection target is
        // decided by the selection made on Home itself.
        this.updateStatus('Loading G2 Home...');
        await this.navigateToHome();
      } else if (startupPage === 'history') {
        // Startup History has no "page entered from" origin, so clear the
        // History return point: double-tap then falls back to Home
        // (G2起動 → History → Double Tap → Home).
        // Normal History return paths (navigateToHistory from other pages)
        // are unaffected.
        this.updateStatus('Loading G2 History...');
        this.historyReturnPage = null;
        await this.navigateToHistory();
      } else if (startupPage === 'agent') {
        this.updateStatus('Loading G2 Agent...');
        this.agentReturnPage = null;
        await this.navigateToSessionList();
      } else {
        // Backward compatibility: startupScreen=explorer still starts on the
        // Gateway side exactly like before Home was introduced.
        this.updateStatus('Loading G2 Explorer...');
        const rootPath = this.gatewayService
          ? this.gatewayService.getRootPath()
          : '/home';
        const explorerPage = new ExplorerPage(
          rootPath,
          this.gatewayService!,
          undefined,
          undefined,
          undefined,
          this.showAgentEntries() ? () => this.navigateToAgentFromExplorer() : undefined,
          this.gatewayService,
          () => this.navigateToHistory(),
          () => this.navigateToHome(),
          this.resolveHistoryAccess(),
        );
        await this.pageManager.navigateTo(explorerPage);
      }

      this.setState('active');
      this.updateStatus('G2 Runtime active');
    } catch (err) {
      this.updateStatus(`G2 start failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      await this.cleanupG2Resources();
      this.setState('inactive');
    }
  }

  /**
   * Shutdown the G2 Runtime. Idempotent — safe to call multiple times.
   *
   * Cleanup order (reverse of initialization):
   * 1. G2AgentController.dispose()
   * 2. PageManager.destroy() + shutDownPageContainer()
   * 3. Reset all references
   */
  async shutdownG2Runtime(): Promise<void> {
    if (this.state === 'inactive' || this.state === 'stopping') {
      return;
    }

    this.setState('stopping');
    this.updateStatus('Shutting down G2 Runtime...');

    try {
      // 1. Dispose G2AgentController
      if (this.g2AgentController) {
        this.g2AgentController.dispose();
        this.g2AgentController = null;
      }

      // 2. Release OpenCodeClient reference
      this.openCodeClient = null;

      // 3. Destroy PageManager and shut down page container
      if (this.pageManager) {
        try {
          await this.pageManager.shutDownPageContainer();
        } catch {
          // shutDownPageContainer may fail if bridge is already gone
        }
        this.pageManager.destroy();
        this.pageManager = null;
      }

      // 4. Clear agent state store reference
      this.agentStateStore = null;

      // 5. Clear gateway reference
      this.gatewayService = null;
      this.localFileService = null;
      this.homePage = null;
      this.connectionMode = 'gateway';

    // 6. Clear agent navigation state
    this.agentReturnPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;
    this.historyPage = null;
    this.historyReturnPage = null;
    this.agentCurrentPath = '';
    this.lastAgentPage = 'sessionList';
    this.lastAgentSessionID = null;

      this.setState('inactive');
      this.updateStatus('G2 Runtime stopped');
    } catch (err) {
      await this.cleanupG2Resources();
      this.setState('inactive');
    }
  }

  /**
   * Cleanup all G2 resources without state transitions.
   * Used for error recovery during startup failures.
   */
  private async cleanupG2Resources(): Promise<void> {
    if (this.g2AgentController) {
      try { this.g2AgentController.dispose(); } catch { /* ignore */ }
      this.g2AgentController = null;
    }
    this.openCodeClient = null;
    if (this.pageManager) {
      try { this.pageManager.destroy(); } catch { /* ignore */ }
      this.pageManager = null;
    }
    this.agentStateStore = null;
    this.gatewayService = null;
    this.localFileService = null;
    this.homePage = null;
    this.connectionMode = 'gateway';
    this.agentReturnPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;
    this.historyPage = null;
    this.historyReturnPage = null;
    this.agentCurrentPath = '';
    this.lastAgentPage = 'sessionList';
    this.lastAgentSessionID = null;
  }

  // ── Accessors for G2 Pages ────────────────────────────────

  getPageManager(): PageManager | null {
    return this.pageManager;
  }

  getGatewayService(): GatewayFileSystemService | null {
    return this.gatewayService;
  }

  getG2AgentController(): G2AgentController | null {
    return this.g2AgentController;
  }

  /** Current connection target: 'local' (アプリ) or 'gateway' (自宅PC). */
  getConnectionMode(): G2ConnectionMode {
    return this.connectionMode;
  }

  // ── Home / Connection (Local ⇄ Gateway) ─────────────────────

  /**
   * Resolve the FileSystemService for the active connection mode.
   * 'local' → LocalFileSystemService (created via createFileSystemService),
   * 'gateway' → the GatewayFileSystemService initialized at startup.
   */
  private resolveActiveFileService(): FileSystemService | null {
    if (this.connectionMode === 'local') {
      return this.localFileService;
    }
    return this.gatewayService;
  }

  /**
   * Resolve the HistoryAccess for the active connection mode.
   * Reuses the existing PWA History foundation (HistoryAccess /
   * LocalHistoryStore / ViewerHistoryStore) — G2 keeps no separate
   * history implementation.
   */
  private resolveHistoryAccess(): HistoryAccess | null {
    if (this.connectionMode === 'local') {
      return this.localFileService ? createLocalHistoryAccess(this.localFileService) : null;
    }
    return this.gatewayService ? createGatewayHistoryAccess(this.gatewayService) : null;
  }

  /** Agent is gateway (自宅PC) only — never offered on the local side. */
  private showAgentEntries(): boolean {
    return this.connectionMode === 'gateway';
  }

  /**
   * Whether the Gateway service exists AND was able to connect.
   * 初期化に失敗したサービスが残っていても「接続あり」とはみなさない。
   */
  private isGatewayAvailable(): boolean {
    return (
      this.gatewayService !== null &&
      this.gatewayService.isAvailable &&
      !!this.gatewayService.getRootPath()
    );
  }

  /**
   * Create (and remember) the FileSystemService for the selected target.
   * An already created Gateway service is reused, but only after it has
   * been (re)connected — an unavailable one is retried, not returned as-is.
   */
  private async resolveFileService(target: G2ConnectionMode): Promise<FileSystemService | null> {
    if (target === 'local') {
      if (!this.localFileService) {
        this.localFileService = createFileSystemService('local') as LocalFileSystemService;
      }
      return this.localFileService;
    }

    if (this.gatewayService) {
      if (!this.gatewayService.isAvailable || !this.gatewayService.getRootPath()) {
        // 起動時に接続に失敗している — PC が復帰していても選択時に接続し直す
        try {
          await this.gatewayService.initialize();
        } catch {
          // initialize() は内部で失敗を握りつぶすはずだが念のため
        }
      }
      if (this.gatewayService.isAvailable && this.gatewayService.getRootPath()) {
        return this.gatewayService;
      }
      return null;
    }

    const service = createFileSystemService('gateway');
    if (!(service instanceof GatewayFileSystemService)) return null;
    try {
      await service.initialize();
    } catch {
      // Gateway unreachable — reported below
    }
    if (!service.isAvailable || !service.getRootPath()) return null;
    this.gatewayService = service;
    return service;
  }

  /**
   * Navigate to Home, the root screen of the G2 app.
   * Home only returns a choice, so every return point is dropped here.
   * That prevents navigating back into pages of the previous connection mode.
   */
  async navigateToHome(): Promise<void> {
    if (!this.pageManager) return;

    this.historyReturnPage = null;
    this.agentReturnPage = null;
    this.historyPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;

    this.homePage = new HomePage((target) => this.handleHomeSelection(target));
    await this.pageManager.navigateTo(this.homePage);
  }

  /**
   * Switch to the connection target picked on Home and open the root Explorer.
   * connectionMode is only updated here and is never persisted.
   */
  private async handleHomeSelection(target: G2ConnectionMode): Promise<void> {
    if (!this.pageManager) return;

    let service: FileSystemService | null = null;
    try {
      service = await this.resolveFileService(target);
    } catch {
      service = null;
    }
    if (!service) {
      // 接続失敗: PWA 側ステータス (従来どおり) と、G2 Home 画面上の表示の両方へ出す。
      // notifyStatus / updateStatus は PWA にしか届かないため、G2 上で伝えるには
      // Home の描画に載せる必要がある。
      const message =
        target === 'gateway'
          ? '自宅PC（Gateway）に接続できませんでした。'
          : 'アプリ（ローカル）を開けませんでした。';
      this.updateStatus(message);
      await this.homePage?.setStatus(message);
      return;
    }

    this.connectionMode = target;
    this.historyReturnPage = null;
    this.agentReturnPage = null;
    this.historyPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;

    await this.navigateToRootExplorer();
  }

  /**
   * Create a root Explorer page bound to the active connection mode.
   */
  private createRootExplorerPage(service: FileSystemService): ExplorerPage {
    return new ExplorerPage(
      service.getRootPath(),
      service,
      undefined,
      undefined,
      undefined,
      this.showAgentEntries() ? () => this.navigateToAgentFromExplorer() : undefined,
      this.connectionMode === 'gateway' ? this.gatewayService : null,
      () => this.navigateToHistory(),
      () => this.navigateToHome(),
      this.resolveHistoryAccess(),
    );
  }

  // ── Agent Navigation ──────────────────────────────────────

  /**
   * Navigate from Explorer/FileViewer to Agent Session List.
   * Saves the current page as agentReturnPage only when entering from
   * Explorer/FileViewer (not from Agent sub-pages).
   */
  async navigateToSessionList(): Promise<void> {
    if (!this.pageManager || !this.g2AgentController) return;

    const currentPage = this.pageManager.getCurrentPage();
    const isFromExplorer = currentPage?.pageType === 'ExplorerPage' || currentPage?.pageType === 'FileViewerPage';

    // Save the return page only when entering from Explorer/FileViewer
    if (isFromExplorer) {
      this.agentReturnPage = currentPage || null;
    }

    // Capture current path for Agent Chat header
    if (currentPage && typeof (currentPage as any).getCurrentPath === 'function') {
      this.agentCurrentPath = (currentPage as any).getCurrentPath();
    } else {
      this.agentCurrentPath = '';
    }

    // Remember last agent page
    this.lastAgentPage = 'sessionList';
    this.lastAgentSessionID = null;

    // Create or reuse session list page
    this.ensureSessionListPage();

    await this.pageManager.navigateTo(this.sessionListPage!);
  }

  /**
   * Navigate from Session List to Agent Chat for a specific session.
   * Does NOT change agentReturnPage.
   */
  async navigateToAgentChat(sessionID: string): Promise<void> {
    if (!this.pageManager || !this.g2AgentController) return;

    await this.g2AgentController.selectSession(sessionID);

    // Remember last agent page
    this.lastAgentPage = 'chat';
    this.lastAgentSessionID = sessionID;

    const chatPage = new AgentChatPage(
      this.g2AgentController,
      () => this.returnToSessionList(),
      () => this.navigateFromAgentToExplorer(),
      () => this.navigateToHistory(),
      this.agentCurrentPath,
      this.agentReturnPage,
      () => this.navigateToHome(),
    );

    await this.pageManager.navigateTo(chatPage);
  }

  /**
   * Navigate from Session List to Model Select.
   * Does NOT change agentReturnPage.
   */
  async navigateToModelSelect(): Promise<void> {
    if (!this.pageManager || !this.g2AgentController) return;

    this.modelSelectPage = new AgentModelSelectPage(
      this.g2AgentController,
      (sessionID) => this.navigateToAgentChat(sessionID),
      () => this.returnToSessionList(),
      () => this.navigateToHome(),
    );

    await this.pageManager.navigateTo(this.modelSelectPage);
  }

  /**
   * Ensure sessionListPage exists. Creates it lazily if it was cleared
   * by navigateFromAgentToExplorer(). This allows Chat's Double Tap
   * → returnToSessionList() to work even after navigating back to
   * Explorer and then returning to Agent Chat.
   */
  private ensureSessionListPage(): void {
    if (this.sessionListPage || !this.g2AgentController) return;
    this.sessionListPage = new AgentSessionListPage(
      this.g2AgentController,
      (sessionID) => this.navigateToAgentChat(sessionID),
      () => this.navigateToModelSelect(),
      () => this.navigateFromAgentToExplorer(),
      () => this.navigateToHistory(),
      this.agentCurrentPath,
      () => this.navigateToHome(),
    );
  }

  /**
   * Navigate from Chat back to Session List.
   * Reuses the same sessionListPage instance.
   * Does NOT change agentReturnPage.
   */
  async returnToSessionList(): Promise<void> {
    if (!this.pageManager) return;

    this.ensureSessionListPage();
    if (!this.sessionListPage) return;

    this.modelSelectPage = null;

    // Sync last agent page state so navigateToAgentFromExplorer()
    // restores Session List (not Chat) when returning from Explorer.
    this.lastAgentPage = 'sessionList';
    this.lastAgentSessionID = null;

    const currentSessionID = this.g2AgentController?.getState().selectedSessionID || null;
    this.sessionListPage.setReturnSessionID(currentSessionID);

    await this.pageManager.navigateTo(this.sessionListPage);
  }

  /**
   * Navigate from Agent (Session List or Chat) back to the original
   * Explorer/FileViewer page. Clears agentReturnPage and sessionListPage.
   * Falls back to a fresh root Explorer if the return point was already
   * consumed (e.g. Agent was re-entered via History).
   */
  async navigateFromAgentToExplorer(): Promise<void> {
    if (!this.pageManager) return;

    const returnPage = this.agentReturnPage;
    this.agentReturnPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;

    if (returnPage) {
      await this.pageManager.navigateTo(returnPage);
      return;
    }

    await this.navigateToRootExplorer();
  }

  /**
   * Navigate from any Explorer/FileViewer page to Agent, restoring the
   * last viewed Agent page (Session List or Chat).
   */
  async navigateToAgentFromExplorer(): Promise<void> {
    if (!this.pageManager || !this.g2AgentController) return;

    // Save current Explorer/FileViewer page as return point
    const currentPage = this.pageManager.getCurrentPage();
    if (currentPage) {
      this.agentReturnPage = currentPage;
      if (typeof (currentPage as any).getCurrentPath === 'function') {
        this.agentCurrentPath = (currentPage as any).getCurrentPath();
      }
    }

    // Restore last Agent page
    if (this.lastAgentPage === 'chat' && this.lastAgentSessionID) {
      await this.navigateToAgentChat(this.lastAgentSessionID);
    } else {
      await this.navigateToSessionList();
    }
  }

  // ── History Navigation ────────────────────────────────────

  /**
   * Navigate from Explorer/FileViewer/Agent pages to History page.
   * Saves the current page as the History return point, so Back from
   * History restores whichever screen was used to enter (Explorer,
   * File Viewer, Agent Session List, or Agent Chat).
   */
  async navigateToHistory(): Promise<void> {
    if (!this.pageManager) return;

    const fileService = this.resolveActiveFileService();
    const historyAccess = this.resolveHistoryAccess();
    if (!fileService || !historyAccess) return;

    const currentPage = this.pageManager.getCurrentPage();
    const pageType = currentPage?.pageType;
    const canReturnToCurrent =
      pageType === 'ExplorerPage' ||
      pageType === 'FileViewerPage' ||
      pageType === 'AgentSessionListPage' ||
      pageType === 'AgentChatPage';

    // Save the current page as the return point (always overwrite so a
    // stale value left by an earlier History excursion cannot win)
    if (canReturnToCurrent) {
      this.historyReturnPage = currentPage || null;
    }

    const showAgent = this.showAgentEntries();

    this.historyPage = new HistoryPage(
      historyAccess,
      fileService,
      undefined,
      undefined,
      showAgent
        ? () => this.navigateToAgentFromExplorer()   // onAgentSessionList (forwarded to FileViewer)
        : undefined,
      () => this.navigateFromHistoryToExplorer(), // onBackToExplorer (double-tap: back to origin page)
      // Context menu — explicit screen transitions (never restore the origin page):
      () => this.navigateToRootExplorer(),        // "エクスプローラ画面へ" → root Explorer
      showAgent
        ? () => this.navigateToSessionList()      // "エージェント画面へ" → Agent Session List
        : undefined,
      this.connectionMode === 'gateway' ? this.gatewayService : null,
      () => this.navigateToHome(),                // "ホーム画面へ" → Home (戻り先は作らない)
    );

    await this.pageManager.navigateTo(this.historyPage);
  }

  /**
   * Navigate from History back to the original entry page
   * (Explorer/FileViewer/Agent Session List/Agent Chat).
   * Restores the saved page instance (preserving path, selection, scroll, etc.).
   */
  async navigateFromHistoryToExplorer(): Promise<void> {
    if (!this.pageManager) return;

    const returnPage = this.historyReturnPage;
    this.historyReturnPage = null;
    this.historyPage = null;

    if (returnPage) {
      // Re-adopt the restored Session List instance so runtime fields stay
      // consistent even if navigateFromAgentToExplorer() had cleared it.
      if (returnPage.pageType === 'AgentSessionListPage') {
        this.sessionListPage = returnPage as AgentSessionListPage;
      }
      await this.pageManager.navigateTo(returnPage);
    } else {
      // History root (no origin page to restore): this used to fall back to
      // the root Explorer, but Home is now the root of the G2 app.
      await this.navigateToHome();
    }
  }

  /**
   * Create and navigate to a fresh Explorer at the root of the active
   * connection mode. Used when a saved return page is missing, for the
   * History "エクスプローラ画面へ" menu, and for Home → アプリ / 自宅PC.
   */
  private async navigateToRootExplorer(): Promise<void> {
    if (!this.pageManager) return;

    const service = this.resolveActiveFileService();
    if (!service) return;

    await this.pageManager.navigateTo(this.createRootExplorerPage(service));
  }

  // ── Cleanup ───────────────────────────────────────────────

  /**
   * Destroy the G2RuntimeManager and release all resources.
   * Called when the PWA is unmounted or the manager is no longer needed.
   */
  destroy(): void {
    // Unsubscribe bridge listeners
    if (this.launchSourceUnsubscribe) {
      this.launchSourceUnsubscribe();
      this.launchSourceUnsubscribe = null;
    }
    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }

    // Shutdown runtime if active
    if (this.state !== 'inactive') {
      this.shutdownG2Runtime();
    }

    this.listeners.clear();
    this.bridge = null;
  }
}
