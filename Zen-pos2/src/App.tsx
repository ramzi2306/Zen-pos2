import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, TopBar, MobileNav, ProfilePanel } from './components/Layout';
import { CartSidebar, CartFloatingAction } from './components/cart';
import { AdminLoginView } from './views/AdminLoginView';

// Heavy views are lazy-loaded so cashiers/chefs never download the admin bundle
const MenuView       = lazy(() => import('./views/MenuView').then(m => ({ default: m.MenuView })));
const OrdersView     = lazy(() => import('./views/OrdersView').then(m => ({ default: m.OrdersView })));
const SettingsView   = lazy(() => import('./views/AdminViews').then(m => ({ default: m.SettingsView })));
const AttendanceView = lazy(() => import('./views/AttendanceView').then(m => ({ default: m.AttendanceView })));
const PublicMenuPage = lazy(() => import('./views/public/PublicMenuPage'));
import { PublicCartProvider } from './context/PublicCartContext';
import { Product, CartItem, VariationOption, SupplementOption, SupplementGroup, Order, User, Permission, RegisterReport } from './data';
import { BrandingData, DEFAULT_BRANDING } from './api/settings';
import { LocalizationProvider } from './context/LocalizationContext';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { zenWs, WsEvent } from './api/websocket';
import { playSound, unlockAudio } from './utils/sounds';
import { useLocalization } from './context/LocalizationContext';
import { getCartItemPrice } from './utils/cartUtils';
import * as api from './api';

export interface AppNotification {
  id: string;
  type: 'new_order' | 'urgent' | 'status_update' | 'order_done';
  title: string;
  message: string;
  order_number?: string;
  order_id?: string;
  time: string;
  read: boolean;
}

