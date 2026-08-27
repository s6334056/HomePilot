import { OpenCodeSSEEvent } from '../domain/types';

export type OpenCodeEventHandler = (event: OpenCodeSSEEvent) => void;
export type OpenCodeConnectionHandler = (status: 'connected' | 'disconnected' | 'reconnecting') => void;

const HEARTBEAT_TIMEOUT_MS = 90000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export class OpenCodeEventService {
  private eventSource: EventSource | null = null;
  private handlers: Set<OpenCodeEventHandler> = new Set();
  private connectionHandlers: Set<OpenCodeConnectionHandler> = new Set();
  private gatewayUrl: string = '';
  private gatewayToken: string = '';
  private reconnectAttempts: number = 0;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected: boolean = false;
  private seenEventIds: Set<string> = new Set();

  get connected(): boolean {
    return this._connected;
  }

  onEvent(handler: OpenCodeEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onConnectionChange(handler: OpenCodeConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  connect(gatewayUrl: string, gatewayToken: string): void {
    this.disconnect();
    this.gatewayUrl = gatewayUrl.replace(/\/+$/, '');
    this.gatewayToken = gatewayToken;
    this.reconnectAttempts = 0;
    this.openSSE();
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._connected = false;
    this.notifyConnection('disconnected');
  }

  private openSSE(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.notifyConnection('disconnected');

    try {
      const sseUrl = `${this.gatewayUrl}/api/opencode/event?token=${encodeURIComponent(this.gatewayToken)}`;
      console.log(`[SSE-CLIENT] Opening EventSource: ${this.gatewayUrl}/api/opencode/event?token=***`);
      this.eventSource = new EventSource(sseUrl);
    } catch (e) {
      console.log(`[SSE-CLIENT] EventSource constructor failed:`, e);
      this.handleError();
      return;
    }

    this.eventSource.onopen = () => {
      console.log(`[SSE-CLIENT] onopen - connected`);
      this._connected = true;
      this.reconnectAttempts = 0;
      this.notifyConnection('connected');
      this.resetHeartbeat();
    };

    this.eventSource.onmessage = (event: MessageEvent) => {
      console.log(`[SSE-CLIENT] onmessage - data length: ${event.data?.length}`);
      this.resetHeartbeat();
      this.handleRawEvent(event.data);
    };

    this.eventSource.onerror = (e) => {
      console.log(`[SSE-CLIENT] onerror - readyState: ${this.eventSource?.readyState}`);
      this.handleError();
    };
  }

  private handleRawEvent(rawData: string): void {
    try {
      const parsed = JSON.parse(rawData) as OpenCodeSSEEvent;

      if (parsed.payload?.id && this.seenEventIds.has(parsed.payload.id)) {
        return;
      }
      if (parsed.payload?.id) {
        this.seenEventIds.add(parsed.payload.id);
        if (this.seenEventIds.size > 5000) {
          const firstIds = Array.from(this.seenEventIds).slice(0, 2500);
          firstIds.forEach((id) => this.seenEventIds.delete(id));
        }
      }

      const isSyncEvent = !!parsed.payload?.syncEvent;
      const eventType = isSyncEvent
        ? parsed.payload.syncEvent!.type
        : parsed.payload?.type;

      if (eventType === 'server.heartbeat') {
        return;
      }

      for (const handler of this.handlers) {
        try {
          handler(parsed);
        } catch (e) {
          console.error('[OpenCodeEventService] Handler error:', e);
        }
      }
    } catch {
      console.warn('[OpenCodeEventService] Failed to parse SSE event:', rawData);
    }
  }

  private handleError(): void {
    console.log(`[SSE-CLIENT] handleError - closing connection, scheduling reconnect`);
    this._connected = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.notifyConnection('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS
    );
    console.log(`[SSE-CLIENT] scheduleReconnect - attempt ${this.reconnectAttempts + 1}, delay ${delay}ms`);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.openSSE();
    }, delay);
  }

  private resetHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    this.heartbeatTimer = setTimeout(() => {
      console.warn(`[SSE-CLIENT] Heartbeat timeout after ${HEARTBEAT_TIMEOUT_MS}ms, reconnecting...`);
      this.handleError();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private notifyConnection(status: 'connected' | 'disconnected' | 'error'): void {
    for (const handler of this.connectionHandlers) {
      try {
        handler(status);
      } catch {
        // ignore
      }
    }
  }

  destroy(): void {
    this.disconnect();
    this.handlers.clear();
    this.connectionHandlers.clear();
  }
}
