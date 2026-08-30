import { useState, useCallback, useRef, useEffect } from 'react';
import {
  OpenCodeConnectionStatus,
  OpenCodeSessionInfo,
  OpenCodeSessionStatus,
  OpenCodeMessageInfo,
  OpenCodeMessagePart,
  OpenCodePermissionRequest,
  OpenCodeQuestionRequest,
  OpenCodeSSEEvent,
  AgentSettings,
  AgentContext,
} from '../domain/types';
import { OpenCodeClient } from '../services/OpenCodeClient';
import { OpenCodeEventService } from '../services/OpenCodeEventService';
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
  connectionStatus: OpenCodeConnectionStatus;
  sessions: OpenCodeSessionInfo[];
  archivedSessions: OpenCodeSessionInfo[];
  selectedSessionID: string | null;
  selectedSession: OpenCodeSessionInfo | null;
  messages: OpenCodeMessageWithParts[];
  sessionStatus: OpenCodeSessionStatus | null;
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
}

export function useOpenCode(): [OpenCodeState, OpenCodeActions] {
  const processingData = loadProcessingSessions();
  const [state, setState] = useState<OpenCodeState>({
    connectionStatus: 'disconnected',
    sessions: [],
    archivedSessions: [],
    selectedSessionID: null,
    selectedSession: null,
    messages: [],
    sessionStatus: null,
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
  const eventServiceRef = useRef<OpenCodeEventService | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sendingStatusRef = useRef<string | null>(null);
  const lastCheckedAtRef = useRef<Record<string, number>>(loadLastCheckedAt());
  const processingDataRef = useRef<Record<string, ProcessingEntry>>(processingData);

  const getClient = useCallback((gatewayUrl: string, gatewayToken: string): OpenCodeClient => {
    if (!clientRef.current || clientRef.current.getGatewayUrl() !== gatewayUrl) {
      clientRef.current = new OpenCodeClient({ gatewayUrl, gatewayToken });
    }
    return clientRef.current;
  }, []);

  const processEvent = useCallback((event: OpenCodeSSEEvent) => {
    const payload = event.payload;
    if (!payload) return;

    const isSyncEvent = !!payload.syncEvent;
    const eventType = isSyncEvent ? payload.syncEvent!.type : payload.type;
    const properties = isSyncEvent
      ? payload.syncEvent!.data
      : (payload.properties || {}) as Record<string, unknown>;

    setState((prev) => {
      switch (eventType) {
        case 'session.created': {
          const props = properties as unknown as { sessionID: string; info: OpenCodeSessionInfo };
          if (!props?.sessionID) return prev;
          const newSession = props.info || { id: props.sessionID };
          const isArchived = OpenCodeClient.isSessionArchived(newSession);
          if (isArchived) {
            const exists = prev.archivedSessions.some((s) => s.id === props.sessionID);
            if (exists) return prev;
            return {
              ...prev,
              archivedSessions: [newSession, ...prev.archivedSessions],
            };
          } else {
            const exists = prev.sessions.some((s) => s.id === props.sessionID);
            if (exists) return prev;
            return {
              ...prev,
              sessions: [newSession, ...prev.sessions],
            };
          }
        }

        case 'session.updated': {
          const props = properties as unknown as { sessionID: string; info: Partial<OpenCodeSessionInfo> };
          if (!props?.sessionID) return prev;
          const mergedInfo = props.info;
          const wasActive = prev.sessions.some((s) => s.id === props.sessionID);
          const wasArchived = prev.archivedSessions.some((s) => s.id === props.sessionID);
          const updatedSession = wasActive
            ? prev.sessions.find((s) => s.id === props.sessionID)
            : wasArchived
              ? prev.archivedSessions.find((s) => s.id === props.sessionID)
              : null;
          const merged = updatedSession ? { ...updatedSession, ...mergedInfo } : mergedInfo as OpenCodeSessionInfo;
          const nowArchived = OpenCodeClient.isSessionArchived(merged);
          if (wasActive && nowArchived) {
            return {
              ...prev,
              sessions: prev.sessions.filter((s) => s.id !== props.sessionID),
              archivedSessions: [merged, ...prev.archivedSessions],
              selectedSession:
                prev.selectedSession?.id === props.sessionID
                  ? { ...prev.selectedSession, ...mergedInfo }
                  : prev.selectedSession,
            };
          }
          if (wasArchived && !nowArchived) {
            return {
              ...prev,
              archivedSessions: prev.archivedSessions.filter((s) => s.id !== props.sessionID),
              sessions: [merged, ...prev.sessions],
              selectedSession:
                prev.selectedSession?.id === props.sessionID
                  ? { ...prev.selectedSession, ...mergedInfo }
                  : prev.selectedSession,
            };
          }
          return {
            ...prev,
            sessions: prev.sessions.map((s) =>
              s.id === props.sessionID ? { ...s, ...mergedInfo } : s
            ),
            archivedSessions: prev.archivedSessions.map((s) =>
              s.id === props.sessionID ? { ...s, ...mergedInfo } : s
            ),
            selectedSession:
              prev.selectedSession?.id === props.sessionID
                ? { ...prev.selectedSession, ...mergedInfo }
                : prev.selectedSession,
          };
        }

        case 'session.status': {
          const props = properties as unknown as { sessionID: string; status: OpenCodeSessionStatus };
          if (!props?.sessionID) return prev;

          const newType = props.status?.type ?? '';

          // isSending: only relevant for the currently selected session
          let isSendingUpdate = prev.isSending;
          if (prev.isSending && props.sessionID === prev.selectedSessionID) {
            if (sendingStatusRef.current === null) {
              sendingStatusRef.current = newType;
            } else if (newType !== sendingStatusRef.current) {
              isSendingUpdate = false;
              sendingStatusRef.current = null;
            }
          }

          // Only update sessionStatus for the selected session
          const sessionStatusUpdate =
            props.sessionID === prev.selectedSessionID ? props.status : prev.sessionStatus;

          // Remove from processing on status change
          let processingUpdate = prev.processingSessionIds;
          if (prev.processingSessionIds.includes(props.sessionID) && newType !== '' && newType !== 'idle') {
            processingUpdate = prev.processingSessionIds.filter((id) => id !== props.sessionID);
            delete processingDataRef.current[props.sessionID];
            saveProcessingSessions(processingDataRef.current);
          }

          return {
            ...prev,
            sessionStatus: sessionStatusUpdate,
            isSending: isSendingUpdate,
            processingSessionIds: processingUpdate,
          };
        }

        case 'message.updated': {
          const props = properties as unknown as {
            sessionID: string;
            messageID: string;
            info: Partial<OpenCodeMessageInfo>;
          };
          if (!props?.sessionID || !props?.messageID) return prev;

          // Only update messages for the currently selected session
          if (prev.selectedSessionID !== props.sessionID) return prev;

          // Remove optimistic messages when real ones arrive
          let filteredMessages = prev.messages;
          if (props.info?.role === 'user') {
            // Remove optimistic user messages
            filteredMessages = filteredMessages.filter(
              (m) => !(m.id.startsWith('temp-user-') && m.sessionID === props.sessionID)
            );
          } else if (props.info?.role === 'assistant') {
            // Remove optimistic assistant messages (processing placeholders)
            filteredMessages = filteredMessages.filter(
              (m) => !(m.id.startsWith('temp-assistant-') && m.sessionID === props.sessionID)
            );
          }

          const existingIdx = filteredMessages.findIndex((m) => m.id === props.messageID);
          if (existingIdx >= 0) {
            const updated = [...filteredMessages];
            updated[existingIdx] = {
              ...updated[existingIdx],
              ...props.info,
            };
            return { ...prev, messages: updated };
          }

          const newMsg: OpenCodeMessageWithParts = {
            id: props.messageID,
            role: props.info?.role || 'assistant',
            sessionID: props.sessionID,
            ...props.info,
            parts: [],
            contentText: '',
          };
          return { ...prev, messages: [...filteredMessages, newMsg] };
        }

        case 'message.part.updated': {
          const props = properties as unknown as {
            sessionID: string;
            messageID: string;
            partID: string;
            info: Partial<OpenCodeMessagePart>;
          };
          if (!props?.sessionID || !props?.messageID || !props?.partID) return prev;
          if (prev.selectedSessionID !== props.sessionID) return prev;

          return {
            ...prev,
            messages: prev.messages.map((msg) => {
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
            }),
          };
        }

        case 'message.part.delta': {
          const props = properties as unknown as {
            sessionID: string;
            messageID: string;
            partID: string;
            field: string;
            delta: string;
          };
          if (!props?.sessionID || !props?.messageID || !props?.partID) return prev;
          if (prev.selectedSessionID !== props.sessionID) return prev;
          if (props.field !== 'text') return prev;

          return {
            ...prev,
            messages: prev.messages.map((msg) => {
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
            }),
          };
        }

        case 'permission.asked': {
          const props = properties as unknown as OpenCodePermissionRequest;
          if (!props?.id) return prev;
          const exists = prev.pendingPermissions.some((p) => p.id === props.id);
          if (exists) return prev;

          return {
            ...prev,
            pendingPermissions: [...prev.pendingPermissions, props],
          };
        }

        case 'question.asked': {
          const props = properties as unknown as OpenCodeQuestionRequest;
          if (!props?.id) return prev;
          const exists = prev.pendingQuestions.some((q) => q.id === props.id);
          if (exists) return prev;

          return {
            ...prev,
            pendingQuestions: [...prev.pendingQuestions, props],
          };
        }

        default:
          return prev;
      }
    });
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
      sendingStatusRef.current = null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load messages';
      setState((prev) => ({ ...prev, isLoadingMessages: false, isSending: false, error: msg }));
      sendingStatusRef.current = null;
    }
  }, []);

  const selectSession = useCallback(async (sessionID: string) => {
    const client = clientRef.current;
    if (!client) return;
    sendingStatusRef.current = null;
    // Mark session as checked
    lastCheckedAtRef.current[sessionID] = Date.now();
    saveLastCheckedAt(lastCheckedAtRef.current);
    // Remove from unread list immediately
    setState((prev) => ({
      ...prev,
      selectedSessionID: sessionID,
      selectedSession: prev.sessions.find((s) => s.id === sessionID) || prev.archivedSessions.find((s) => s.id === sessionID) || null,
      messages: [],
      sessionStatus: null,
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
    sendingStatusRef.current = null;
    setState((prev) => ({
      ...prev,
      selectedSessionID: null,
      selectedSession: null,
      messages: [],
      sessionStatus: null,
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
      // Success: SSE events will update the real messages
      // The optimistic messages will be replaced when real ones arrive
    } catch (e: unknown) {
      // On error: remove the processing placeholder and optimistic user message
      const msg = e instanceof Error ? e.message : 'Failed to send message';
      sendingStatusRef.current = null;
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
          sessionStatus: null,
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
          sessionStatus: null,
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

    // Initialize lastCheckedAt for sessions not yet tracked
    for (const s of sessions) {
      if (!(s.id in lastChecked)) {
        lastChecked[s.id] = now;
      }
    }

    // Clean up entries for sessions that no longer exist
    const sessionIds = new Set(sessions.map((s) => s.id));
    for (const id of Object.keys(lastChecked)) {
      if (!sessionIds.has(id)) {
        delete lastChecked[id];
      }
    }

    // Sessions that completed via REST API - remove from processing
    const completedSessionIds: string[] = [];

    // Check each session's latest assistant message via REST API
    for (const s of sessions) {
      try {
        const apiMessages = await client.getMessages(s.id);
        if (apiMessages.length === 0) continue;

        // Find the latest assistant message
        let latestAssistantTime: number | undefined;
        let latestFinish: string | undefined;
        for (let i = apiMessages.length - 1; i >= 0; i--) {
          const msg = apiMessages[i];
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
      } catch {
        // Skip sessions that fail to load
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

  const connect = useCallback((gatewayUrl: string, gatewayToken: string) => {
    const client = getClient(gatewayUrl, gatewayToken);
    clientRef.current = client;

    let eventService = eventServiceRef.current;
    if (!eventService) {
      eventService = new OpenCodeEventService();
      eventServiceRef.current = eventService;
    }

    eventService.onEvent(processEvent);
    eventService.onConnectionChange((status) => {
      setState((prev) => ({
        ...prev,
        connectionStatus: status === 'connected' ? 'connected'
          : status === 'reconnecting' ? 'reconnecting'
          : status === 'error' ? 'error'
          : 'disconnected',
      }));
    });

    setState((prev) => ({ ...prev, connectionStatus: 'connecting' }));
    eventService.connect(gatewayUrl, gatewayToken);
  }, [getClient, processEvent]);

  const disconnect = useCallback(() => {
    if (eventServiceRef.current) {
      eventServiceRef.current.disconnect();
    }
    sendingStatusRef.current = null;
    setState((prev) => ({
      ...prev,
      connectionStatus: 'disconnected',
      sessions: [],
      archivedSessions: [],
      selectedSessionID: null,
      selectedSession: null,
      messages: [],
      sessionStatus: null,
      pendingPermissions: [],
      pendingQuestions: [],
      processingSessionIds: [],
    }));
  }, []);

  useEffect(() => {
    return () => {
      if (eventServiceRef.current) {
        eventServiceRef.current.destroy();
        eventServiceRef.current = null;
      }
    };
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
    getClient: () => clientRef.current,
  };

  return [state, actions];
}
