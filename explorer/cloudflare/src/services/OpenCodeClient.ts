import {
  OpenCodeSessionInfo,
  OpenCodeMessageInfo,
} from '../domain/types';

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

  async getMessages(sessionID: string): Promise<OpenCodeMessageInfo[]> {
    const data = await this.request<unknown>('GET', `/session/${sessionID}/message`);
    if (Array.isArray(data)) {
      return data as OpenCodeMessageInfo[];
    }
    if (data && typeof data === 'object' && 'messages' in data) {
      return (data as { messages: OpenCodeMessageInfo[] }).messages;
    }
    return [];
  }

  async createSession(options?: { title?: string; path?: string }): Promise<OpenCodeSessionInfo> {
    return this.request<OpenCodeSessionInfo>('POST', '/session', options || {});
  }

  async sendMessage(sessionID: string, content: string): Promise<void> {
    await this.request<void>('POST', `/session/${sessionID}/message`, { content });
  }

  async respondPermission(permissionID: string, response: 'grant' | 'deny' | 'always'): Promise<void> {
    await this.request<void>('POST', `/permission/${permissionID}`, { response });
  }

  async respondQuestion(questionID: string, answer: string | string[]): Promise<void> {
    await this.request<void>('POST', `/question/${questionID}`, { answer });
  }

  getEventSource(): EventSource {
    return new EventSource(`${this.baseUrl}/event`);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
