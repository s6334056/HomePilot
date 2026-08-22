import { AgentContext, FileSystemItem, ScreenType } from '../domain/types';

export interface OpenAgentParams {
  path: string;
  item?: FileSystemItem | null;
  selectedFile?: FileSystemItem | null;
  content?: string;
  source: ScreenType;
}

export class AgentService {
  private activeContext: AgentContext | null = null;
  private history: AgentContext[] = [];

  public open(params: OpenAgentParams): AgentContext {
    const context: AgentContext = {
      currentPath: params.path,
      selectedItem: params.item ?? null,
      selectedFile: params.selectedFile ?? null,
      content: params.content,
      sourceScreen: params.source,
      timestamp: new Date().toISOString()
    };

    this.activeContext = context;
    this.history.push(context);
    console.log('[AgentService] Agent Context opened:', context);
    return context;
  }

  public getActiveContext(): AgentContext | null {
    return this.activeContext;
  }

  public getHistory(): AgentContext[] {
    return [...this.history];
  }

  public clearContext(): void {
    this.activeContext = null;
  }
}
