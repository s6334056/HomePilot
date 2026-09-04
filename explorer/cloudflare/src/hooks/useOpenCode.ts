import { useState, useCallback, useRef } from 'react';
import {
  OpenCodeSessionInfo,
  OpenCodeMessageInfo,
  OpenCodeMessagePart,
  OpenCodePermissionRequest,
  OpenCodeQuestionRequest,
  AgentSettings,
  AgentContext,
} from '../domain/types';
import { OpenCodeClient } from '../services/OpenCodeClient';
import { formatMessageWithContext } from '../services/AgentContextFormatter';

const SETTINGS_STORAGE_KEY = 'homepilot-agent-settings';
const LAST_CHECKED_STORAGE_KEY = 'homepilot-session-lastChecked';
const PROCESSING_STORAGE_KEY = 'homepilot-processing-sessions';
const PROCESSING_TTL_MS = 24 * 60 * 60 * 1000;

function loadLastCheckedAt(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_CHECKED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const result: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'number') result[k] = v;
        }
        return result;
      }
    }
  } catch {
    // ignore
  }
  return {};
}

function saveLastCheckedAt(map: Record<string, number>): void {
  try {
    localStorage.setItem(LAST_CHECKED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

interface ProcessingEntry {
  startedAt: number;
}

function loadProcessingSessions(): Record<string, ProcessingEntry> {
  try {
    const raw = localStorage.getItem(PROCESSING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const now = Date.now();
        const result: Record<string, ProcessingEntry> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const entry = v as ProcessingEntry;
          if (entry && typeof entry.startedAt === 'number' && (now - entry.startedAt) < PROCESSING_TTL_MS) {
            result[k] = entry;
          }
        }
        return result;
      }
    }
  } catch {
    // ignore
  }
  return {};
}

function saveProcessingSessions(map: Record<string, ProcessingEntry>): void {
  try {
    localStorage.setItem(PROCESSING_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function loadSettings(): AgentSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return { selectedProjectID: 'global', selectedProviderID: 'opencode', selectedModelID: 'mimo-v2.5-free' };
}

export interface OpenCodeMessageWithParts extends OpenCodeMessageInfo {
  parts: OpenCodeMessagePart[];
  contentText: string;
}

export interface OpenCodeState {
  sessions: OpenCodeSessionInfo[];
  archivedSessions: OpenCodeSessionInfo[];
  selectedSessionID: string | null;
  selectedSession: OpenCodeSessionInfo | null;
  messages: OpenCodeMessageWithParts[];
  pendingPermissions: OpenCodePermissionRequest[];
  pendingQuestions: OpenCodeQuestionRequest[];
  isLoadingSessions: boolean;
  isLoadingArchivedSessions: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  error: string | null;
  unreadSessionIds: string[];
  processingSessionIds: string[];
}

export interface OpenCodeActions {
  connect: (gatewayUrl: string, gatewayToken: string) => void;
  disconnect: () => void;
  refreshSessions: () => Promise<void>;
  refreshAllSessions: () => Promise<void>;
  refreshArchivedSessions: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  selectSession: (sessionID: string) => Promise<void>;
  clearSelection: () => void;
  createSession: (options?: { title?: string; model?: { providerID: string; modelID: string } }) => Promise<string | null>;
  getClient: () => OpenCodeClient | null;
  sendMessage: (content: string, context?: AgentContext | null) => Promise<void>;
  respondPermission: (permissionID: string, response: 'grant' | 'deny' | 'always') => Promise<void>;
  respondQuestion: (questionID: string, answer: string | string[]) => Promise<void>;
  archiveSession: (sessionID: string) => Promise<boolean>;
  restoreSession: (sessionID: string) => Promise<boolean>;
  deleteSession: (sessionID: string) => Promise<boolean>;
  syncSessionStates: (sessions: OpenCodeSessionInfo[]) => Promise<void>;
  refreshPendingPermissions: () => Promise<void>;
  refreshPendingQuestions: () => Promise<void>;
}

export function useOpenCode(): [OpenCodeState, OpenCodeActions] {
  const processingData = loadProcessingSessions();
  const [state, setState] = useState<OpenCodeState>({
    sessions: [],
    archivedSessions: [],
    selectedSessionID: null,
    selectedSession: null,
    messages: [],
    pendingPermissions: [],
    pendingQuestions: [],
    isLoadingSessions: false,
    isLoadingArchivedSessions: false,
    isLoadingMessages: false,
    isSending: false,
    error: null,
    unreadSessionIds: [],
    processingSessionIds: Object.keys(processingData),
  });

  const clientRef = useRef<OpenCodeClient | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastCheckedAtRef = useRef<Record<string, number>>(loadLastCheckedAt());
  const processingDataRef = useRef<Record<string, ProcessingEntry>>(processingData);

  const getClient = useCallback((gatewayUrl: string, gatewayToken: string): OpenCodeClient => {
    if (!clientRef.current || clientRef.current.getGatewayUrl() !== gatewayUrl) {
      clientRef.current = new OpenCodeClient({ gatewayUrl, gatewayToken });
    }
    return clientRef.current;
  }, []);

  const refreshSessions = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    setState((prev) => ({ ...prev, isLoadingSessions: true, error: null }));
    try {
      const sessions = await client.getSessions();
      setState((prev) => ({ ...prev, sessions, isLoadingSessions: false }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      setState((prev) => ({ ...prev, isLoadingSessions: false, error: msg }));
    }
  }, []);

  const refreshArchivedSessions = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    setState((prev) => ({ ...prev, isLoadingArchivedSessions: true, error: null }));
    try {
      const archivedSessions = await client.getArchivedSessions();
      setState((prev) => ({ ...prev, archivedSessions, isLoadingArchivedSessions: false }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load archived sessions';
      setState((prev) => ({ ...prev, isLoadingArchivedSessions: false, error: msg }));
    }
  }, []);

  const refreshAllSessions = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    setState((prev) => ({ ...prev, isLoadingSessions: true, isLoadingArchivedSessions: true, error: null }));
    try {
      const all = await client.getAllSessions();
      const sessions = all.filter((s) => !OpenCodeClient.isSessionArchived(s));
      const archivedSessions = all.filter((s) => OpenCodeClient.isSessionArchived(s));
      setState((prev) => ({
        ...prev,
        sessions,
        archivedSessions,
        isLoadingSessions: false,
        isLoadingArchivedSessions: false,
      }));
      // Rebuild unread state from REST API after sessions are loaded
      // Only sync sessions updated within last 24 hours
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentSessions = sessions.filter((s) => (s.time?.updated ?? 0) >= twentyFourHoursAgo);
      syncSessionStates(recentSessions);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load sessions';
      setState((prev) => ({
        ...prev,
        isLoadingSessions: false,
        isLoadingArchivedSessions: false,
        error: msg,
      }));
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    const client = clientRef.current;
    const sessionID = stateRef.current.selectedSessionID;
    if (!client || !sessionID) return;
    setState((prev) => ({ ...prev, isLoadingMessages: true, error: null }));
    try {
      const apiMessages = await client.getMessages(sessionID);
      const msgWithParts: OpenCodeMessageWithParts[] = apiMessages.map((m) => {
        const parts: OpenCodeMessagePart[] = m.parts.map((p) => ({
          id: p.id,
          type: p.type,
          messageID: p.messageID || m.info.id,
          sessionID: p.sessionID || sessionID,
          text: p.text,
          tool: p.tool,
          callID: p.callID,
          state: p.state,
          time: p.time,
        }));
        const contentText = parts
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text)
          .join('');
        return {
          ...m.info,
          parts,
          contentText,
        };
      });
      setState((prev) => ({
        ...prev,
        messages: msgWithParts,
        isLoadingMessages: false,
        isSending: false,
      }));
      // Also check for any new pending permissions/questions while we're at it
      try {
        const pendingPermissions = await client.getPendingPermissions();
        setState((prev) => ({ ...prev, pendingPermissions }));
      } catch { /* non-critical */ }
      try {
        const pendingQuestions = await client.getPendingQuestions();
        setState((prev) => ({ ...prev, pendingQuestions }));
      } catch { /* non-critical */ }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load messages';
      setState((prev) => ({ ...prev, isLoadingMessages: false, isSending: false, error: msg }));
    }
  }, []);

  const selectSession = useCallback(async (sessionID: string) => {
    const client = clientRef.current;
    if (!client) return;
    // Mark session as checked
    lastCheckedAtRef.current[sessionID] = Date.now();
    saveLastCheckedAt(lastCheckedAtRef.current);
    // Remove from unread list immediately
    setState((prev) => ({
      ...prev,
      selectedSessionID: sessionID,
      selectedSession: prev.sessions.find((s) => s.id === sessionID) || prev.archivedSessions.find((s) => s.id === sessionID) || null,
      messages: [],
      isLoadingMessages: true,
      error: null,
      unreadSessionIds: prev.unreadSessionIds.filter((id) => id !== sessionID),
    }));
    try {
      const apiMessages = await client.getMessages(sessionID);
      const msgWithParts: OpenCodeMessageWithParts[] = apiMessages.map((m) => {
        const parts: OpenCodeMessagePart[] = m.parts.map((p) => ({
          id: p.id,
          type: p.type,
          messageID: p.messageID || m.info.id,
          sessionID: p.sessionID || sessionID,
          text: p.text,
          tool: p.tool,
          callID: p.callID,
          state: p.state,
          time: p.time,
        }));
        const contentText = parts
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text)
          .join('');
        return {
          ...m.info,
          parts,
          contentText,
        };
      });
      setState((prev) => ({
        ...prev,
        messages: msgWithParts,
        isLoadingMessages: false,
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load messages';
      setState((prev) => ({ ...prev, isLoadingMessages: false, error: msg }));
    }
  }, []);

  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedSessionID: null,
      selectedSession: null,
      messages: [],
      isLoadingMessages: false,
    }));
  }, []);

  const createSession = useCallback(async (options?: { title?: string; model?: { providerID: string; modelID: string } }): Promise<string | null> => {
    const client = clientRef.current;
    if (!client) return null;
    try {
      const settings = loadSettings();
      const session = await client.createSession({
        title: options?.title,
        projectID: settings.selectedProjectID,
        model: options?.model
          ? { id: options.model.modelID, providerID: options.model.providerID }
          : undefined,
      });
      setState((prev) => ({
        ...prev,
        sessions: [session, ...prev.sessions],
      }));
      return session.id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create session';
      setState((prev) => ({ ...prev, error: msg }));
      return null;
    }
  }, []);

  const sendMessage = useCallback(async (content: string, context?: AgentContext | null) => {
    const client = clientRef.current;
    const sessionID = stateRef.current.selectedSessionID;
    if (!client || !sessionID) return;

    const formattedMessage = formatMessageWithContext(context, content);

    // Optimistically add user message and processing placeholder
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

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage, processingMessage],
      isSending: true,
      processingSessionIds: prev.processingSessionIds.includes(sessionID)
        ? prev.processingSessionIds
        : [...prev.processingSessionIds, sessionID],
      error: null,
    }));

    // Save to localStorage
    const now = Date.now();
    processingDataRef.current[sessionID] = { startedAt: now };
    saveProcessingSessions(processingDataRef.current);

    try {
      await client.sendMessage(sessionID, formattedMessage);
      // POST success: fetch official message state via GET (single fetch, no polling)
      const apiMessages = await client.getMessages(sessionID);
      const msgWithParts: OpenCodeMessageWithParts[] = apiMessages.map((m) => {
        const parts: OpenCodeMessagePart[] = m.parts.map((p) => ({
          id: p.id,
          type: p.type,
          messageID: p.messageID || m.info.id,
          sessionID: p.sessionID || sessionID,
          text: p.text,
          tool: p.tool,
          callID: p.callID,
          state: p.state,
          time: p.time,
        }));
        const contentText = parts
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text)
          .join('');
        return { ...m.info, parts, contentText };
      });
      setState((prev) => ({
        ...prev,
        messages: msgWithParts,
        isSending: false,
      }));
      // Check if the latest assistant message has finish === "stop" to clear processing
      for (let i = msgWithParts.length - 1; i >= 0; i--) {
        if (msgWithParts[i].role === 'assistant') {
          if (msgWithParts[i].finish === 'stop') {
            delete processingDataRef.current[sessionID];
            saveProcessingSessions(processingDataRef.current);
            setState((prev) => ({
              ...prev,
              processingSessionIds: prev.processingSessionIds.filter((id) => id !== sessionID),
            }));
          }
          break;
        }
      }
      // Also check for any new pending permissions/questions
      try {
        const pp = await client.getPendingPermissions();
        setState((prev) => ({ ...prev, pendingPermissions: pp }));
      } catch { /* non-critical */ }
      try {
        const pq = await client.getPendingQuestions();
        setState((prev) => ({ ...prev, pendingQuestions: pq }));
      } catch { /* non-critical */ }
    } catch (e: unknown) {
      // On error: remove the processing placeholder and optimistic user message
      const msg = e instanceof Error ? e.message : 'Failed to send message';
      // Remove from processing on error
      delete processingDataRef.current[sessionID];
      saveProcessingSessions(processingDataRef.current);
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter(
          (m) => m.id !== tempUserMsgId && m.id !== tempAssistantMsgId
        ),
        isSending: false,
        processingSessionIds: prev.processingSessionIds.filter((id) => id !== sessionID),
        error: msg,
      }));
    }
  }, []);

  const respondPermission = useCallback(async (
    permissionID: string,
    response: 'grant' | 'deny' | 'always'
  ) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.respondPermission(permissionID, response);
      setState((prev) => ({
        ...prev,
        pendingPermissions: prev.pendingPermissions.filter((p) => p.id !== permissionID),
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to respond to permission';
      setState((prev) => ({ ...prev, error: msg }));
    }
  }, []);

  const respondQuestion = useCallback(async (
    questionID: string,
    answer: string | string[]
  ) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.respondQuestion(questionID, answer);
      setState((prev) => ({
        ...prev,
        pendingQuestions: prev.pendingQuestions.filter((q) => q.id !== questionID),
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to respond to question';
      setState((prev) => ({ ...prev, error: msg }));
    }
  }, []);

  const archiveSession = useCallback(async (sessionID: string): Promise<boolean> => {
    const client = clientRef.current;
    if (!client) return false;
    try {
      await client.archiveSession(sessionID);
      const currentSelectedID = stateRef.current.selectedSessionID;
      if (currentSelectedID === sessionID) {
        setState((prev) => ({
          ...prev,
          selectedSessionID: null,
          selectedSession: null,
          messages: [],
        }));
      }
      await refreshAllSessions();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to archive session';
      setState((prev) => ({ ...prev, error: msg }));
      return false;
    }
  }, [refreshAllSessions]);

  const restoreSession = useCallback(async (sessionID: string): Promise<boolean> => {
    const client = clientRef.current;
    if (!client) return false;
    try {
      await client.restoreSession(sessionID);
      await refreshAllSessions();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to restore session';
      setState((prev) => ({ ...prev, error: msg }));
      return false;
    }
  }, [refreshAllSessions]);

  const deleteSession = useCallback(async (sessionID: string): Promise<boolean> => {
    const client = clientRef.current;
    if (!client) return false;
    try {
      await client.deleteSession(sessionID);
      const currentSelectedID = stateRef.current.selectedSessionID;
      if (currentSelectedID === sessionID) {
        setState((prev) => ({
          ...prev,
          selectedSessionID: null,
          selectedSession: null,
          messages: [],
        }));
      }
      // Clean up lastCheckedAt entry
      delete lastCheckedAtRef.current[sessionID];
      saveLastCheckedAt(lastCheckedAtRef.current);
      await refreshAllSessions();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete session';
      setState((prev) => ({ ...prev, error: msg }));
      return false;
    }
  }, [refreshAllSessions]);

  const syncSessionStates = useCallback(async (sessions: OpenCodeSessionInfo[]) => {
    const client = clientRef.current;
    if (!client) return;

    const now = Date.now();
    const lastChecked = lastCheckedAtRef.current;
    const newUnreadIds: string[] = [];

    // Filter out archived sessions - no need to track status for archived sessions
    const activeSessions = sessions.filter((s) => !OpenCodeClient.isSessionArchived(s));

    // Initialize lastCheckedAt for sessions not yet tracked
    for (const s of activeSessions) {
      if (!(s.id in lastChecked)) {
        lastChecked[s.id] = now;
      }
    }

    // Clean up entries for sessions that no longer exist
    const sessionIds = new Set(activeSessions.map((s) => s.id));
    for (const id of Object.keys(lastChecked)) {
      if (!sessionIds.has(id)) {
        delete lastChecked[id];
      }
    }

    // Sessions that completed via REST API - remove from processing
    const completedSessionIds: string[] = [];

    // Check each session's latest assistant message via REST API (batched parallel)
    const BATCH_SIZE = 5;
    for (let i = 0; i < activeSessions.length; i += BATCH_SIZE) {
      const batch = activeSessions.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((s) => client.getMessages(s.id))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const s = batch[j];
        if (result.status !== 'fulfilled') continue;

        const apiMessages = result.value;
        if (apiMessages.length === 0) continue;

        // Find the latest assistant message
        let latestAssistantTime: number | undefined;
        let latestFinish: string | undefined;
        for (let k = apiMessages.length - 1; k >= 0; k--) {
          const msg = apiMessages[k];
          if (msg.info.role === 'assistant') {
            latestAssistantTime = msg.info.time?.completed ?? msg.info.time?.created;
            latestFinish = msg.info.finish;
            break;
          }
        }

        if (latestAssistantTime === undefined) continue;

        // If finish === "stop", this session completed - remove from processing
        if (latestFinish === 'stop' && stateRef.current.processingSessionIds.includes(s.id)) {
          completedSessionIds.push(s.id);
          delete processingDataRef.current[s.id];
        }

        // Unread if: latest result was created after user last checked
        if (latestAssistantTime > (lastChecked[s.id] ?? 0) && latestFinish === 'stop') {
          newUnreadIds.push(s.id);
        }
      }
    }

    // Persist processing changes
    if (completedSessionIds.length > 0) {
      saveProcessingSessions(processingDataRef.current);
    }

    saveLastCheckedAt(lastChecked);

    setState((prev) => {
      const sortedUnread = [...newUnreadIds].sort();
      const prevSortedUnread = [...prev.unreadSessionIds].sort();
      
      const unreadChanged = sortedUnread.length !== prevSortedUnread.length || 
        sortedUnread.some((id, i) => id !== prevSortedUnread[i]);
      
      // Remove completed sessions from processing
      const newProcessing = completedSessionIds.length > 0
        ? prev.processingSessionIds.filter((id) => !completedSessionIds.includes(id))
        : prev.processingSessionIds;
      const processingChanged = newProcessing.length !== prev.processingSessionIds.length;
      
      if (!unreadChanged && !processingChanged) {
        return prev;
      }
      return { 
        ...prev, 
        unreadSessionIds: unreadChanged ? newUnreadIds : prev.unreadSessionIds,
        processingSessionIds: processingChanged ? newProcessing : prev.processingSessionIds,
      };
    });
  }, []);

  const refreshPendingPermissions = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const pendingPermissions = await client.getPendingPermissions();
      setState((prev) => ({ ...prev, pendingPermissions }));
    } catch {
      // Silently ignore - pending permissions are non-critical
    }
  }, []);

  const refreshPendingQuestions = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const pendingQuestions = await client.getPendingQuestions();
      setState((prev) => ({ ...prev, pendingQuestions }));
    } catch {
      // Silently ignore - pending questions are non-critical
    }
  }, []);

  const connect = useCallback((gatewayUrl: string, gatewayToken: string) => {
    const client = getClient(gatewayUrl, gatewayToken);
    clientRef.current = client;
  }, [getClient]);

  const disconnect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      sessions: [],
      archivedSessions: [],
      selectedSessionID: null,
      selectedSession: null,
      messages: [],
      pendingPermissions: [],
      pendingQuestions: [],
      processingSessionIds: [],
    }));
  }, []);

  const actions: OpenCodeActions = {
    connect,
    disconnect,
    refreshSessions,
    refreshAllSessions,
    refreshArchivedSessions,
    refreshMessages,
    selectSession,
    clearSelection,
    createSession,
    sendMessage,
    respondPermission,
    respondQuestion,
    archiveSession,
    restoreSession,
    deleteSession,
    syncSessionStates,
    refreshPendingPermissions,
    refreshPendingQuestions,
    getClient: () => clientRef.current,
  };

  return [state, actions];
}
