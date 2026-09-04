import {
  OpenCodeSessionInfo,
  OpenCodeProviderModel,
  AgentContext,
} from '../../domain/types';
import { OpenCodeClient } from '../../services/OpenCodeClient';
import { formatMessageWithContext } from '../../services/AgentContextFormatter';
import { AgentStateStore } from './agent-state-store';
import { G2AgentState, createInitialG2AgentState } from './types';
import { mapApiMessagesToWithParts, OpenCodeMessageWithParts } from './message-mapper';

export type G2AgentStateListener = (state: G2AgentState) => void;

/**
 * Sort sessions by time.updated descending (most recent first).
 * If time.updated is missing, treat as 0.
 */
function sortSessionsByUpdated(sessions: OpenCodeSessionInfo[]): OpenCodeSessionInfo[] {
  return [...sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
}

/**
 * Insert a session into a sorted list maintaining sort order.
 */
function insertSessionSorted(
  sessions: OpenCodeSessionInfo[],
  session: OpenCodeSessionInfo,
): OpenCodeSessionInfo[] {
  const updated = session.time?.updated ?? 0;
  for (let i = 0; i < sessions.length; i++) {
    if (updated > (sessions[i].time?.updated ?? 0)) {
      const result = [...sessions];
      result.splice(i, 0, session);
      return result;
    }
  }
  return [...sessions, session];
}

/**
 * G2AgentController manages Agent runtime state for the G2 glasses.
 *
 * Architecture:
 *   G2 Pages → G2AgentController → OpenCodeClient
 *
 * This is a plain TypeScript class (not a React hook).
 * It uses HTTP-only communication via OpenCodeClient and maintains
 * an independent G2AgentState that G2 Pages can observe.
 *
 * Persistent state (lastChecked, processing) is managed via AgentStateStore,
 * which uses the same localStorage keys as useOpenCode.ts for PWA/G2
 * synchronization.
 */
export class G2AgentController {
  private state: G2AgentState = createInitialG2AgentState();
  private listeners: Set<G2AgentStateListener> = new Set();
  private client: OpenCodeClient | null = null;
  private store: AgentStateStore;

  constructor(store?: AgentStateStore) {
    this.store = store || new AgentStateStore();
    // Initialize processing IDs from persistent store
    this.state.processingSessionIDs = this.store.getProcessingIDs();
  }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Initialize the controller with an existing OpenCodeClient instance.
   * This is shared with the PWA.
   *
   * @param client - Existing OpenCodeClient instance
   */
  initialize(client: OpenCodeClient): void {
    this.client = client;
  }

  dispose(): void {
    this.client = null;
    this.listeners.clear();
  }

  // ── State Access ─────────────────────────────────────────────

  getState(): G2AgentState {
    return this.state;
  }

  subscribe(listener: G2AgentStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<G2AgentState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // listener error should not break the controller
      }
    }
  }

  // ── Session Operations ───────────────────────────────────────

  async refreshSessions(): Promise<void> {
    if (!this.client) return;
    try {
      const sessions = await this.client.getSessions();
      const sorted = sortSessionsByUpdated(sessions);
      this.updateState({ sessions: sorted, error: null });

      // Prune lastChecked for sessions that no longer exist
      const activeIDs = new Set(sorted.map((s) => s.id));
      this.store.pruneLastChecked(activeIDs);

      // Rebuild unread from persistent lastChecked + sessions
      this.rebuildUnread(sorted);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      this.updateState({ error: msg });
    }
  }

  async selectSession(sessionID: string): Promise<void> {
    if (!this.client) return;

    // Mark as checked (persistent)
    this.store.setLastChecked(sessionID, Date.now());

    // Remove from unread immediately
    const newUnread = this.state.unreadSessionIDs.filter((id) => id !== sessionID);

    this.updateState({
      selectedSessionID: sessionID,
      selectedSession:
        this.state.sessions.find((s) => s.id === sessionID) || null,
      messages: [],
      isLoadingMessages: true,
      error: null,
      unreadSessionIDs: newUnread,
    });

    try {
      const apiMessages = await this.client.getMessages(sessionID);
      const messages = mapApiMessagesToWithParts(apiMessages, sessionID);
      this.updateState({ messages, isLoadingMessages: false });

      // After loading messages, check if this session should be removed from processing.
      // Clear processing if the latest assistant message has finish === "stop".
      this.checkAndClearProcessing(sessionID, messages);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load messages';
      this.updateState({ isLoadingMessages: false, error: msg });
    }
  }

  async createSession(model: OpenCodeProviderModel): Promise<string | null> {
    if (!this.client) return null;
    try {
      const settings = this.store.loadSettings();
      const session = await this.client.createSession({
        projectID: settings.selectedProjectID,
        model: { id: model.modelID, providerID: model.providerID },
      });
      this.updateState({
        sessions: insertSessionSorted(this.state.sessions, session),
      });
      return session.id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create session';
      this.updateState({ error: msg });
      return null;
    }
  }

  // ── Message Operations ───────────────────────────────────────

  async refreshMessages(): Promise<void> {
    if (!this.client || !this.state.selectedSessionID) return;
    this.updateState({ isLoadingMessages: true, error: null });
    try {
      const apiMessages = await this.client.getMessages(this.state.selectedSessionID);
      const messages = mapApiMessagesToWithParts(apiMessages, this.state.selectedSessionID);
      this.updateState({ messages, isLoadingMessages: false, error: null });

      // After refresh, check if the selected session should be removed from processing
      this.checkAndClearProcessing(this.state.selectedSessionID, messages);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load messages';
      this.updateState({ isLoadingMessages: false, error: msg });
    }
  }

  async sendMessage(content: string, context?: AgentContext | null): Promise<void> {
    if (!this.client || !this.state.selectedSessionID) return;
    const sessionID = this.state.selectedSessionID;
    const formattedMessage = formatMessageWithContext(context, content);

    // Optimistic messages
    const tempUserMsgId = `temp-user-${Date.now()}`;
    const tempAssistantMsgId = `temp-assistant-${Date.now()}`;

    const userMessage: OpenCodeMessageWithParts = {
      id: tempUserMsgId,
      role: 'user',
      sessionID,
      parts: [],
      contentText: content,
    };

    const processingMessage: OpenCodeMessageWithParts = {
      id: tempAssistantMsgId,
      role: 'assistant',
      sessionID,
      parts: [],
      contentText: '',
    };

    const newProcessing = this.state.processingSessionIDs.includes(sessionID)
      ? this.state.processingSessionIDs
      : [...this.state.processingSessionIDs, sessionID];

    this.updateState({
      messages: [...this.state.messages, userMessage, processingMessage],
      error: null,
      processingSessionIDs: newProcessing,
    });

    // Mark processing in persistent store
    this.store.markProcessing(sessionID);

    try {
      await this.client.sendMessage(sessionID, formattedMessage);
      // POST success: fetch official message state via GET (single fetch, no polling)
      const apiMessages = await this.client.getMessages(sessionID);
      const messages = mapApiMessagesToWithParts(apiMessages, sessionID);
      this.updateState({ messages });
      // Check if the latest assistant message has finish === "stop" to clear processing
      this.checkAndClearProcessing(sessionID, messages);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send message';
      this.store.clearProcessing(sessionID);
      this.updateState({
        messages: this.state.messages.filter(
          (m) => m.id !== tempUserMsgId && m.id !== tempAssistantMsgId
        ),
        processingSessionIDs: this.state.processingSessionIDs.filter((id) => id !== sessionID),
        error: msg,
      });
    }
  }

  // ── Model Operations ─────────────────────────────────────────

  async loadModels(): Promise<OpenCodeProviderModel[]> {
    if (!this.client) return [];
    try {
      const providers = await this.client.getProviders();
      const config = await this.client.getConfig();
      const configObj = config as Record<string, unknown>;
      const allowedLmStudio = new Set<string>(
        (configObj?.allowedLmStudioModelIds as string[]) || []
      );
      const models = this.client.extractFreeModels(providers, allowedLmStudio);
      this.updateState({ models });
      return models;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load models';
      this.updateState({ error: msg });
      return [];
    }
  }

  selectModel(model: OpenCodeProviderModel): void {
    this.updateState({ selectedModel: model });
  }

  // ── Unread / Checked ─────────────────────────────────────────

  markSessionChecked(sessionID: string): void {
    this.store.setLastChecked(sessionID, Date.now());
    const newUnread = this.state.unreadSessionIDs.filter((id) => id !== sessionID);
    if (newUnread.length !== this.state.unreadSessionIDs.length) {
      this.updateState({ unreadSessionIDs: newUnread });
    }
  }

  // ── Voice (State only — full implementation in future phase) ─

  setVoiceState(voiceState: G2AgentState['voiceState']): void {
    this.updateState({ voiceState });
  }

  setTranscript(transcript: string): void {
    this.updateState({ transcript });
  }

  // ── Processing Management ────────────────────────────────────

  /**
   * Check if a session's latest assistant message has finish === "stop",
   * and if so, clear processing for that session.
   * Called after loading messages (selectSession, refreshMessages).
   */
  private checkAndClearProcessing(sessionID: string, messages: OpenCodeMessageWithParts[]): void {
    if (!this.state.processingSessionIDs.includes(sessionID)) return;

    // Find the latest assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        if (msg.finish === 'stop') {
          this.clearProcessingForSession(sessionID);
        }
        // Whether finish is "stop" or not, we found the latest assistant message.
        // If it's not "stop", the session is still actively processing.
        break;
      }
    }
  }

  /**
   * Clear processing state for a specific session (runtime + persistent).
   */
  private clearProcessingForSession(sessionID: string): void {
    this.store.clearProcessing(sessionID);
    if (this.state.processingSessionIDs.includes(sessionID)) {
      this.updateState({
        processingSessionIDs: this.state.processingSessionIDs.filter(
          (id) => id !== sessionID
        ),
      });
    }
  }

  // ── Unread Rebuild ───────────────────────────────────────────

  /**
   * Rebuild unread state from sessions and persistent lastChecked.
   *
   * Uses session.time.updated as a preliminary indicator. This is the same
   * approach the PWA uses before syncSessionStates() refines it.
   *
   * Note: session.time.updated reflects ALL session activity (including
   * user messages), not just assistant responses. This means:
   * - Sessions where the user sent a message but got no response yet
   *   may appear as "unread" (false positive).
   * - This is acceptable as a preliminary indicator. The Chat Page
   *   can verify by loading messages and checking finish === "stop".
   *
   * A future enhancement could add a lightweight "last assistant completed"
   * timestamp to avoid false positives without fetching all messages.
   */
  private rebuildUnread(sessions: OpenCodeSessionInfo[]): void {
    const lastChecked = this.store.loadLastChecked();
    const unreadIDs: string[] = [];

    for (const session of sessions) {
      if (OpenCodeClient.isSessionArchived(session)) continue;
      const latestTime = session.time?.updated ?? 0;
      if (latestTime > (lastChecked[session.id] ?? 0)) {
        unreadIDs.push(session.id);
      }
    }

    this.updateState({ unreadSessionIDs: unreadIDs });
  }
}
