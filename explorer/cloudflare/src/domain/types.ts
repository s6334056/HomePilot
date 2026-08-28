export type FileItemType = 'file' | 'directory';

export interface FileSystemItem {
  id: string;
  name: string;
  type: FileItemType;
  path: string;
  size?: number; // bytes
  modifiedAt?: string; // ISO 8601
  mimeType?: string;
  content?: string;
  childrenCount?: number;
}

export type ScreenType = 'explorer' | 'file_viewer' | 'agent';

export interface AgentContext {
  currentPath: string;
  selectedItem: FileSystemItem | null;
  selectedFile: FileSystemItem | null;
  content?: string;
  sourceScreen: ScreenType;
  timestamp: string;
}

export interface ExplorerState {
  currentPath: string;
  items: FileSystemItem[];
  selectedIndex: number;
  currentScreen: ScreenType;
  selectedFile: FileSystemItem | null;
  fileViewerContent: string;
  fileViewerScrollLine: number;
  agentContext: AgentContext | null;
  isLoading: boolean;
  errorMessage: string | null;
}

export type G2MenuAction = 'refresh' | 'home' | 'parent' | 'info' | 'agent';

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

export interface AgentSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  contextPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSettings {
  selectedProjectID: string;
  selectedProviderID: string;
  selectedModelID: string;
}

// ============================================================
// OpenCode Types (verified against OpenCode v1.18.21)
// ============================================================

export type OpenCodeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface OpenCodeModel {
  id: string;
  providerID: string;
  variant?: string;
}

export interface OpenCodeTokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export interface OpenCodeSessionTime {
  created: number;
  updated: number;
  archived?: number;
}

export interface OpenCodeSessionSummary {
  additions: number;
  deletions: number;
  files: number;
}

export interface OpenCodeSessionInfo {
  id: string;
  slug?: string;
  version?: string;
  projectID?: string;
  directory?: string;
  path?: string;
  title?: string;
  agent?: string;
  model?: OpenCodeModel;
  cost?: number;
  tokens?: OpenCodeTokenUsage;
  time?: OpenCodeSessionTime;
  summary?: OpenCodeSessionSummary;
}

export type OpenCodeSessionStatusType = string;

export interface OpenCodeSessionStatus {
  type: OpenCodeSessionStatusType;
}

export type OpenCodeMessageRole = 'user' | 'assistant';

export interface OpenCodeMessageModel {
  providerID: string;
  modelID: string;
}

export interface OpenCodeMessagePath {
  cwd: string;
  root: string;
}

export interface OpenCodeMessageInfo {
  id: string;
  role: OpenCodeMessageRole;
  sessionID: string;
  agent?: string;
  model?: OpenCodeMessageModel;
  time?: { created: number };
  mode?: string;
  path?: OpenCodeMessagePath;
  modelID?: string;
  providerID?: string;
}

export type OpenCodePartType = string;

export interface OpenCodeToolState {
  status: string;
  input?: Record<string, unknown>;
  raw?: string;
  time?: { start?: number; end?: number };
}

export interface OpenCodeMessagePart {
  id: string;
  type: OpenCodePartType;
  messageID: string;
  sessionID: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: OpenCodeToolState;
  time?: { start?: number; end?: number };
}

export interface OpenCodePermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata?: Record<string, unknown>;
  always?: string[];
  tool?: {
    messageID?: string;
    callID?: string;
  };
}

export interface OpenCodeQuestionRequest {
  id: string;
  sessionID: string;
  question: string;
  header?: string;
  options?: Array<{
    label: string;
    description?: string;
  }>;
  multiple?: boolean;
  tool?: {
    messageID?: string;
    callID?: string;
  };
}

export interface OpenCodeToolCallInfo {
  id: string;
  sessionID: string;
  messageID: string;
  tool: string;
  state: OpenCodeToolState;
}

// SSE Event Types (verified from actual SSE data)

export interface OpenCodeSSEEvent {
  directory?: string;
  project?: string;
  payload: {
    id: string;
    type: string;
    properties?: Record<string, unknown>;
    syncEvent?: {
      id: string;
      type: string;
      seq: number;
      aggregateID: string;
      data: Record<string, unknown>;
    };
  };
}

export interface OpenCodeSessionCreatedProperties {
  sessionID: string;
  info: OpenCodeSessionInfo;
}

export interface OpenCodeSessionUpdatedProperties {
  sessionID: string;
  info: Partial<OpenCodeSessionInfo>;
}

export interface OpenCodeSessionStatusProperties {
  sessionID: string;
  status: OpenCodeSessionStatus;
}

export interface OpenCodeMessageUpdatedProperties {
  sessionID: string;
  messageID: string;
  info: Partial<OpenCodeMessageInfo>;
}

export interface OpenCodeMessagePartUpdatedProperties {
  sessionID: string;
  messageID: string;
  partID: string;
  info: Partial<OpenCodeMessagePart>;
}

export interface OpenCodeMessagePartDeltaProperties {
  sessionID: string;
  messageID: string;
  partID: string;
  field: string;
  delta: string;
}

export interface OpenCodePermissionAskedProperties {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata?: Record<string, unknown>;
  always?: string[];
  tool?: {
    messageID?: string;
    callID?: string;
  };
}

// Union type for all known event types
export type OpenCodeEventType =
  | 'server.heartbeat'
  | 'session.created'
  | 'session.updated'
  | 'session.status'
  | 'message.updated'
  | 'message.part.updated'
  | 'message.part.delta'
  | 'permission.asked'
  | string; // unknown events handled gracefully

// ============================================================
// OpenCode Project / Provider / Model Types
// ============================================================

export interface OpenCodeProject {
  id: string;
  worktree: string;
  vcs?: string;
  name?: string;
}

export interface OpenCodeModelCost {
  input?: number;
  output?: number;
  cache?: number;
  reasoning?: number;
}

export interface OpenCodeProviderModel {
  providerID: string;
  modelID: string;
  name: string;
  cost?: OpenCodeModelCost;
}

export interface OpenCodeProvider {
  id: string;
  name: string;
  models?: Record<string, { name?: string; cost?: OpenCodeModelCost }>;
}
