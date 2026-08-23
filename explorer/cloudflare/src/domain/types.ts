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
  selectedProject: string;
  selectedModel: string;
}
