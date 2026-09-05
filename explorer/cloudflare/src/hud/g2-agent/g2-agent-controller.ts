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
import { EvenAppBridge, AudioInputSource } from '@evenrealities/even_hub_sdk';

export type G2AgentStateListener = (state: G2AgentState) => void;

const MAX_RECORDING_MS = 60_000;

function sortSessionsByUpdated(sessions: OpenCodeSessionInfo[]): OpenCodeSessionInfo[] {
  return [...sessions].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
}

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
  private sessionModelMap: Map<string, OpenCodeProviderModel> = new Map();

  // Voice input state
  private bridge: EvenAppBridge | null = null;
  private pcmChunks: Uint8Array[] = [];
  private audioUnsubscribe: (() => void) | null = null;
  private recordingTimer: ReturnType<typeof setTimeout> | null = null;
  private currentRequestId: number = 0;
  private abortController: AbortController | null = null;

  constructor(store?: AgentStateStore) {
    this.store = store || new AgentStateStore();
    this.state.processingSessionIDs = this.store.getProcessingIDs();
  }

  // ── Lifecycle ────────────────────────────────────────────────

  initialize(client: OpenCodeClient): void {
    this.client = client;
  }

  setBridge(bridge: EvenAppBridge): void {
    this.bridge = bridge;
  }

  dispose(): void {
    this.cancelVoiceInput();
    this.client = null;
    this.bridge = null;
    this.listeners.clear();
    this.sessionModelMap.clear();
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

      const activeIDs = new Set(sorted.map((s) => s.id));
      this.store.pruneLastChecked(activeIDs);

      this.rebuildUnread(sorted);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      this.updateState({ error: msg });
    }
  }

  async selectSession(sessionID: string): Promise<void> {
    if (!this.client) return;

    this.store.setLastChecked(sessionID, Date.now());

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
      this.sessionModelMap.set(session.id, model);
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

    this.store.markProcessing(sessionID);

    try {
      await this.client.sendMessage(sessionID, formattedMessage);
      const apiMessages = await this.client.getMessages(sessionID);
      const messages = mapApiMessagesToWithParts(apiMessages, sessionID);
      this.updateState({ messages });
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
      const [providers, config] = await Promise.all([
        this.client.getProviders(),
        this.client.getConfig(),
      ]);

      const allowedLmStudioModelIds = new Set<string>();
      const configProviders = (config?.provider ?? {}) as Record<string, { models?: Record<string, unknown> }>;
      const lmstudioConfig = configProviders?.lmstudio;
      if (lmstudioConfig?.models) {
        for (const modelId of Object.keys(lmstudioConfig.models)) {
          allowedLmStudioModelIds.add(modelId);
        }
      }

      const models = this.client.extractFreeModels(providers, allowedLmStudioModelIds);
      models.sort((a, b) => {
        const aLocal = a.providerID === 'lmstudio' ? 0 : 1;
        const bLocal = b.providerID === 'lmstudio' ? 0 : 1;
        return aLocal - bLocal;
      });
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

  getModelForSession(sessionID: string): OpenCodeProviderModel | undefined {
    return this.sessionModelMap.get(sessionID);
  }

  async getModelDisplayName(sessionID: string): Promise<string> {
    const mapped = this.sessionModelMap.get(sessionID);
    if (mapped) return mapped.name;

    const session = this.state.sessions.find((s) => s.id === sessionID);
    const providerID = session?.model?.providerID;
    const modelID = session?.model?.id;
    if (providerID && modelID) {
      let models = this.state.models;
      if (models.length === 0) {
        models = await this.loadModels();
      }
      const found = models.find(
        (m) => m.providerID === providerID && m.modelID === modelID,
      );
      if (found) return found.name;
      return `${providerID}/${modelID}`;
    }

    return "Agent";
  }

  // ── Unread / Checked ─────────────────────────────────────────

  markSessionChecked(sessionID: string): void {
    this.store.setLastChecked(sessionID, Date.now());
    const newUnread = this.state.unreadSessionIDs.filter((id) => id !== sessionID);
    if (newUnread.length !== this.state.unreadSessionIDs.length) {
      this.updateState({ unreadSessionIDs: newUnread });
    }
  }

  // ── Voice Input ──────────────────────────────────────────────

  setVoiceState(voiceState: G2AgentState['voiceState']): void {
    this.updateState({ voiceState });
  }

  setTranscript(transcript: string): void {
    this.updateState({ transcript });
  }

  async startVoiceInput(): Promise<void> {
    if (!this.bridge) {
      this.updateState({ error: 'Voice input not available' });
      return;
    }

    if (this.state.voiceState !== 'idle') {
      return;
    }

    this.updateState({
      voiceState: 'ready',
      transcript: '',
    });

    this.pcmChunks = [];

    try {
      const result = await this.bridge.audioControl(true, AudioInputSource.Glasses);
      if (!result) {
        this.updateState({ voiceState: 'idle', error: 'Failed to open microphone' });
        return;
      }

      this.audioUnsubscribe = this.bridge.onEvenHubEvent((event) => {
        if (event.audioEvent && this.state.voiceState === 'ready') {
          this.pcmChunks.push(event.audioEvent.audioPcm);
        }
      });

      this.recordingTimer = setTimeout(() => {
        if (this.state.voiceState === 'ready') {
          this.stopVoiceInput();
        }
      }, MAX_RECORDING_MS);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start recording';
      this.updateState({ voiceState: 'idle', error: msg });
    }
  }

  async stopVoiceInput(): Promise<void> {
    if (this.state.voiceState !== 'ready') {
      return;
    }

    this.stopMic();

    if (this.pcmChunks.length === 0) {
      this.updateState({ voiceState: 'idle', error: 'No audio data captured' });
      return;
    }

    this.updateState({ voiceState: 'transcribing' });

    const totalLength = this.pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedPcm = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      combinedPcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.pcmChunks = [];

    const wavBlob = this.pcmToWav(combinedPcm);

    const requestId = this.currentRequestId;
    await this.sendTranscribeRequest(wavBlob, requestId);
  }

  cancelVoiceInput(): void {
    this.stopMic();

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.currentRequestId++;
    this.pcmChunks = [];

    this.updateState({
      voiceState: 'idle',
      transcript: '',
    });
  }

  private stopMic(): void {
    if (this.audioUnsubscribe) {
      this.audioUnsubscribe();
      this.audioUnsubscribe = null;
    }

    this.clearRecordingTimer();

    if (this.bridge) {
      this.bridge.audioControl(false).catch(() => {});
    }
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  private pcmToWav(pcmData: Uint8Array): Blob {
    const numChannels = 1;
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.length;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt subchunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data subchunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // PCM data
    const wavBytes = new Uint8Array(buffer);
    wavBytes.set(pcmData, 44);

    return new Blob([wavBytes], { type: 'audio/wav' });
  }

  private async sendTranscribeRequest(wavBlob: Blob, requestId: number): Promise<void> {
    if (!this.client) {
      this.updateState({ voiceState: 'idle', error: 'Gateway not connected' });
      return;
    }

    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      const arrayBuffer = await wavBlob.arrayBuffer();
      const gatewayUrl = this.client.getGatewayUrl();
      const gatewayToken = this.client.getGatewayToken();

      const res = await fetch(`${gatewayUrl}/api/speech/transcribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gatewayToken}`,
          'Content-Type': 'audio/wav',
        },
        body: arrayBuffer,
        signal: abortController.signal,
      });

      const json = await res.json();

      if (requestId !== this.currentRequestId) return;

      if (!res.ok) {
        const msg = json?.error?.message || `Gateway returned HTTP ${res.status}`;
        this.updateState({ voiceState: 'idle', error: msg });
        return;
      }

      if (typeof json.text !== 'string' || !json.text.trim()) {
        this.updateState({ voiceState: 'idle', error: 'No speech detected' });
        return;
      }

      this.updateState({
        voiceState: 'confirmation',
        transcript: json.text,
      });
    } catch (e: unknown) {
      if (requestId !== this.currentRequestId) return;

      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }

      const msg = e instanceof Error ? e.message : 'Failed to connect to Gateway';
      this.updateState({ voiceState: 'idle', error: msg });
    } finally {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    }
  }

  // ── Processing Management ────────────────────────────────────

  private checkAndClearProcessing(sessionID: string, messages: OpenCodeMessageWithParts[]): void {
    if (!this.state.processingSessionIDs.includes(sessionID)) return;

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') {
        if (msg.finish === 'stop') {
          this.clearProcessingForSession(sessionID);
        }
        break;
      }
    }
  }

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

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
