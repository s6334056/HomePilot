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
const UNREAD_STORAGE_KEY = 'homepilot-unread-sessions';

function loadUnreadSessionIds(): string[] {
  try {
    const raw = localStorage.getItem(UNREAD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string');
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveUnreadSessionIds(ids: string[]): void {
  try {
    localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify(ids));
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
}

export interface OpenCodeActions {
  connect: (gatewayUrl: string, gatewayToken: string) => void;
  disconnect: () => void;
  refreshSessions: () => Promise<void>;
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
}

export function useOpenCode(): [OpenCodeState, OpenCodeActions] {
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
    unreadSessionIds: loadUnreadSessionIds(),
  });

  const clientRef = useRef<OpenCodeClient | null>(null);
  const eventServiceRef = useRef<OpenCodeEventService | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Tracks the session status type at the moment sendMessage is called.
  // When a *different* status arrives via SSE, the agent has finished processing.
  const sendingStatusRef = useRef<string | null>(null);
  // Set to true once the initial session load + SSE connection is established.
  // Used to avoid marking existing messages as unread during startup.
  const readyRef = useRef(false);
  // Grace period after readyRef becomes true: ignore unread during initial status events.
  const readyTimeRef = useRef<number>(0);
  // Tracks previous session.status.type per session to detect transitions to terminal states.
  const prevSessionStatusRef = useRef<Map<string, string>>(new Map());

  // Returns true if the given status type represents a terminal/result state
  // that should trigger Unread (user action or confirmation needed).
  function isUnreadRelevantStatus(statusType: string): boolean {
    // Empty or falsy status = agent idle / finished
    if (!statusType) return true;
    // Known terminal states
    const lower = statusType.toLowerCase();
    if (lower === 'idle' || lower === 'completed' || lower === 'finished' || lower === 'error') return true;
    return false;
  }

  const getClient = useCallback((gatewayUrl: string, gatewayToken: string): OpenCodeClient => {
    if (!clientRef.current || clientRef.current.getGatewayUrl() !== gatewayUrl) {
      clientRef.current = new OpenCodeClient({ gatewayUrl, gatewayToken });
    }
    return clientRef.current;
  }, []);

  const processEvent = useCallback((event: OpenCodeSSEEvent) => {
    // [TRACE] processEvent entry - confirm event reached useOpenCode
    console.log('[HomePilot SSE Trace] processEvent called', {
      hasPayload: !!event.payload,
      payloadType: event.payload?.type,
      syncEventType: event.payload?.syncEvent?.type,
    });

    const payload = event.payload;
    if (!payload) return;

    const isSyncEvent = !!payload.syncEvent;
    const eventType = isSyncEvent ? payload.syncEvent!.type : payload.type;
    const properties = isSyncEvent
      ? payload.syncEvent!.data
      : (payload.properties || {}) as Record<string, unknown>;

    // [TRACE] Event type dispatched to switch
    console.log('[HomePilot SSE Trace] dispatching to switch', { eventType, isSyncEvent });

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
          const prevType = prevSessionStatusRef.current.get(props.sessionID) ?? '';
          prevSessionStatusRef.current.set(props.sessionID, newType);

          // [DEBUG] Observe actual session.status events from OpenCode
          console.log('[HomePilot Status Debug]', {
            sessionID: props.sessionID,
            statusType: newType,
            prevStatusType: prevType,
            statusChanged: newType !== prevType,
            selectedSessionID: prev.selectedSessionID,
            isSending: prev.isSending,
            isUnreadRelevant: isUnreadRelevantStatus(newType),
            rawStatus: props.status,
          });

          // Unread: when a non-selected session transitions to a terminal state
          // (finish/error/idle), mark it as unread.
          // Grace period: skip unread during 3s after initial load to avoid false positives.
          const inGracePeriod = readyRef.current && (Date.now() - readyTimeRef.current < 3000);
          let unreadUpdate = prev.unreadSessionIds;
          if (
            readyRef.current &&
            !inGracePeriod &&
            props.sessionID !== prev.selectedSessionID &&
            newType !== prevType &&
            isUnreadRelevantStatus(newType)
          ) {
            if (!prev.unreadSessionIds.includes(props.sessionID)) {
              unreadUpdate = [...prev.unreadSessionIds, props.sessionID];
              saveUnreadSessionIds(unreadUpdate);
            }
          }

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

          return {
            ...prev,
            sessionStatus: sessionStatusUpdate,
            isSending: isSendingUpdate,
            unreadSessionIds: unreadUpdate,
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

          // [DEBUG] Observe permission.asked events
          console.log('[HomePilot Status Debug]', {
            event: 'permission.asked',
            sessionID: props.sessionID,
            permissionID: props.id,
            permission: props.permission,
            selectedSessionID: prev.selectedSessionID,
          });

          // Unread: permission requires user action
          let unreadUpdate = prev.unreadSessionIds;
          if (
            readyRef.current &&
            props.sessionID &&
            props.sessionID !== prev.selectedSessionID
          ) {
            if (!prev.unreadSessionIds.includes(props.sessionID)) {
              unreadUpdate = [...prev.unreadSessionIds, props.sessionID];
              saveUnreadSessionIds(unreadUpdate);
            }
          }

          return {
            ...prev,
            pendingPermissions: [...prev.pendingPermissions, props],
            unreadSessionIds: unreadUpdate,
          };
        }

        case 'question.asked': {
          const props = properties as unknown as OpenCodeQuestionRequest;
          if (!props?.id) return prev;
          const exists = prev.pendingQuestions.some((q) => q.id === props.id);
          if (exists) return prev;

          // [DEBUG] Observe question.asked events
          console.log('[HomePilot Status Debug]', {
            event: 'question.asked',
            sessionID: props.sessionID,
            questionID: props.id,
            question: props.question,
            selectedSessionID: prev.selectedSessionID,
          });

          // Unread: question requires user answer
          let unreadUpdate = prev.unreadSessionIds;
          if (
            readyRef.current &&
            props.sessionID &&
            props.sessionID !== prev.selectedSessionID
          ) {
            if (!prev.unreadSessionIds.includes(props.sessionID)) {
              unreadUpdate = [...prev.unreadSessionIds, props.sessionID];
              saveUnreadSessionIds(unreadUpdate);
            }
          }

          return {
            ...prev,
            pendingQuestions: [...prev.pendingQuestions, props],
            unreadSessionIds: unreadUpdate,
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
      readyRef.current = true;
      readyTimeRef.current = Date.now();
      setState((prev) => ({
        ...prev,
        sessions,
        archivedSessions,
        isLoadingSessions: false,
        isLoadingArchivedSessions: false,
      }));
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
    // Mark session as read (remove from unread)
    const unreadUpdate = stateRef.current.unreadSessionIds.filter((id) => id !== sessionID);
    if (unreadUpdate.length !== stateRef.current.unreadSessionIds.length) {
      saveUnreadSessionIds(unreadUpdate);
    }
    setState((prev) => ({
      ...prev,
      selectedSessionID: sessionID,
      selectedSession: prev.sessions.find((s) => s.id === sessionID) || prev.archivedSessions.find((s) => s.id === sessionID) || null,
      messages: [],
      sessionStatus: null,
      isLoadingMessages: true,
      error: null,
      unreadSessionIds: unreadUpdate,
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
      error: null,
    }));

    try {
      await client.sendMessage(sessionID, formattedMessage);
      // Success: SSE events will update the real messages
      // The optimistic messages will be replaced when real ones arrive
    } catch (e: unknown) {
      // On error: remove the processing placeholder and optimistic user message
      const msg = e instanceof Error ? e.message : 'Failed to send message';
      sendingStatusRef.current = null;
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter(
          (m) => m.id !== tempUserMsgId && m.id !== tempAssistantMsgId
        ),
        isSending: false,
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
      // Remove deleted session from unread
      const unreadUpdate = stateRef.current.unreadSessionIds.filter((id) => id !== sessionID);
      if (unreadUpdate.length !== stateRef.current.unreadSessionIds.length) {
        saveUnreadSessionIds(unreadUpdate);
        setState((prev) => ({ ...prev, unreadSessionIds: unreadUpdate }));
      }
      await refreshAllSessions();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete session';
      setState((prev) => ({ ...prev, error: msg }));
      return false;
    }
  }, [refreshAllSessions]);

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
      if (status === 'connected') {
        refreshAllSessions();
      }
    });

    setState((prev) => ({ ...prev, connectionStatus: 'connecting' }));
    eventService.connect(gatewayUrl, gatewayToken);
  }, [getClient, processEvent, refreshAllSessions]);

  const disconnect = useCallback(() => {
    if (eventServiceRef.current) {
      eventServiceRef.current.disconnect();
    }
    sendingStatusRef.current = null;
    readyRef.current = false;
    readyTimeRef.current = 0;
    prevSessionStatusRef.current.clear();
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
    getClient: () => clientRef.current,
  };

  return [state, actions];
}