// ── Shared app state (auth, cart, orders) lives here ──────────────────────────
function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [editingOrder, setEditingOrderObj] = useState<Order | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [branding, setBranding] = useState<BrandingData>(() => {
    try {
      const cached = localStorage.getItem('zenpos_branding');
      if (cached) return { ...DEFAULT_BRANDING, ...JSON.parse(cached) };
    } catch {}
    return DEFAULT_BRANDING;
  });
  const [locations, setLocations] = useState<import('./api/locations').Location[]>([]);
  // Admin/owner can switch active location filter; null = see all
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const { formatCurrency } = useLocalization();

  const NOTIF_STORAGE_KEY = 'zenpos_notifications';
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try { const s = localStorage.getItem(NOTIF_STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  // Persist every change
  useEffect(() => {
    try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications)); } catch {}
  }, [notifications]);

  const [toast, setToast] = useState<AppNotification | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global zen:toast event listener — lets any component fire a toast via showError()/showSuccess()
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, level } = (e as CustomEvent<{ message: string; level: string }>).detail;
      const notif: AppNotification = {
        id: Date.now().toString(),
        title: level === 'error' ? 'Error' : level === 'success' ? 'Done' : 'Notice',
        message,
        type: level === 'error' ? 'urgent' : 'order_done',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      };
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(notif);
      toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    };
    document.addEventListener('zen:toast', handler);
    return () => document.removeEventListener('zen:toast', handler);
  }, []);
  // Register gate: false = attendance screen is locked (must check in before using POS)
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  // Session start timestamp — React state keeps it in sync so ProfilePanel
  // never reads a stale sessionStorage value during the render after login.
  const [sessionOpenedAt, setSessionOpenedAtState] = useState<number | null>(() => {
    try {
      const v = sessionStorage.getItem('sessionOpenedAt');
      if (!v) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    } catch { return null; }
  });

  const setSessionOpenedAt = (ts: number | null) => {
    if (ts === null) {
      sessionStorage.removeItem('sessionOpenedAt');
    } else {
      sessionStorage.setItem('sessionOpenedAt', ts.toString());
    }
    setSessionOpenedAtState(ts);
  };

  // Lock Screen & Shift Resume State
  const [isLocked, setIsLocked] = useState(false);
  const [lockPin, setLockPin] = useState('');
  const [lockError, setLockError] = useState('');
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [pendingLoginResult, setPendingLoginResult] = useState<api.auth.AuthLoginResult | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLockedRef = useRef(isLocked);
  const isRegisterOpenRef = useRef(isRegisterOpen);
  const currentUserRef = useRef(currentUser);

  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { isRegisterOpenRef.current = isRegisterOpen; }, [isRegisterOpen]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const resetIdleTimer = () => {
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    if (!currentUserRef.current || isLockedRef.current || !isRegisterOpenRef.current) return;
    // Lock after 5 minutes of inactivity
    idleTimeoutRef.current = setTimeout(() => setIsLocked(true), 5 * 60 * 1000);
  };

  useEffect(() => {
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer);
    resetIdleTimer();
    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    // Silent token refresh heartbeat (every 10 minutes)
    if (!currentUser || !isRegisterOpen) return;
    const interval = setInterval(() => {
      api.auth.heartbeat().catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentUser, isRegisterOpen]);

  // Refs so WS event handler always sees current values without re-registering
  const usersRef = useRef(users);
  const activeLocationIdRef = useRef(activeLocationId);
  // Debounce ref: used for storefront cross-tab refresh fallback
  const wsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set of order IDs that were updated asynchronously — cleared when the card is clicked
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<string>>(new Set());
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { activeLocationIdRef.current = activeLocationId; }, [activeLocationId]);

  // ── Role helpers ────────────────────────────────────────────────────────────
  const _isAttendanceMgrRole = (user: User) =>
    (user.role || '').toLowerCase().includes('attendance manager');

  /** Navigate to the user's natural landing page (for excluded-from-attendance users). */
  const _routeToLanding = (user: User) => {
    const perms = (user.permissions || []).map(p => p.toLowerCase());
    const roleName = (user.role || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    const hasPerm = (key: string) => perms.some(p => p.includes(key));
    const hasRole = (key: string) => roleName.includes(key);
    const isCashier = hasRole('cashier') || hasRole('caissier') || hasRole('caissière') || email.includes('caissier');
    const isChef = hasRole('chef') || hasRole('cook') || hasRole('cuisinier') || hasRole('kitchen');
    const isManager = hasRole('manager') || hasRole('gérant') || hasRole('responsable');
    const isAdmin = hasRole('admin') || hasRole('owner') || hasRole('propriétaire');
    if (hasPerm('view_menu') || isCashier || isChef || isManager || isAdmin) navigate('/menu');
    else if (hasPerm('view_orders')) navigate('/orders');
    else if (hasPerm('view_staff') || hasPerm('view_hr') || hasRole('staff') || hasRole('hr')) {
      if (hasPerm('view_staff')) navigate('/settings/team');
      else navigate('/admin/hr');
    } else if (hasPerm('view_settings')) navigate('/settings/branding');
    else if (hasPerm('view_inventory')) navigate('/admin/inventory');
    else navigate('/menu');
  };

  const getOrderFetchParams = () => {
    const openedAtStr = sessionStorage.getItem('sessionOpenedAt');
    if (openedAtStr) {
      const openedAtTime = isNaN(Number(openedAtStr)) ? Date.parse(openedAtStr) : Number(openedAtStr);
      if (!isNaN(openedAtTime)) {
        const d = new Date(openedAtTime);
        d.setHours(d.getHours() - 2);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return { startDate: `${yyyy}-${mm}-${dd}`, date: undefined };
      }
    }
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, startDate: undefined };
  };

  // ── Session restore ────────────────────────────────────────────────────────
  // Strategy:
  //   1. If a cached user exists in localStorage, restore IMMEDIATELY — no spinner,
  //      no network required. This eliminates "random logouts" caused by slow servers,
  //      brief outages, or token refresh hiccups during an active session.
  //   2. Verify the session in the background via me(). On success, refresh the cached
  //      user data. On a genuine 401/403, clear everything and log out.
  //   3. If no cache exists (first device), fall back to fetching me() with a 5s
  //      timeout so a dead backend never leaves the spinner up forever.
  //   4. Schedule an AudioContext unlock on the first user interaction so that
  //      notification sounds work immediately after a page reload (the AudioContext
  //      is suspended until a gesture occurs, and handleLogin is never called on reload).
  const SESSION_CACHE_KEY = 'zenpos_session_user';

  const _scheduleAudioUnlock = () => {
    const unlock = () => { unlockAudio(); };
    document.addEventListener('click',      unlock, { once: true, capture: true });
    document.addEventListener('keydown',    unlock, { once: true, capture: true });
    document.addEventListener('touchstart', unlock, { once: true, capture: true });
  };

  const _finishSetup = async (u: User, cancelled: { v: boolean }) => {
    if (cancelled.v) return;
    setCurrentUser(u);
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(u));
    
    // Sync register session from user data if present
    if (u.register_session?.opened_at) {
      const ts = Number(u.register_session.opened_at);
      setSessionOpenedAt(isNaN(ts) ? Date.now() : ts);
      setIsRegisterOpen(true);
    } else if (sessionStorage.getItem('sessionOpenedAt')) {
      setIsRegisterOpen(true);
    }
    
    _scheduleAudioUnlock();

    if (_isAttendanceMgrRole(u)) { navigate('/attendance'); return; }

    if (!u.excludeFromAttendance) {
      try {
        const isCheckedIn = await api.attendance.getUserStatus(u.id);
        if (!cancelled.v && !sessionStorage.getItem('sessionOpenedAt')) {
          setIsRegisterOpen(isCheckedIn);
        }
        if (!cancelled.v && !isCheckedIn && !sessionStorage.getItem('sessionOpenedAt')) {
          navigate('/attendance');
        }
      } catch {
        if (!cancelled.v) { setIsRegisterOpen(false); navigate('/attendance'); }
      }
    } else {
      if (!cancelled.v && (location.pathname === '/' || location.pathname === '/admin')) {
        _routeToLanding(u);
      }
    }
  };

  useEffect(() => {
    const token = api.getAccessToken();
    if (!token) { setIsAuthLoading(false); return; }

    const cancelled = { v: false };

    // Try to restore from localStorage cache
    let cached: User | null = null;
    try {
      const raw = localStorage.getItem(SESSION_CACHE_KEY);
      if (raw) cached = JSON.parse(raw) as User;
    } catch { localStorage.removeItem(SESSION_CACHE_KEY); }

    if (cached) {
      // Instant restore — no spinner, no waiting for the network
      _finishSetup(cached, cancelled).finally(() => {
        if (!cancelled.v) setIsAuthLoading(false);
      });

      // Background verify: refresh user data, or log out on genuine 401
      api.auth.me()
        .then(fresh => {
          if (!cancelled.v) {
            const u = fresh as User;
            setCurrentUser(u);
            localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(u));
            
            // Background sync of register session
            if (u.register_session?.opened_at) {
              sessionStorage.setItem('sessionOpenedAt', u.register_session.opened_at);
              setIsRegisterOpen(true);
            } else if (!u.register_session) {
              // If backend says no session, but we thought there was one, clear it?
              // Only if it's a genuine "closed" state.
              // For now, trust the session storage if it exists to be safe against glitches.
            }
          }
        })
        .catch(err => {
          if (!cancelled.v) {
            const is401 = err.message?.includes('401') || err.status === 401 || err.message?.includes('403');
            if (is401) {
              api.clearTokens();
              localStorage.removeItem(SESSION_CACHE_KEY);
              setCurrentUser(null);
            }
            // Network errors / server down: keep the cached user — do NOT log out.
          }
        });
    } else {
      // No cache (first load on a new device or after storage was cleared).
      // Race with 5s timeout so the spinner doesn't hang forever on a dead server.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('auth_timeout')), 5000)
      );
      Promise.race([api.auth.me(), timeout])
        .then(async user => { if (!cancelled.v) await _finishSetup(user as User, cancelled); })
        .catch(err => {
          if (!cancelled.v) {
            const is401 = err.message?.includes('401') || err.status === 401;
            if (is401) { api.clearTokens(); localStorage.removeItem(SESSION_CACHE_KEY); }
            // Timeout or network error with no cache: fall through to login screen.
          }
        })
        .finally(() => { if (!cancelled.v) setIsAuthLoading(false); });
    }

    return () => { cancelled.v = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load branding once on mount (no auth required — public config)
  useEffect(() => {
    api.settings.getBranding().then(setBranding).catch(() => {});
  }, []);

  // Apply brand colors as CSS variables so all Tailwind color utilities update live
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', branding.primaryColor);
    root.style.setProperty('--color-secondary', branding.secondaryColor);
    root.style.setProperty('--color-tertiary', branding.accentColor);
    
    // Update document title
    document.title = branding.metaTitle || branding.restaurantName || 'ZEN POS';
  }, [branding]);

  // Load locations once logged in (needed for TopBar switcher)
  useEffect(() => {
    if (!currentUser) return;
    api.locations.listLocations().then(setLocations).catch(console.error);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket: connect on login, disconnect on logout
  useEffect(() => {
    if (!currentUser) {
      zenWs.disconnect();
      return;
    }
    const token = api.getAccessToken();
    if (token) zenWs.connect(token);

    const SILENT_EVENTS = new Set(['product_update', 'user_update', 'ingredient_update', 'customer_update']);

    const unsub = zenWs.onEvent((event: WsEvent) => {
      const isSilent = SILENT_EVENTS.has(event.type);
      const notif: AppNotification = {
        id: `${Date.now()}-${Math.random()}`,
        type: event.type as AppNotification['type'],
        title: _notifTitle(event),
        message: event.message || '',
        order_number: event.order_number,
        order_id: event.order_id,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      };
      if (!isSilent) setNotifications(prev => [notif, ...prev].slice(0, 50));

      // Per-order async update — fetch and splice the updated order into the list
      const ORDER_EVENTS = new Set(['new_order', 'order_update', 'status_update', 'urgent', 'order_done']);
      if (ORDER_EVENTS.has(event.type) && currentUser?.permissions.includes('view_orders')) {
        const oid = event.order_id || event.id;
        if (oid) {
          api.orders.getOrder(oid, usersRef.current).then(updated => {
            setOrders(prev => {
              const idx = prev.findIndex(o => o.id === oid);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                return next;
              }
              return [updated, ...prev];
            });
            setRecentlyUpdatedIds(prev => new Set([...prev, oid]));
          }).catch(console.error);
        }
      }

      // Toast pop-up and sounds only for staff-facing events
      if (!isSilent) {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast(notif);
        toastTimerRef.current = setTimeout(() => setToast(null), 4000);

        if (event.type === 'new_order' || (event.type === 'order_update' && (event as any).action === 'created')) {
          playSound('new_order');
        }
        else if (event.type === 'urgent') playSound('urgent');
        else if (event.type === 'status_update' && event.status === 'Done') playSound('status_done');
        else if (event.type === 'status_update' && event.status === 'Served') playSound('ready');
      }
    });

    // Re-fetch all orders whenever the WS reconnects after a drop, so we catch
    // up on any events that arrived during the disconnected gap.
    const unsubReconnect = zenWs.onReconnect(() => {
      if (!currentUser?.permissions.includes('view_orders')) return;
      const params = getOrderFetchParams();
      api.orders.listOrders(usersRef.current, params.date, activeLocationIdRef.current ?? undefined, params.startDate)
        .then(setOrders)
        .catch(console.error);
    });

    return () => { unsub(); unsubReconnect(); };
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback notification path for storefront orders when the backend WS is unavailable.
  // Two channels are used so it works regardless of same-tab vs cross-tab:
  //   1. `zenpos:new_order` CustomEvent  — fired by the storefront in the SAME window
  //   2. `storage` event on localStorage — fired in OTHER tabs when the storefront writes
  useEffect(() => {
    if (!currentUser) return;

    const fireNotification = (orderNumber: string, customerName: string) => {
      const notif: AppNotification = {
        id: `local-${Date.now()}-${Math.random()}`,
        type: 'new_order',
        title: `New Online Order ${orderNumber}`,
        message: customerName ? `From ${customerName} — needs verification` : 'Needs verification',
        order_number: orderNumber,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      };
      setNotifications(prev => [notif, ...prev].slice(0, 50));
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(notif);
      toastTimerRef.current = setTimeout(() => setToast(null), 4000);
      playSound('new_order');
    };

    const refreshOrders = () => {
      if (currentUser.permissions.includes('view_orders')) {
        if (wsRefreshTimerRef.current) clearTimeout(wsRefreshTimerRef.current);
        const params = getOrderFetchParams();
        wsRefreshTimerRef.current = setTimeout(() => {
          api.orders.listOrders(
            usersRef.current,
            params.date,
            activeLocationIdRef.current ?? undefined,
            params.startDate
          ).then(setOrders).catch(console.error);
        }, 300);
      }
    };

    // Same-tab: storefront dispatches this event directly
    const onCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { orderId?: string; orderNumber?: string; customerName?: string } | undefined;
      fireNotification(detail?.orderNumber ?? '', detail?.customerName ?? '');
      const oid = detail?.orderId;
      if (oid && currentUser?.permissions.includes('view_orders')) {
        api.orders.getOrder(oid, usersRef.current).then(updated => {
          setOrders(prev => {
            const idx = prev.findIndex(o => o.id === oid);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            return [updated, ...prev];
          });
          setRecentlyUpdatedIds(prev => new Set([...prev, oid]));
        }).catch(console.error);
      } else {
        refreshOrders();
      }
    };

    // Cross-tab: storefront wrote to localStorage in another browser tab
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'zenpos_mock_online_orders') return;
      // Diff old vs new to find newly added orders
      try {
        const prev: { id: string; order_number?: string; customer?: { name?: string } }[] =
          e.oldValue ? JSON.parse(e.oldValue) : [];
        const next: { id: string; order_number?: string; customer?: { name?: string } }[] =
          e.newValue ? JSON.parse(e.newValue) : [];
        const prevIds = new Set(prev.map(o => o.id));
        const newOrders = next.filter(o => !prevIds.has(o.id));
        newOrders.forEach(o =>
          fireNotification(o.order_number ?? '', o.customer?.name ?? '')
        );
        if (newOrders.length > 0) refreshOrders();
      } catch {
        refreshOrders(); // fallback: just refresh without notification detail
      }
    };

    window.addEventListener('zenpos:new_order', onCustomEvent);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('zenpos:new_order', onCustomEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load users first, then orders once — avoids the double-fetch where orders
  // were called immediately with an empty users array and then again after users loaded.
  useEffect(() => {
    if (!currentUser) return;
    const canOrders = hasPermission('view_orders');
    const canStaff  = hasPermission('view_staff');

    const params = getOrderFetchParams();
    
    // Fetch users if we can manage staff OR if we need them to assign cooks in OrdersView
    if (canStaff || canOrders) {
      api.users.listUsers().then(u => {
        setUsers(u);
        if (canOrders) {
          api.orders.listOrders(u, params.date, activeLocationId ?? undefined, params.startDate).then(setOrders).catch(console.error);
        }
      }).catch(console.error);
    } else if (canOrders) {
      // Fallback (though canOrders is covered above, keeping for clarity if logic changes)
      api.orders.listOrders([], params.date, activeLocationId ?? undefined, params.startDate).then(setOrders).catch(console.error);
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch orders when admin switches location filter or logs in
  useEffect(() => {
    if (!currentUser || !currentUser.permissions.includes('view_orders')) return;
    const params = getOrderFetchParams();
    api.orders.listOrders(usersRef.current, params.date, activeLocationId ?? undefined, params.startDate).then(setOrders).catch(console.error);
  }, [activeLocationId, currentUser]);

  // Repeat new-order sound every 30 s while unverified online orders exist
  const pendingVerificationOrders = orders.filter(o => o.status === 'Verification');
  const hasPendingVerification = pendingVerificationOrders.length > 0;
  useEffect(() => {
    if (!hasPendingVerification || !currentUser) return;
    // Ring every 3 seconds for unverified orders
    playSound('new_order'); // start immediately
    const id = setInterval(() => playSound('new_order'), 3_000);
    return () => clearInterval(id);
  }, [hasPendingVerification, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verify-card popup (for bottom-left persistent cards)
  const [verifyCardOrder, setVerifyCardOrder] = useState<Order | null>(null);
  const [verifyCardLoading, setVerifyCardLoading] = useState<'queue' | 'cancel' | null>(null);

  const handleVerifyCardAction = async (action: 'queue' | 'cancel') => {
    if (!verifyCardOrder) return;
    setVerifyCardLoading(action);
    try {
      const newStatus = action === 'queue' ? 'Queued' : 'Cancelled';
      const updated = await api.orders.updateOrderStatus(verifyCardOrder.id, newStatus);
      setOrders(prev => prev.map(o => o.id === verifyCardOrder!.id ? updated : o));
      setVerifyCardOrder(null);
    } catch (err: any) {
      console.error('Verify from card failed:', err.message);
    } finally {
      setVerifyCardLoading(null);
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!currentUser) return false;
    return currentUser.permissions.includes(permission);
  };

  // Derive "currentView" from URL so layout components stay in sync
  const currentView = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith('/settings')) return 'pos_settings';
    if (p.startsWith('/admin')) return 'admin_panel';
    const seg = p.replace(/^\//, '') || 'menu';
    return seg;
  }, [location.pathname]);

  // Derive active sidebar section from URL (e.g. /admin/team → 'team')
  const currentSetting = useMemo(() => {
    const segs = location.pathname.split('/');
    return segs[2] || (currentView === 'pos_settings' ? 'branding' : 'sales');
  }, [location.pathname, currentView]);

  // Navigation helpers (same API as the old setState calls)
  const setCurrentView = (view: string) => {
    if (view === 'pos_settings') navigate('/settings/branding');
    else if (view === 'admin_panel') navigate('/admin/sales');
    else navigate('/' + view);
  };

  const setCurrentSetting = (section: string) => {
    if (section === 'attendance') navigate('/attendance');
    else if (currentView === 'pos_settings') navigate('/settings/' + section);
    else navigate('/admin/' + section);
  };

  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const _finalizeLogin = (user: User, registerSession?: any) => {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    const openedTs = registerSession?.opened_at ? Number(registerSession.opened_at) : Date.now();
    if (registerSession) {
      sessionStorage.setItem('zenpos_register_session', JSON.stringify(registerSession));
    }
    setSessionOpenedAt(isNaN(openedTs) ? Date.now() : openedTs);
    unlockAudio(); // Unlock AudioContext — login IS a user gesture
    setCurrentUser(user);
    setIsLocked(false);

    // Attendance Manager: locked to attendance screen, no exit
    if (_isAttendanceMgrRole(user)) {
      navigate('/attendance');
      return;
    }

    // All non-excluded roles must check in before accessing the POS
    if (!user.excludeFromAttendance) {
      if (registerSession && registerSession.opened_at) {
        // If resuming shift, skip attendance check-in gate
        setIsRegisterOpen(true);
        _routeToLanding(user);
      } else {
        setIsRegisterOpen(false);
        navigate('/attendance');
      }
      return;
    }

    _routeToLanding(user);
  };

  const handleLogin = (result: api.auth.AuthLoginResult) => {
    if (result.resumable) {
      setPendingLoginResult(result);
      setShowResumeModal(true);
      return;
    }
    _finalizeLogin(result.user, result.registerSession);
  };

  const handleResumeShift = (resume: boolean) => {
    if (!pendingLoginResult) return;
    setShowResumeModal(false);
    if (resume) {
      _finalizeLogin(pendingLoginResult.user, pendingLoginResult.registerSession);
    } else {
      // Force start new shift
      _finalizeLogin(pendingLoginResult.user, { opened_at: null });
    }
    setPendingLoginResult(null);
  };


  const handleLogout = () => {
    api.auth.logout().catch(console.error);
    localStorage.removeItem(SESSION_CACHE_KEY);
    setSessionOpenedAt(null);
    sessionStorage.removeItem('zenpos_register_session');
    setCurrentUser(null);
    setOrders([]);
    setRecentlyUpdatedIds(new Set());
    setUsers([]);
    setCart([]);
    setNotifications([]);
    try { localStorage.removeItem(NOTIF_STORAGE_KEY); } catch {}
    setIsRegisterOpen(false);
    navigate('/admin');
  };

  /**
   * Called when the cashier confirms "Close Register".
   * Saves the register report into localStorage so we can display it later.
   * Force-checks out the currently logged-in user (if not excluded from attendance),
   * then navigates to the attendance screen.
   */
  const handleCloseRegister = async (reportData?: Omit<RegisterReport, 'id'>) => {
    if (reportData) {
      try {
        await api.register.submitRegisterReport({
          ...reportData,
          locationId: reportData.locationId || activeLocationId || undefined
        });
      } catch (err) {
        console.error('Failed to submit register report', err);
      }
    }

    setSessionOpenedAt(null);
    sessionStorage.removeItem('zenpos_register_session');
    setOrders([]);
    setNotifications([]);
    try { localStorage.removeItem(NOTIF_STORAGE_KEY); } catch {}
    // Do NOT clear SESSION_CACHE_KEY here — closing register is not a logout.
    // The user stays authenticated; they just check out and go to attendance screen.

    if (currentUser && !currentUser.excludeFromAttendance) {
      try { await api.attendance.forceCheckOut(currentUser.id); } catch { /* already checked out is fine */ }
    }
    setIsRegisterOpen(false);
    navigate('/attendance');
  };

  const addToCart = (
    product: Product,
    selectedVariations?: Record<string, VariationOption>,
    selectedSupplements?: Record<string, SupplementOption> // Added
  ) => {
    setCart(prev => {
      const variationsString = selectedVariations
        ? Object.entries(selectedVariations).sort(([k1], [k2]) => k1.localeCompare(k2)).map(([k, v]) => `${k}:${v.id}`).join('|')
        : '';
      const supplementsString = selectedSupplements
        ? Object.entries(selectedSupplements).sort(([k1], [k2]) => k1.localeCompare(k2)).map(([k, v]) => `${k}:${v.id}`).join('|')
        : '';
      const cartItemId = `${product.id}${variationsString ? `|v:${variationsString}` : ''}${supplementsString ? `|s:${supplementsString}` : ''}`;
      const existing = prev.find(item => item.cartItemId === cartItemId);
      if (existing) {
        return prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, cartItemId, quantity: 1, selectedVariations, selectedSupplements } as any];
    });
  };

  const handleStartEditing = (order: Order) => {
    setCart(order.items);
    setEditingOrderObj(order);
    navigate('/menu');
    setIsCartOpen(true);
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemId === cartItemId) {
        const newQuantity = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const updateCartItem = (cartItemId: string, updates: Partial<CartItem>) => {
    setCart(prev => prev.map(item => item.cartItemId === cartItemId ? { ...item, ...updates } : item));
  };

  const handleEditOrder = (order: Order) => {
    handleStartEditing(order);
  };

  const clearCart = () => {
    setCart([]);
    setEditingOrderObj(null);
  };

  const handleOrderCreated = (newOrder: Order) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === newOrder.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = newOrder;
        return next;
      }
      return [newOrder, ...prev];
    });
    setEditingOrderObj(null);
  };

  const refreshOrders = (date?: string, startDate?: string, endDate?: string) => {
    api.orders.listOrders(users, date, activeLocationId ?? undefined, startDate, endDate).then(setOrders).catch(console.error);
  };

  // ── Public ordering routes (no auth required) ─────────────────────────────────
  const PUBLIC_PATHS = ['/', '/checkout', '/history'];
  const isPublicPath = PUBLIC_PATHS.includes(location.pathname) || location.pathname.startsWith('/track/');
  if (isPublicPath) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AppSpinner />}>
          <PublicCartProvider>
            <Routes>
              <Route path="/" element={<PublicMenuPage />} />
              <Route path="/checkout" element={<PublicMenuPage />} />
              <Route path="/history" element={<PublicMenuPage />} />
              <Route path="/track/:token" element={<PublicMenuPage />} />
            </Routes>
          </PublicCartProvider>
        </Suspense>
      </ErrorBoundary>
    );
  }


  if (isAuthLoading) return <AppSpinner />;

  // ── Unauthenticated: show login page ─────────────────────────────────────────
  if (!currentUser) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminLoginView onLogin={handleLogin} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

  // ── Authenticated main layout ─────────────────────────────────────────────────
  const isAttendance = currentView === 'attendance';
  const showSidebar = (currentView === 'pos_settings' || currentView === 'admin_panel') && !isAttendance;

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div
        className={`flex flex-col h-full overflow-hidden text-on-surface pb-20 lg:pb-0 transition-all duration-500 ease-in-out ${
          isProfileOpen ? 'blur-xl scale-[0.96] opacity-40 pointer-events-none' : 'blur-0 scale-100 opacity-100'
        }`}
      >
        {!isAttendance && (
          <TopBar
            currentView={currentView}
            setCurrentView={setCurrentView}
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            currentUser={currentUser}
            hasPermission={hasPermission}
            restaurantName={branding.restaurantName}
            restaurantLogo={branding.logo}
            locations={locations}
            activeLocationId={activeLocationId}
            notifications={notifications}
            onClearNotification={clearNotification}
            onMarkAllRead={markAllRead}
          />
        )}

        <div className="flex-1 flex overflow-hidden">
          {showSidebar && (
            <Sidebar
              type={currentView as 'pos_settings' | 'admin_panel'}
              currentSetting={currentSetting}
              setCurrentSetting={setCurrentSetting}
              hasPermission={hasPermission}
            />
          )}

          <main className="flex-1 flex flex-col overflow-hidden relative">
            <ErrorBoundary>
            <Suspense fallback={<AppSpinner />}>
              <Routes>
                <Route path="/admin" element={<Navigate to="/menu" replace />} />

                <Route path="/menu" element={
                  hasPermission('view_menu')
                    ? <MenuView addToCart={addToCart} />
                    : <AccessDenied />
                } />

                <Route path="/orders" element={
                  hasPermission('view_orders')
                    ? <OrdersView
                        orders={orders}
                        setOrders={setOrders}
                        cart={cart}
                        onEditOrder={handleEditOrder}
                        users={users}
                        onRefresh={refreshOrders}
                        branding={branding}
                        recentlyUpdatedIds={recentlyUpdatedIds}
                        onClearRecentlyUpdated={(id) => setRecentlyUpdatedIds(prev => { const next = new Set(prev); next.delete(id); return next; })}
                        hasPermission={hasPermission}
                      />
                    : <AccessDenied />
                } />

                <Route path="/attendance" element={
                  (hasPermission('view_attendance') || (!!currentUser && !currentUser.excludeFromAttendance))
                    ? <AttendanceView
                        setCurrentView={setCurrentView}
                        onLogout={handleLogout}
                        isKioskForever={!!currentUser && _isAttendanceMgrRole(currentUser)}
                        isLocked={!!currentUser && !currentUser.excludeFromAttendance && !isRegisterOpen}
                        currentUserId={currentUser?.id}
                        onCurrentUserCheckedIn={() => {
                          // Fetch fresh user data to sync register_session from backend
                          api.auth.me().then(fresh => {
                            setCurrentUser(fresh);
                            localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(fresh));
                            const ts = fresh.register_session?.opened_at
                              ? Number(fresh.register_session.opened_at)
                              : Date.now();
                            setSessionOpenedAt(isNaN(ts) ? Date.now() : ts);
                            setIsRegisterOpen(true);
                            _routeToLanding(fresh);
                          }).catch(() => {
                            setSessionOpenedAt(Date.now());
                            setIsRegisterOpen(true);
                            _routeToLanding(currentUser!);
                          });
                        }}
                      />
                    : <AccessDenied />
                } />

                <Route path="/settings/:section" element={
                  <SettingsView currentSetting={currentSetting} hasPermission={hasPermission} branding={branding} onBrandingUpdate={setBranding} currentUser={currentUser ?? undefined} onUserUpdate={u => setCurrentUser(u)} />
                } />

                <Route path="/admin/:section" element={
                  <SettingsView currentSetting={currentSetting} hasPermission={hasPermission} branding={branding} onBrandingUpdate={setBranding} currentUser={currentUser ?? undefined} onUserUpdate={u => setCurrentUser(u)} />
                } />

                <Route path="*" element={<Navigate to="/menu" replace />} />
              </Routes>
            </Suspense>
            </ErrorBoundary>

            <VirtualKeyboard />
          </main>

          {currentView === 'menu' && hasPermission('view_menu') && (
            <>
              <CartFloatingAction cart={cart} onOpen={() => setIsCartOpen(true)} />
              <CartSidebar
                cart={cart}
                updateQuantity={updateQuantity}
                updateCartItem={updateCartItem}
                isOpen={isCartOpen}
                onClose={() => setIsCartOpen(false)}
                onClearCart={clearCart}
                onOrderCreated={handleOrderCreated}
                branding={branding}
                editingOrder={editingOrder}
              />
            </>
          )}
        </div>

        {!isAttendance && (
          <MobileNav
            currentView={currentView}
            setCurrentView={setCurrentView}
            onOpenCart={() => setIsCartOpen(true)}
            hasPermission={hasPermission}
          />
        )}
      </div>

      <ProfilePanel
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        setCurrentView={setCurrentView}
        setCurrentSetting={setCurrentSetting}
        isLoggedIn={!!currentUser}
        currentUser={currentUser}
        onLogout={handleLogout}
        onCloseRegister={handleCloseRegister}
        onCloseRegisterBlocked={() => {
          setCurrentView('orders');
          setIsProfileOpen(false);
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setToast({
            id: Date.now().toString(),
            type: 'urgent',
            title: 'Active Orders',
            message: 'All orders must be finished before closing the register',
            time: new Date().toISOString(),
            read: false,
          });
          toastTimerRef.current = setTimeout(() => setToast(null), 4000);
        }}
        hasPermission={hasPermission}
        orders={orders}
        locations={locations}
        activeLocationId={activeLocationId}
        setActiveLocationId={setActiveLocationId}
        branding={branding}
        sessionOpenedAt={sessionOpenedAt}
      />

      {/* Toast notification — bottom-right, auto-dismisses */}
      {toast && (
        <div
          className="fixed bottom-24 lg:bottom-6 right-4 left-4 lg:left-auto z-[200] lg:w-80 rounded-xl shadow-2xl overflow-hidden pointer-events-auto"
          style={{ animation: 'slideInRight 0.3s ease-out' }}
        >
          <div className={`flex items-start gap-3 px-4 py-3 ${
            toast.type === 'urgent'
              ? 'bg-error text-on-error'
              : toast.type === 'new_order'
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container text-on-surface'
          }`}>
            <span className="material-symbols-outlined text-xl mt-0.5 shrink-0">
              {toast.type === 'urgent' ? 'priority_high'
               : toast.type === 'new_order' ? 'receipt_long'
               : toast.type === 'order_done' ? 'check_circle'
               : 'notifications'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">{toast.title}</p>
              {toast.message && (
                <p className="text-xs mt-0.5 opacity-80 truncate">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null); }}
              className="opacity-70 hover:opacity-100 shrink-0 -mr-1"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
          {/* Progress bar */}
          <div className={`h-1 ${
            toast.type === 'urgent' ? 'bg-on-error/30' : 'bg-primary/20'
          }`}>
            <div
              className={`h-full ${
                toast.type === 'urgent' ? 'bg-on-error/70' : 'bg-primary'
              }`}
              style={{ animation: 'toastProgress 4s linear forwards' }}
            />
          </div>
        </div>
      )}

      {/* ── Persistent verification cards — bottom-left ──────────────────── */}
      {currentUser && hasPendingVerification && (
        <div className="fixed bottom-6 left-4 z-[190] flex flex-col-reverse gap-2 max-w-[17rem] pointer-events-auto">
          {pendingVerificationOrders.slice(0, 4).map(order => (
            <div
              key={order.id}
              className="bg-surface-container-lowest rounded-2xl shadow-2xl border border-amber-400/40 overflow-hidden"
              style={{ animation: 'slideInLeft 0.25s ease-out' }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant/10 bg-amber-400/5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                  <span className="font-headline font-bold text-sm text-on-surface">{order.orderNumber ?? `#${order.id.slice(-4)}`}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Online</span>
                </div>
                <span className="text-[10px] text-on-surface-variant tabular-nums">
                  {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (order.time || '')}
                </span>
              </div>
              {/* Customer + summary */}
              <div className="px-4 py-2.5">
                <p className="text-sm font-semibold text-on-surface leading-tight">{order.customer?.name || '—'}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {order.items.length} item{order.items.length !== 1 ? 's' : ''} · {formatCurrency(order.total)}
                </p>
              </div>
              {/* Verify button */}
              <div className="px-4 pb-2.5">
                <button
                  onClick={() => {
                    setVerifyCardOrder(order);
                    setRecentlyUpdatedIds(prev => {
                      const next = new Set(prev);
                      next.delete(order.id);
                      return next;
                    });
                  }}
                  className="w-full py-2 bg-primary text-on-primary rounded-xl text-[11px] font-bold uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-primary/30"
                >
                  <span className="material-symbols-outlined text-sm">call</span>
                  Verify Order
                </button>
              </div>
            </div>
          ))}
          {pendingVerificationOrders.length > 4 && (
            <p className="text-[10px] text-center text-on-surface-variant py-1">
              +{pendingVerificationOrders.length - 4} more pending
            </p>
          )}
        </div>
      )}

      {/* ── Verify-card popup ────────────────────────────────────────────── */}
      {verifyCardOrder && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !verifyCardLoading && setVerifyCardOrder(null)} />
          <div className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-2xl">call</span>
                </div>
                <div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">Verify Order</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">{verifyCardOrder.orderNumber} · Online</p>
                  {verifyCardOrder.createdAt && (
                    <p className="text-xs text-on-surface-variant/60 mt-0.5 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">schedule</span>
                      {new Date(verifyCardOrder.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
              {/* Customer */}
              <div className="bg-surface-container rounded-xl p-4 mb-4 space-y-2">
                <p className="text-sm font-semibold text-on-surface">{verifyCardOrder.customer?.name ?? '—'}</p>
                <a
                  href={`tel:${verifyCardOrder.customer?.phone}`}
                  className="flex items-center gap-2 text-primary font-bold text-lg tracking-wide hover:opacity-80 transition-opacity"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="material-symbols-outlined text-xl">call</span>
                  {verifyCardOrder.customer?.phone ?? '—'}
                </a>
                {verifyCardOrder.customer?.address && (
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">location_on</span>
                    {verifyCardOrder.customer.address}
                  </p>
                )}
              </div>
              {/* Items */}
              <div className="space-y-1 mb-2">
                {verifyCardOrder.items.map((item, i) => {
                  const varNames = Object.values(item.selectedVariations || {}).map((v: any) => v.name).join(' · ');
                  const suppNames = Object.values(item.selectedSupplements || {}).map((s: any) => `+${s.name}`).join(' · ');
                  const mods = [varNames, suppNames].filter(Boolean).join(' | ');
                  return (
                    <div key={i} className="flex flex-col gap-0.5">
                      <div className="flex justify-between text-xs text-on-surface-variant">
                        <span>{item.quantity}× {item.name}</span>
                        <span>{formatCurrency(getCartItemPrice(item) * item.quantity)}</span>
                      </div>
                      {mods && <p className="text-[10px] text-on-surface-variant/70 italic ml-4">{mods}</p>}
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm font-bold text-on-surface border-t border-outline-variant/20 pt-2 mt-2">
                  <span>Total</span>
                  <span>{formatCurrency(verifyCardOrder.total)}</span>
                </div>
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-col gap-2 p-4 pt-0">
              <button
                onClick={() => handleVerifyCardAction('queue')}
                disabled={verifyCardLoading !== null}
                className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {verifyCardLoading === 'queue'
                  ? <span className="material-symbols-outlined animate-spin">sync</span>
                  : <><span className="material-symbols-outlined text-sm">queue_play_next</span>Add to Queue</>}
              </button>
              <button
                onClick={() => handleVerifyCardAction('cancel')}
                disabled={verifyCardLoading !== null}
                className="w-full py-3 bg-error/10 text-error rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-error/20 transition-colors disabled:opacity-50"
              >
                {verifyCardLoading === 'cancel'
                  ? <span className="material-symbols-outlined animate-spin">sync</span>
                  : <><span className="material-symbols-outlined text-sm">cancel</span>Cancel Order</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Resume Shift Modal ────────────────────────────────────────────── */}
      {showResumeModal && pendingLoginResult && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-surface-container-lowest rounded-2xl p-8 max-w-md w-full shadow-2xl border border-outline-variant/10 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-3xl">resume</span>
            </div>
            <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">Active Shift Detected</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              You have an active register session that was not closed. Do you want to resume this shift or start a new one?
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleResumeShift(true)}
                className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined">play_arrow</span>
                Resume Shift
              </button>
              <button
                onClick={() => handleResumeShift(false)}
                className="w-full py-4 bg-surface-container text-on-surface rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined">restart_alt</span>
                Start New Shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lock Screen Overlay ─────────────────────────────────────────── */}
      {isLocked && currentUser && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md pointer-events-auto">
          <div className="bg-surface-container-lowest rounded-3xl p-10 max-w-md w-full shadow-2xl border border-outline-variant/10">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-full bg-surface-container-high text-on-surface mx-auto mb-4 flex items-center justify-center shadow-inner overflow-hidden">
                {currentUser.image ? (
                  <img src={currentUser.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold">{currentUser.name.charAt(0)}</span>
                )}
              </div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-1">{currentUser.name}</h2>
              <p className="text-xs font-bold text-primary uppercase tracking-widest">Session Locked</p>
            </div>
            
            <div className="space-y-6">
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 ${lockPin.length > i ? 'bg-primary border-primary' : 'border-outline-variant/30'}`} />
                ))}
              </div>
              {lockError && (
                <p className="text-center text-[10px] font-bold text-error uppercase tracking-widest">{lockError}</p>
              )}
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    onClick={async () => {
                      if (lockPin.length < 4) {
                        const newPin = lockPin + num;
                        setLockPin(newPin);
                        if (newPin.length === 4) {
                          const isValid = await api.users.verifyPin(newPin);
                          if (isValid) {
                            setIsLocked(false);
                            setLockPin('');
                            setLockError('');
                            resetIdleTimer();
                          } else {
                            setLockError('Invalid PIN');
                            setTimeout(() => setLockPin(''), 500);
                          }
                        }
                      }
                    }}
                    className="aspect-square rounded-2xl bg-surface-container text-on-surface text-xl font-bold hover:bg-surface-container-high active:bg-primary/20 transition-colors flex items-center justify-center"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={() => handleLogout()}
                  className="aspect-square rounded-2xl bg-error/10 text-error text-sm font-bold uppercase tracking-widest hover:bg-error/20 active:bg-error/30 transition-colors flex flex-col items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined">logout</span>
                  <span className="text-[9px]">Exit</span>
                </button>
                <button
                  onClick={async () => {
                    if (lockPin.length < 4) {
                      const newPin = lockPin + '0';
                      setLockPin(newPin);
                      if (newPin.length === 4) {
                        const isValid = await api.users.verifyPin(newPin);
                        if (isValid) {
                          setIsLocked(false);
                          setLockPin('');
                          setLockError('');
                          resetIdleTimer();
                        } else {
                          setLockError('Invalid PIN');
                          setTimeout(() => setLockPin(''), 500);
                        }
                      }
                    }
                  }}
                  className="aspect-square rounded-2xl bg-surface-container text-on-surface text-xl font-bold hover:bg-surface-container-high active:bg-primary/20 transition-colors flex items-center justify-center"
                >
                  0
                </button>
                <button
                  onClick={() => setLockPin(prev => prev.slice(0, -1))}
                  className="aspect-square rounded-2xl bg-surface-container text-on-surface hover:bg-surface-container-high active:bg-primary/20 transition-colors flex items-center justify-center"
                >
                  <span className="material-symbols-outlined">backspace</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function _notifTitle(event: WsEvent): string {
  switch (event.type) {
    case 'new_order':    return `New Online Order ${event.order_number || ''}`;
    case 'order_update': 
      return (event as any).action === 'created' 
        ? `New Order ${event.order_number || ''}` 
        : `Order ${event.order_number || ''} Updated`;
    case 'urgent':       return `Urgent: ${event.order_number || ''}`;
    case 'status_update':return `Order ${event.order_number || ''} — ${event.status || ''}`;
    case 'order_done':   return `Order ${event.order_number || ''} Completed`;
    case 'attendance_update': return 'Attendance Update';
    default:             return 'Notification';
  }
}

function AppSpinner() {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <span className="material-symbols-outlined text-4xl text-primary animate-spin">sync</span>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex-1 flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <span className="material-symbols-outlined text-6xl text-error mb-4">lock</span>
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-on-surface-variant">You do not have permission to view this page.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <LocalizationProvider>
      <AppShell />
    </LocalizationProvider>
  );
}
