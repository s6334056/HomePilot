import {
  OpenCodeConnectionStatus,
  OpenCodeSessionInfo,
  OpenCodeMessageInfo,
  OpenCodeMessagePart,
  OpenCodeSSEEvent,
  OpenCodeProviderModel,
  AgentContext,
} from '../../domain/types';
import { OpenCodeClient } from '../../services/OpenCodeClient';
import { OpenCodeEventService } from '../../services/OpenCodeEventService';
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
 *   G2 Pages → G2AgentController → OpenCodeClient / OpenCodeEventService
 *
 * This is a plain TypeScript class (not a React hook).
 * It subscribes to SSE events via OpenCodeEventService and maintains
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
  private disposers: Array<() => void> = [];

  constructor(store?: AgentStateStore) {
    this.store = store || new AgentStateStore();
    // Initialize processing IDs from persistent store
    this.state.processingSessionIDs = this.store.getProcessingIDs();
  }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Initialize the controller with existing OpenCodeClient and
   * OpenCodeEventService instances. These are shared with the PWA.
   *
   * @param client - Existing OpenCodeClient instance
   * @param eventService - Existing OpenCodeEventService instance
   */
  initialize(client: OpenCodeClient, eventService: OpenCodeEventService): void {
    this.client = client;

    // Subscribe to SSE events
    const eventDisposer = eventService.onEvent((event) => this.processEvent(event));
    this.disposers.push(eventDisposer);

    // Subscribe to connection status changes
    const connectionDisposer = eventService.onConnectionChange((status) => {
      const connectionStatus: OpenCodeConnectionStatus =
        status === 'connected' ? 'connected'
          : status === 'reconnecting' ? 'reconnecting'
          : status === 'error' ? 'error'
          : 'disconnected';
      this.updateState({ connectionStatus });
    });
    this.disposers.push(connectionDisposer);

    // Set initial connection status
    if (eventService.connected) {
      this.updateState({ connectionStatus: 'connected' });
    }
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
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
      // SSE events will handle the real message updates
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

  // ── SSE Event Processing ─────────────────────────────────────

  private processEvent(event: OpenCodeSSEEvent): void {
    const payload = event.payload;
    if (!payload) return;

    const isSyncEvent = !!payload.syncEvent;
    const eventType = isSyncEvent ? payload.syncEvent!.type : payload.type;
    const properties = isSyncEvent
      ? payload.syncEvent!.data
      : (payload.properties || {}) as Record<string, unknown>;

    switch (eventType) {
      case 'session.created':
        this.handleSessionCreated(properties);
        break;
      case 'session.updated':
        this.handleSessionUpdated(properties);
        break;
      case 'session.status':
        this.handleSessionStatus(properties);
        break;
      case 'message.updated':
        this.handleMessageUpdated(properties);
        break;
      case 'message.part.updated':
        this.handleMessagePartUpdated(properties);
        break;
      case 'message.part.delta':
        this.handleMessagePartDelta(properties);
        break;
      case 'permission.asked':
        // Permission handling reserved for future G2 Permission Page
        break;
    }
  }

  private handleSessionCreated(properties: Record<string, unknown>): void {
    const props = properties as unknown as { sessionID: string; info: OpenCodeSessionInfo };
    if (!props?.sessionID) return;
    const newSession = props.info || { id: props.sessionID };
    if (OpenCodeClient.isSessionArchived(newSession)) return;
    const exists = this.state.sessions.some((s) => s.id === props.sessionID);
    if (exists) return;
    this.updateState({
      sessions: insertSessionSorted(this.state.sessions, newSession),
    });
  }

  private handleSessionUpdated(properties: Record<string, unknown>): void {
    const props = properties as unknown as { sessionID: string; info: Partial<OpenCodeSessionInfo> };
    if (!props?.sessionID) return;
    const mergedInfo = props.info;

    // Re-sort: merge info, then re-sort the full list by time.updated
    const updatedSessions = this.state.sessions.map((s) =>
      s.id === props.sessionID ? { ...s, ...mergedInfo } : s
    );
    const sorted = sortSessionsByUpdated(updatedSessions);

    this.updateState({
      sessions: sorted,
      selectedSession:
        this.state.selectedSession?.id === props.sessionID
          ? { ...this.state.selectedSession, ...mergedInfo }
          : this.state.selectedSession,
    });
  }

  private handleSessionStatus(properties: Record<string, unknown>): void {
    const props = properties as unknown as { sessionID: string; status: { type: string } };
    if (!props?.sessionID) return;

    // NOTE: session.status is NOT used to clear processing.
    // Processing is cleared when:
    //   1. A message.updated event with finish === "stop" arrives (see handleMessageUpdated)
    //   2. Messages are loaded via selectSession/refreshMessages and the latest
    //      assistant message has finish === "stop" (see checkAndClearProcessing)
    //
    // This avoids the problem where session.status = "busy" arriving immediately
    // after sendMessage would prematurely clear processing before the agent responds.
  }

  private handleMessageUpdated(properties: Record<string, unknown>): void {
    const props = properties as unknown as {
      sessionID: string;
      messageID: string;
      info: Partial<OpenCodeMessageInfo>;
    };
    if (!props?.sessionID || !props?.messageID) return;

    // Processing clear must run regardless of selectedSessionID.
    // If a non-selected session's agent finishes (finish==="stop"),
    // processing should still be cleared.
    if (props.info?.finish === 'stop' && props.info?.role === 'assistant') {
      this.clearProcessingForSession(props.sessionID);
    }

    // Only update messages if this is the currently selected session
    if (this.state.selectedSessionID !== props.sessionID) return;

    let filteredMessages = this.state.messages;

    // Remove optimistic messages when real ones arrive
    if (props.info?.role === 'user') {
      filteredMessages = filteredMessages.filter(
        (m) => !(m.id.startsWith('temp-user-') && m.sessionID === props.sessionID)
      );
    } else if (props.info?.role === 'assistant') {
      filteredMessages = filteredMessages.filter(
        (m) => !(m.id.startsWith('temp-assistant-') && m.sessionID === props.sessionID)
      );
    }

    const existingIdx = filteredMessages.findIndex((m) => m.id === props.messageID);
    let updatedMessages: OpenCodeMessageWithParts[];
    if (existingIdx >= 0) {
      const updated = [...filteredMessages];
      updated[existingIdx] = { ...updated[existingIdx], ...props.info };
      updatedMessages = updated;
    } else {
      const newMsg: OpenCodeMessageWithParts = {
        id: props.messageID,
        role: props.info?.role || 'assistant',
        sessionID: props.sessionID,
        ...props.info,
        parts: [],
        contentText: '',
      };
      updatedMessages = [...filteredMessages, newMsg];
    }

    this.updateState({ messages: updatedMessages });
  }

  private handleMessagePartUpdated(properties: Record<string, unknown>): void {
    const props = properties as unknown as {
      sessionID: string;
      messageID: string;
      partID: string;
      info: Partial<OpenCodeMessagePart>;
    };
    if (!props?.sessionID || !props?.messageID || !props?.partID) return;
    if (this.state.selectedSessionID !== props.sessionID) return;

    const messages = this.state.messages.map((msg) => {
      if (msg.id !== props.messageID) return msg;
      const partIdx = msg.parts.findIndex((p) => p.id === props.partID);
      const partData: OpenCodeMessagePart = {
        id: props.partID,
        type: props.info?.type || 'text',
        messageID: props.messageID,
        sessionID: props.sessionID,
        ...props.info,
      };
      let newParts: OpenCodeMessagePart[];
      if (partIdx >= 0) {
        newParts = [...msg.parts];
        newParts[partIdx] = { ...newParts[partIdx], ...partData };
      } else {
        newParts = [...msg.parts, partData];
      }
      const contentText = newParts
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join('');
      return { ...msg, parts: newParts, contentText };
    });
    this.updateState({ messages });
  }

  private handleMessagePartDelta(properties: Record<string, unknown>): void {
    const props = properties as unknown as {
      sessionID: string;
      messageID: string;
      partID: string;
      field: string;
      delta: string;
    };
    if (!props?.sessionID || !props?.messageID || !props?.partID) return;
    if (this.state.selectedSessionID !== props.sessionID) return;
    if (props.field !== 'text') return;

    const messages = this.state.messages.map((msg) => {
      if (msg.id !== props.messageID) return msg;
      const partIdx = msg.parts.findIndex((p) => p.id === props.partID);
      let newParts: OpenCodeMessagePart[];
      if (partIdx >= 0) {
        newParts = [...msg.parts];
        const existingPart = newParts[partIdx];
        newParts[partIdx] = {
          ...existingPart,
          text: (existingPart.text || '') + props.delta,
        };
      } else {
        newParts = [
          ...msg.parts,
          {
            id: props.partID,
            type: 'text',
            messageID: props.messageID,
            sessionID: props.sessionID,
            text: props.delta,
          },
        ];
      }
      const contentText = newParts
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join('');
      return { ...msg, parts: newParts, contentText };
    });
    this.updateState({ messages });
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
