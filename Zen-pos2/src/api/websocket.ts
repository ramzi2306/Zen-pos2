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

// Derive API base from the Vite API URL env var
function wsBase(): string {
  const apiUrl: string =
    (import.meta as any).env?.VITE_API_URL || window.location.origin;
  return apiUrl;
}

class ZenWebSocket {
  private worker: Worker | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectHandlers: Set<ReconnectHandler> = new Set();
  private statusHandlers: Set<(connected: boolean) => void> = new Set();
  private isConnectedState = false;

  constructor() {
    this._initWorker();
  }

  private _initWorker() {
    this.worker = new Worker('/ws-worker.js');
    this.worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === 'STATUS') {
        this.isConnectedState = data.connected;
        this._notifyStatusChange(this.isConnectedState);
      } else if (data.type === 'EVENT') {
        const event: WsEvent = data.event;
        this.handlers.forEach(h => h(event));
        this._handleNotification(event);
      } else if (data.type === 'RECONNECT') {
        this.reconnectHandlers.forEach(h => h());
      } else if (data.type === 'NEED_TOKEN') {
        this._refreshTokenAndConnect();
      }
    };
  }

  private async _refreshTokenAndConnect() {
    const token = await getValidToken();
    if (token && this.worker) {
      this.worker.postMessage({ type: 'REFRESH_TOKEN', token });
    }
  }

  private _handleNotification(event: WsEvent) {
    if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (event.type === 'new_order') {
          registration.active?.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: 'New Order',
            options: {
              body: `Order #${event.order_number || event.order_id || ''} received!`,
              icon: '/bag.png',
              tag: 'new_order',
              data: { url: '/orders' }
            }
          });
        } else if (event.type === 'urgent') {
          registration.active?.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: 'Urgent Notification',
            options: {
              body: event.message || 'Action required',
              icon: '/bag.png',
              tag: 'urgent',
              requireInteraction: true
            }
          });
        }
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  connect(token: string): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    if (!this.worker) this._initWorker();
    this.worker?.postMessage({
      type: 'CONNECT',
      token,
      apiUrl: wsBase()
    });
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  disconnect(): void {
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.worker?.postMessage({ type: 'DISCONNECT' });
    this.isConnectedState = false;
    this._notifyStatusChange(false);
  }

  /** Subscribe to incoming events. Returns an unsubscribe function. */
  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Subscribe to reconnect events (fires when WS re-establishes after a drop).
   */
  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  /** Subscribe to connection status changes. */
  onStatusChange(handler: (connected: boolean) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.isConnectedState);
    return () => this.statusHandlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.isConnectedState;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _notifyStatusChange(connected: boolean): void {
    this.statusHandlers.forEach(h => h(connected));
  }

  private _onVisibilityChange = async (): Promise<void> => {
    if (document.visibilityState === 'visible' && !this.isConnectedState) {
      const token = await getValidToken();
      if (token && this.worker) {
        this.worker.postMessage({ type: 'REFRESH_TOKEN', token });
      }
    }
  };
}

/** Module-level singleton — import and use everywhere */
export const zenWs = new ZenWebSocket();
