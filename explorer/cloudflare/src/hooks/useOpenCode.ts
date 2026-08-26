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
} from '../domain/types';
import { OpenCodeClient } from '../services/OpenCodeClient';
import { OpenCodeEventService } from '../services/OpenCodeEventService';

const SETTINGS_STORAGE_KEY = 'homepilot-agent-settings';

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
  selectedSessionID: string | null;
  selectedSession: OpenCodeSessionInfo | null;
  messages: OpenCodeMessageWithParts[];
  sessionStatus: OpenCodeSessionStatus | null;
  pendingPermissions: OpenCodePermissionRequest[];
  pendingQuestions: OpenCodeQuestionRequest[];
  isLoadingSessions: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  error: string | null;
}

export interface OpenCodeActions {
  connect: (url: string) => void;
  disconnect: () => void;
  refreshSessions: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  selectSession: (sessionID: string) => Promise<void>;
  createSession: (title?: string) => Promise<string | null>;
  sendMessage: (content: string) => Promise<void>;
  respondPermission: (permissionID: string, response: 'grant' | 'deny' | 'always') => Promise<void>;
  respondQuestion: (questionID: string, answer: string | string[]) => Promise<void>;
}

export function useOpenCode(): [OpenCodeState, OpenCodeActions] {
  const [state, setState] = useState<OpenCodeState>({
    connectionStatus: 'disconnected',
    sessions: [],
    selectedSessionID: null,
    selectedSession: null,
    messages: [],
    sessionStatus: null,
    pendingPermissions: [],
    pendingQuestions: [],
    isLoadingSessions: false,
    isLoadingMessages: false,
    isSending: false,
    error: null,
  });

  const clientRef = useRef<OpenCodeClient | null>(null);
  const eventServiceRef = useRef<OpenCodeEventService | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const getClient = useCallback((url: string): OpenCodeClient => {
    if (!clientRef.current || clientRef.current.getBaseUrl() !== url) {
      clientRef.current = new OpenCodeClient({ baseUrl: url });
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
          const exists = prev.sessions.some((s) => s.id === props.sessionID);
          if (exists) return prev;
          const newSession = props.info || { id: props.sessionID };
          return {
            ...prev,
            sessions: [newSession, ...prev.sessions],
          };
        }

        case 'session.updated': {
          const props = properties as unknown as { sessionID: string; info: Partial<OpenCodeSessionInfo> };
          if (!props?.sessionID) return prev;
          return {
            ...prev,
            sessions: prev.sessions.map((s) =>
              s.id === props.sessionID ? { ...s, ...props.info } : s
            ),
            selectedSession:
              prev.selectedSession?.id === props.sessionID
                ? { ...prev.selectedSession, ...props.info }
                : prev.selectedSession,
          };
        }

        case 'session.status': {
          const props = properties as unknown as { sessionID: string; status: OpenCodeSessionStatus };
          if (!props?.sessionID) return prev;
          if (prev.selectedSessionID !== props.sessionID) return prev;
          return {
            ...prev,
            sessionStatus: props.status,
          };
        }

        case 'message.updated': {
          const props = properties as unknown as {
            sessionID: string;
            messageID: string;
            info: Partial<OpenCodeMessageInfo>;
          };
          if (!props?.sessionID || !props?.messageID) return prev;
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load messages';
      setState((prev) => ({ ...prev, isLoadingMessages: false, isSending: false, error: msg }));
    }
  }, []);

  const selectSession = useCallback(async (sessionID: string) => {
    const client = clientRef.current;
    if (!client) return;
    setState((prev) => ({
      ...prev,
      selectedSessionID: sessionID,
      selectedSession: prev.sessions.find((s) => s.id === sessionID) || null,
      messages: [],
      sessionStatus: null,
      isLoadingMessages: true,
      error: null,
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

  const createSession = useCallback(async (title?: string): Promise<string | null> => {
    const client = clientRef.current;
    if (!client) return null;
    try {
      const settings = loadSettings();
      const session = await client.createSession({
        title,
        projectID: settings.selectedProjectID,
        model: {
          id: settings.selectedModelID,
          providerID: settings.selectedProviderID,
        },
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

  const sendMessage = useCallback(async (content: string) => {
    const client = clientRef.current;
    const sessionID = stateRef.current.selectedSessionID;
    if (!client || !sessionID) return;

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
      await client.sendMessage(sessionID, content);
      // Success: SSE events will update the real messages
      // The optimistic messages will be replaced when real ones arrive
    } catch (e: unknown) {
      // On error: remove the processing placeholder and optimistic user message
      const msg = e instanceof Error ? e.message : 'Failed to send message';
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

  const connect = useCallback((url: string) => {
    const client = getClient(url);
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
          : status === 'error' ? 'error'
          : 'disconnected',
      }));
      if (status === 'connected') {
        refreshSessions();
      }
    });

    setState((prev) => ({ ...prev, connectionStatus: 'connecting' }));
    eventService.connect(url);
  }, [getClient, processEvent, refreshSessions]);

  const disconnect = useCallback(() => {
    if (eventServiceRef.current) {
      eventServiceRef.current.disconnect();
    }
    setState((prev) => ({
      ...prev,
      connectionStatus: 'disconnected',
      sessions: [],
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
    refreshMessages,
    selectSession,
    createSession,
    sendMessage,
    respondPermission,
    respondQuestion,
  };

  return [state, actions];
}
