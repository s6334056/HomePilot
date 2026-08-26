import {
  OpenCodeSessionInfo,
  OpenCodeMessageInfo,
  OpenCodeMessagePart,
  OpenCodeProject,
  OpenCodeProvider,
  OpenCodeProviderModel,
  OpenCodeModelCost,
} from '../domain/types';

export interface OpenCodeClientMessage {
  info: OpenCodeMessageInfo;
  parts: OpenCodeMessagePart[];
}

export interface OpenCodeClientConfig {
  baseUrl: string;
}

export class OpenCodeClient {
  private baseUrl: string;

  constructor(config: OpenCodeClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`OpenCode API error ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    return response.text() as unknown as T;
  }

  async getSessions(): Promise<OpenCodeSessionInfo[]> {
    const data = await this.request<unknown>('GET', '/session');
    if (Array.isArray(data)) {
      return data as OpenCodeSessionInfo[];
    }
    if (data && typeof data === 'object' && 'sessions' in data) {
      return (data as { sessions: OpenCodeSessionInfo[] }).sessions;
    }
    return [];
  }

  async getSession(sessionID: string): Promise<OpenCodeSessionInfo> {
    return this.request<OpenCodeSessionInfo>('GET', `/session/${sessionID}`);
  }

  async getMessages(sessionID: string): Promise<OpenCodeClientMessage[]> {
    const data = await this.request<unknown>('GET', `/session/${sessionID}/message`);

    // { value: [{ info: {...}, parts: [...] }, ...] }
    if (data && typeof data === 'object' && 'value' in data && Array.isArray((data as Record<string, unknown>).value)) {
      const raw = (data as { value: Array<{ info: unknown; parts: unknown }> }).value;
      return raw.map((item) => ({
        info: this.normalizeMessageInfo(item.info, sessionID),
        parts: this.normalizeParts(item.parts, sessionID, item.info),
      }));
    }

    // fallback: array of items with info/parts
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        info: this.normalizeMessageInfo(item.info, sessionID),
        parts: this.normalizeParts(item.parts, sessionID, item.info),
      }));
    }

    // fallback: { messages: [...] }
    if (data && typeof data === 'object' && 'messages' in data) {
      const raw = (data as { messages: Array<{ info: unknown; parts: unknown }> }).messages;
      return raw.map((item) => ({
        info: this.normalizeMessageInfo(item.info, sessionID),
        parts: this.normalizeParts(item.parts, sessionID, item.info),
      }));
    }

    return [];
  }

  private normalizeMessageInfo(raw: unknown, sessionID: string): OpenCodeMessageInfo {
    if (!raw || typeof raw !== 'object') {
      return { id: '', role: 'user', sessionID };
    }
    const r = raw as Record<string, unknown>;
    return {
      id: (r.id as string) || '',
      role: (r.role as OpenCodeMessageInfo['role']) || 'user',
      sessionID: (r.sessionID as string) || sessionID,
      agent: r.agent as string | undefined,
      model: r.model as OpenCodeMessageInfo['model'],
      time: r.time as OpenCodeMessageInfo['time'],
      mode: r.mode as string | undefined,
      path: r.path as OpenCodeMessageInfo['path'],
      modelID: r.modelID as string | undefined,
      providerID: r.providerID as string | undefined,
    };
  }

  private normalizeParts(raw: unknown, sessionID: string, infoRaw: unknown): OpenCodeMessagePart[] {
    if (!Array.isArray(raw)) return [];
    const messageID = (infoRaw && typeof infoRaw === 'object')
      ? ((infoRaw as Record<string, unknown>).id as string) || ''
      : '';
    return raw.map((p: Record<string, unknown>, idx: number) => ({
      id: (p.id as string) || `part-${idx}`,
      type: (p.type as string) || 'text',
      messageID: (p.messageID as string) || messageID,
      sessionID: (p.sessionID as string) || sessionID,
      text: p.text as string | undefined,
      tool: p.tool as string | undefined,
      callID: p.callID as string | undefined,
      state: p.state as OpenCodeMessagePart['state'],
      time: p.time as OpenCodeMessagePart['time'],
    }));
  }

  async createSession(options?: { title?: string; path?: string; projectID?: string }): Promise<OpenCodeSessionInfo> {
    return this.request<OpenCodeSessionInfo>('POST', '/session', options || {});
  }

  async sendMessage(sessionID: string, content: string): Promise<void> {
    await this.request<void>('POST', `/session/${sessionID}/message`, {
      parts: [
        {
          type: 'text',
          text: content,
        },
      ],
    });
  }

  async respondPermission(permissionID: string, response: 'grant' | 'deny' | 'always'): Promise<void> {
    await this.request<void>('POST', `/permission/${permissionID}`, { response });
  }

  async respondQuestion(questionID: string, answer: string | string[]): Promise<void> {
    await this.request<void>('POST', `/question/${questionID}`, { answer });
  }

  async getProjects(): Promise<OpenCodeProject[]> {
    const data = await this.request<unknown>('GET', '/project');
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        id: (item.id as string) || '',
        worktree: (item.worktree as string) || '',
        vcs: item.vcs as string | undefined,
        name: item.name as string | undefined,
      }));
    }
    return [];
  }

  async getProviders(): Promise<OpenCodeProvider[]> {
    const data = await this.request<unknown>('GET', '/provider');
    if (Array.isArray(data)) {
      return data.map((item: Record<string, unknown>) => ({
        id: (item.id as string) || '',
        name: (item.name as string) || (item.id as string) || '',
        models: item.models as Record<string, { name?: string; cost?: OpenCodeModelCost }> | undefined,
      }));
    }
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if ('providers' in obj && Array.isArray(obj.providers)) {
        return (obj.providers as Array<Record<string, unknown>>).map((item) => ({
          id: (item.id as string) || '',
          name: (item.name as string) || (item.id as string) || '',
          models: item.models as Record<string, { name?: string; cost?: OpenCodeModelCost }> | undefined,
        }));
      }
    }
    return [];
  }

  extractFreeModels(providers: OpenCodeProvider[]): OpenCodeProviderModel[] {
    const result: OpenCodeProviderModel[] = [];
    for (const provider of providers) {
      if (provider.id !== 'opencode') continue;
      if (!provider.models) continue;
      for (const [modelID, modelInfo] of Object.entries(provider.models)) {
        const cost = modelInfo.cost;
        const isFree =
          (cost?.input === undefined || cost?.input === 0) &&
          (cost?.output === undefined || cost?.output === 0);
        if (!isFree) continue;
        result.push({
          providerID: provider.id,
          modelID,
          name: modelInfo.name || modelID,
          cost,
        });
      }
    }
    return result;
  }

  getEventSource(): EventSource {
    return new EventSource(`${this.baseUrl}/event`);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
