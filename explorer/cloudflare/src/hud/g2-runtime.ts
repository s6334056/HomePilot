import {
  type EvenAppBridge,
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk';
import { PageManager, BasePage } from './page-manager';
import { ExplorerPage } from './pages/explorer-page';
import { AgentSessionListPage } from './g2-agent/pages/agent-session-list-page';
import { AgentModelSelectPage } from './g2-agent/pages/agent-model-select-page';
import { AgentChatPage } from './g2-agent/pages/agent-chat-page';
import { GatewayFileSystemService } from '../services/GatewayFileSystemService';
import { OpenCodeClient } from '../services/OpenCodeClient';
import { G2AgentController } from './g2-agent/g2-agent-controller';
import { AgentStateStore } from './g2-agent/agent-state-store';
import { resolveConfig } from '../services/ConnectionConfig';

export type G2RuntimeState = 'inactive' | 'starting' | 'active' | 'stopping';

export type G2RuntimeStateListener = (state: G2RuntimeState) => void;

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
  private openCodeClient: OpenCodeClient | null = null;
  private g2AgentController: G2AgentController | null = null;
  private agentStateStore: AgentStateStore | null = null;

  // Agent Navigation state
  private agentReturnPage: BasePage | null = null;
  private sessionListPage: AgentSessionListPage | null = null;
  private modelSelectPage: AgentModelSelectPage | null = null;
  private agentCurrentPath: string = '';

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
   * 6. Navigate to G2 Explorer
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

      // 6. Create ExplorerPage and navigate to it on G2
      // Gateway is always initialized before this point (step 3)
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
        () => this.navigateToSessionList(),
      );
      await this.pageManager.navigateTo(explorerPage);

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

    // 6. Clear agent navigation state
    this.agentReturnPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;
    this.agentCurrentPath = '';

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
    this.agentReturnPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;
    this.agentCurrentPath = '';
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

  // ── Agent Navigation ──────────────────────────────────────

  /**
   * Navigate from Explorer/FileViewer to Agent Session List.
   * Saves the current page as agentReturnPage (the page to return to).
   */
  async navigateToSessionList(): Promise<void> {
    if (!this.pageManager || !this.g2AgentController) return;

    const currentPage = this.pageManager.getCurrentPage();

    // Save the current page as the return point for Agent → Explorer/FileViewer
    this.agentReturnPage = currentPage || null;

    // Capture current path for Agent Chat header
    if (currentPage && typeof (currentPage as any).getCurrentPath === 'function') {
      this.agentCurrentPath = (currentPage as any).getCurrentPath();
    } else {
      this.agentCurrentPath = '';
    }

    // Create or reuse session list page
    if (!this.sessionListPage) {
      this.sessionListPage = new AgentSessionListPage(
        this.g2AgentController,
        (sessionID) => this.navigateToAgentChat(sessionID),
        () => this.navigateToModelSelect(),
        () => this.returnToExplorer(),
        this.agentCurrentPath,
      );
    }

    await this.pageManager.navigateTo(this.sessionListPage);
  }

  /**
   * Navigate from Session List to Agent Chat for a specific session.
   * Does NOT change agentReturnPage.
   */
  async navigateToAgentChat(sessionID: string): Promise<void> {
    if (!this.pageManager || !this.g2AgentController) return;

    await this.g2AgentController.selectSession(sessionID);

    const chatPage = new AgentChatPage(
      this.g2AgentController,
      () => this.returnToSessionList(),
      () => this.returnToExplorer(),
      this.agentCurrentPath,
      this.agentReturnPage,
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
    );

    await this.pageManager.navigateTo(this.modelSelectPage);
  }

  /**
   * Navigate from Chat back to Session List.
   * Reuses the same sessionListPage instance.
   * Does NOT change agentReturnPage.
   */
  async returnToSessionList(): Promise<void> {
    if (!this.pageManager || !this.sessionListPage) return;

    this.modelSelectPage = null;

    const currentSessionID = this.g2AgentController?.getState().selectedSessionID || null;
    this.sessionListPage.setReturnSessionID(currentSessionID);

    await this.pageManager.navigateTo(this.sessionListPage);
  }

  /**
   * Navigate from Agent (Session List or Chat) back to the original
   * Explorer/FileViewer page. Clears agentReturnPage and sessionListPage.
   */
  async returnToExplorer(): Promise<void> {
    if (!this.pageManager || !this.agentReturnPage) return;

    const returnPage = this.agentReturnPage;
    this.agentReturnPage = null;
    this.sessionListPage = null;
    this.modelSelectPage = null;

    await this.pageManager.navigateTo(returnPage);
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
