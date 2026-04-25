/**
 * WebSocket client singleton with exponential-backoff auto-reconnect.
 *
 * Usage:
 *   zenWs.connect(token);
 *   const unsubscribe = zenWs.onEvent((e) => console.log(e));
 *   const unsubReconnect = zenWs.onReconnect(() => refetch());
 *   zenWs.disconnect(); // on logout
 */
import { getAccessToken, getValidToken } from './client';

export type WsEventType =
  | 'new_order'
  | 'urgent'
  | 'status_update'
  | 'order_done'
  | 'attendance_update'
  | 'product_update'
  | 'user_update'
  | 'order_update'
  | 'ingredient_update'
  | 'customer_update'
  | 'low_stock';

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
  // attendance_update fields
  user_id?: string;
  user_name?: string;
  action?: string;
  location_id?: string;
  // resource update fields
  id?: string;
  ingredient_id?: string;
}

type EventHandler = (event: WsEvent) => void;
type ReconnectHandler = () => void;

// Derive WS base from the Vite API URL env var (http → ws, https → wss)
function wsBase(): string {
  const apiUrl: string =
    (import.meta as any).env?.VITE_API_URL || window.location.origin;
  return apiUrl.replace(/^http/, 'ws');
}

class ZenWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectHandlers: Set<ReconnectHandler> = new Set();
  private statusHandlers: Set<(connected: boolean) => void> = new Set();
  private reconnectDelay = 1_000; // ms
  private readonly maxDelay = 30_000;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private activeToken = '';
  private everConnected = false; // tracks if we've had at least one successful connection
  private failCount = 0; // consecutive failed connect attempts

  // ── Public API ──────────────────────────────────────────────────────────────

  connect(token: string): void {
    this.activeToken = token;
    this.shouldReconnect = true;
    this.reconnectDelay = 1_000;
    this.failCount = 0;
    this.everConnected = false;
    this._connect(token);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.activeToken = '';
    this.everConnected = false;
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null; // prevent auto-reconnect
      this.ws.close(1000, 'logout');
      this.ws = null;
    }
    this.reconnectDelay = 1_000;
    this._notifyStatusChange(false);
  }

  /** Subscribe to incoming events. Returns an unsubscribe function. */
  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Subscribe to reconnect events (fires when WS re-establishes after a drop).
   * Use this to trigger a full data re-fetch and catch up on missed events.
   */
  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  /** Subscribe to connection status changes. */
  onStatusChange(handler: (connected: boolean) => void): () => void {
    this.statusHandlers.add(handler);
    // Call immediately with current status
    handler(this.isConnected);
    return () => this.statusHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _notifyStatusChange(connected: boolean): void {
    this.statusHandlers.forEach(h => h(connected));
  }

  private _onVisibilityChange = async (): Promise<void> => {
    if (document.visibilityState === 'visible' && this.shouldReconnect && !this.isConnected) {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      // Always refresh token on tab focus — user may have been idle for hours
      const token = await getValidToken() || this.activeToken;
      if (token) {
        this.activeToken = token;
        this._connect(token);
      }
    }
  };

  private _connect(token: string): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._stopHeartbeat();
    this._notifyStatusChange(false);

    try {
      this.ws = new WebSocket(`${wsBase()}/ws/notifications?token=${token}`);
    } catch (err) {
      console.warn('[WS] Failed to create WebSocket:', err);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1_000; // reset backoff on success
      this.failCount = 0;
      this._startHeartbeat();
      this._notifyStatusChange(true);
      // If this is a re-connection (not the initial connect), notify subscribers
      // so they can re-fetch to catch up on any events missed during the gap.
      if (this.everConnected) {
        this.reconnectHandlers.forEach(h => h());
      }
      this.everConnected = true;
    };

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const event: WsEvent = JSON.parse(e.data as string);
        // Ignore server-sent keepalive pings
        if ((event as any).type === 'ping') return;
        this.handlers.forEach(h => h(event));
      } catch {
        // malformed message or plain-text pong — ignore
      }
    };

    this.ws.onclose = (e: CloseEvent) => {
      this._stopHeartbeat();
      this._notifyStatusChange(false);
      if (!this.shouldReconnect) return;
      this.failCount++;
      // Code 4001/4003 = server-side auth rejection — no point retrying without a new token
      const isAuthClose = e.code === 4001 || e.code === 4003;
      this._scheduleReconnect(isAuthClose || this.failCount >= 2);
    };

    this.ws.onerror = () => {
      // onclose fires after onerror — reconnect logic handled there
    };
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    // Send a ping every 25s to prevent proxy idle-connection timeouts (typically 60s)
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 25_000);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _scheduleReconnect(refreshFirst = false): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    this.reconnectTimer = setTimeout(async () => {
      if (!this.shouldReconnect) return;
      // After repeated failures or auth close, refresh the token before trying again
      let token: string | null = null;
      if (refreshFirst) {
        token = await getValidToken();
      } else {
        token = this.activeToken || getAccessToken();
      }
      if (token) {
        this.activeToken = token; // keep activeToken up to date
        this._connect(token);
      }
    }, delay);
  }
}

/** Module-level singleton — import and use everywhere */
export const zenWs = new ZenWebSocket();
