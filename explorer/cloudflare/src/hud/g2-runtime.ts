import {
  type EvenAppBridge,
  waitForEvenAppBridge,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk';
import { PageManager } from './page-manager';
import { GatewayFileSystemService } from '../services/GatewayFileSystemService';
import { OpenCodeClient } from '../services/OpenCodeClient';
import { OpenCodeEventService } from '../services/OpenCodeEventService';
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
 * When not active, no G2 resources (PageManager, Gateway, OpenCode SSE,
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
  private openCodeEventService: OpenCodeEventService | null = null;
  private g2AgentController: G2AgentController | null = null;
  private agentStateStore: AgentStateStore | null = null;

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
        // Verify bridge is actually responsive
        await bridge.getDeviceInfo();
        this.bridge = bridge;
        this.isBridgeProbed = true;
        console.log('[G2RuntimeManager] Bridge detected and responsive.');
        this.setupBridgeEventListeners();
        return true;
      }
    } catch (e) {
      console.log('[G2RuntimeManager] Bridge not available (browser/simulator):', e);
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
      console.log(`[G2RuntimeManager] Launch source: ${source}`);
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
          console.log(`[G2RuntimeManager] G2 exit event received (type: ${type})`);
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
   * 5. OpenCodeEventService creation + connect()
   * 6. G2AgentController creation + initialize()
   * 7. Navigate to G2 Explorer
   */
  async startG2Runtime(): Promise<void> {
    // Prevent double-start
    if (this.state === 'starting' || this.state === 'active') {
      console.log(`[G2RuntimeManager] startG2Runtime() ignored — state: ${this.state}`);
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
      const bridgeReady = await this.pageManager.initialize();
      if (!bridgeReady) {
        console.warn('[G2RuntimeManager] PageManager initialized in browser standalone mode');
      }

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

      // 5. Create and connect OpenCodeEventService
      if (config.mode === 'gateway' && config.gatewayToken) {
        this.openCodeEventService = new OpenCodeEventService();
        this.openCodeEventService.connect(config.gatewayUrl, config.gatewayToken);
      }

      // 6. Create and initialize G2AgentController
      if (this.openCodeClient && this.openCodeEventService) {
        this.agentStateStore = new AgentStateStore();
        this.g2AgentController = new G2AgentController(this.agentStateStore);
        this.g2AgentController.initialize(this.openCodeClient, this.openCodeEventService);
      }

      this.setState('active');
      this.updateStatus('G2 Runtime active');
      console.log('[G2RuntimeManager] G2 Runtime started successfully.');
    } catch (err) {
      console.error('[G2RuntimeManager] Failed to start G2 Runtime:', err);
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
   * 2. OpenCodeEventService.disconnect()
   * 3. PageManager.destroy() + shutDownPageContainer()
   * 4. Reset all references
   */
  async shutdownG2Runtime(): Promise<void> {
    if (this.state === 'inactive' || this.state === 'stopping') {
      console.log(`[G2RuntimeManager] shutdownG2Runtime() ignored — state: ${this.state}`);
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

      // 2. Disconnect OpenCodeEventService
      if (this.openCodeEventService) {
        this.openCodeEventService.disconnect();
        this.openCodeEventService.destroy();
        this.openCodeEventService = null;
      }

      // 3. Release OpenCodeClient reference
      this.openCodeClient = null;

      // 4. Destroy PageManager and shut down page container
      if (this.pageManager) {
        try {
          await this.pageManager.shutDownPageContainer();
        } catch {
          // shutDownPageContainer may fail if bridge is already gone
        }
        this.pageManager.destroy();
        this.pageManager = null;
      }

      // 5. Clear agent state store reference
      this.agentStateStore = null;

      // 6. Clear gateway reference
      this.gatewayService = null;

      this.setState('inactive');
      this.updateStatus('G2 Runtime stopped');
      console.log('[G2RuntimeManager] G2 Runtime shut down successfully.');
    } catch (err) {
      console.error('[G2RuntimeManager] Error during shutdown:', err);
      // Force cleanup even on error
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
    if (this.openCodeEventService) {
      try { this.openCodeEventService.disconnect(); this.openCodeEventService.destroy(); } catch { /* ignore */ }
      this.openCodeEventService = null;
    }
    this.openCodeClient = null;
    if (this.pageManager) {
      try { this.pageManager.destroy(); } catch { /* ignore */ }
      this.pageManager = null;
    }
    this.agentStateStore = null;
    this.gatewayService = null;
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
