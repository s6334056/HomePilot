import { AgentSession, AgentMessage, AgentSettings } from '../domain/types';
import { getSessionTitle } from '../utils/pathUtils';

const SESSIONS_STORAGE_KEY = 'homepilot-agent-sessions';
const SETTINGS_STORAGE_KEY = 'homepilot-agent-settings';

const MOCK_SESSIONS: AgentSession[] = [
  {
    id: 'session-1',
    title: '',
    contextPath: '/home/projects/sample-app/src/main.ts',
    createdAt: '2026-08-23T10:00:00Z',
    updatedAt: '2026-08-23T10:05:00Z',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'このファイルの内容を確認して、简单に要約してください',
        timestamp: '2026-08-23T10:00:00Z',
      },
      {
        id: 'msg-2',
        role: 'agent',
        content: 'main.tsファイルを確認しました。\n\ninitApp()関数をimportし、実行するシンプルなエントリーポイントです。コンソールにログを出力し、DOMにヘッダー要素を挿入します。',
        timestamp: '2026-08-23T10:00:30Z',
      },
    ],
  },
  {
    id: 'session-2',
    title: '',
    contextPath: '/home',
    createdAt: '2026-08-22T14:00:00Z',
    updatedAt: '2026-08-22T14:10:00Z',
    messages: [
      {
        id: 'msg-3',
        role: 'user',
        content: 'QR接続の問題をデバッグしたい',
        timestamp: '2026-08-22T14:00:00Z',
      },
      {
        id: 'msg-4',
        role: 'agent',
        content: 'QR接続のトラブルシューティング手順をご案内します。\n\n1. まずSettingsから接続情報を確認\n2. カメラの動作確認\n3. QRコードの生成と読み取りテスト\n\n具体的にどの段階で問題が発生していますか？',
        timestamp: '2026-08-22T14:01:00Z',
      },
    ],
  },
];

export class SessionService {
  private sessions: AgentSession[] = [];
  private settings: AgentSettings = { selectedProjectID: 'global', selectedProviderID: 'opencode', selectedModelID: 'mimo-v2.5-free' };

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (raw) {
        this.sessions = JSON.parse(raw);
      } else {
        this.sessions = [...MOCK_SESSIONS];
        this.saveSessionsToStorage();
      }
    } catch {
      this.sessions = [...MOCK_SESSIONS];
    }

    try {
      const settingsRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (settingsRaw) {
        this.settings = JSON.parse(settingsRaw);
      }
    } catch {
      // keep defaults
    }
  }

  private saveSessionsToStorage(): void {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(this.sessions));
    } catch {
      // localStorage unavailable or full
    }
  }

  private saveSettingsToStorage(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // localStorage unavailable or full
    }
  }

  public getSessions(): AgentSession[] {
    return [...this.sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getSession(id: string): AgentSession | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  public createSession(contextPath: string): AgentSession {
    const now = new Date().toISOString();
    const session: AgentSession = {
      id: `session-${Date.now()}`,
      title: '',
      contextPath,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.push(session);
    this.saveSessionsToStorage();
    return session;
  }

  public addMessage(sessionId: string, role: 'user' | 'agent', content: string): void {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const msg: AgentMessage = {
      id: `msg-${Date.now()}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    session.messages.push(msg);
    session.updatedAt = msg.timestamp;

    // Update title from first user message if no formal title
    if (role === 'user' && !session.title) {
      session.title = getSessionTitle(undefined, content);
    }

    this.saveSessionsToStorage();
  }

  public deleteSession(id: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.saveSessionsToStorage();
  }

  public getSettings(): AgentSettings {
    return { ...this.settings };
  }

  public updateSettings(settings: Partial<AgentSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.saveSettingsToStorage();
  }

  public getSessionTitle(session: AgentSession): string {
    const firstUserMsg = session.messages.find((m) => m.role === 'user')?.content;
    return getSessionTitle(session.title || undefined, firstUserMsg);
  }
}
