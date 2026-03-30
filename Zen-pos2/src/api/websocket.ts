/**
 * WebSocket client singleton with exponential-backoff auto-reconnect.
 *
 * Usage:
 *   zenWs.connect(token);
 *   const unsubscribe = zenWs.onEvent((e) => console.log(e));
 *   zenWs.disconnect(); // on logout
 */
import { getAccessToken } from './client';

export type WsEventType =
  | 'new_order'
  | 'urgent'
  | 'status_update'
  | 'order_done';

export interface WsEvent {
  type: WsEventType;
  order_id?: string;
  order_number?: string;
  table?: string;
  order_type?: string;
  status?: string;
  is_urgent?: boolean;
  message?: string;
  timestamp?: string;
}

type EventHandler = (event: WsEvent) => void;

// Derive WS base from the Vite API URL env var (http → ws, https → wss)
function wsBase(): string {
  const apiUrl: string =
    (import.meta as any).env?.VITE_API_URL || window.location.origin;
  return apiUrl.replace(/^http/, 'ws');
}

class ZenWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectDelay = 1_000; // ms
  private readonly maxDelay = 30_000;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeToken = '';

  // ── Public API ──────────────────────────────────────────────────────────────

  connect(token: string): void {
    this.activeToken = token;
    this.shouldReconnect = true;
    this.reconnectDelay = 1_000;
    this._connect(token);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.activeToken = '';
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close(1000, 'logout');
      this.ws = null;
    }
    this.reconnectDelay = 1_000;
  }

  /** Subscribe to incoming events. Returns an unsubscribe function. */
  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _connect(token: string): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(`${wsBase()}/ws/notifications?token=${token}`);
    } catch (err) {
      console.warn('[WS] Failed to create WebSocket:', err);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1_000; // reset backoff on success
    };

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const event: WsEvent = JSON.parse(e.data as string);
        this.handlers.forEach(h => h(event));
      } catch {
        // malformed message — ignore
      }
    };

    this.ws.onclose = () => {
      if (!this.shouldReconnect) return;
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose fires after onerror — reconnect logic handled there
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    this.reconnectTimer = setTimeout(() => {
      const token = this.activeToken || getAccessToken();
      if (token) this._connect(token);
    }, delay);
  }
}

/** Module-level singleton — import and use everywhere */
export const zenWs = new ZenWebSocket();
