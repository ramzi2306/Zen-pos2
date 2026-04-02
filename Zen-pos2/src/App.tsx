import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, TopBar, CartSidebar, MobileNav, CartFloatingAction, ProfilePanel } from './components/Layout';
import { AdminLoginView } from './views/AdminLoginView';

// Heavy views are lazy-loaded so cashiers/chefs never download the admin bundle
const MenuView       = lazy(() => import('./views/MenuView').then(m => ({ default: m.MenuView })));
const OrdersView     = lazy(() => import('./views/OrdersView').then(m => ({ default: m.OrdersView })));
const SettingsView   = lazy(() => import('./views/AdminViews').then(m => ({ default: m.SettingsView })));
const AttendanceView = lazy(() => import('./views/AttendanceView').then(m => ({ default: m.AttendanceView })));
const PublicMenuPage = lazy(() => import('./views/public/PublicMenuPage'));
import { PublicCartProvider } from './context/PublicCartContext';
import { Product, CartItem, VariationOption, Order, User, Permission } from './data';
import { BrandingData, DEFAULT_BRANDING } from './api/settings';
import { LocalizationProvider } from './context/LocalizationContext';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { zenWs, WsEvent } from './api/websocket';
import { playSound, unlockAudio } from './utils/sounds';
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
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [branding, setBranding] = useState<BrandingData>(DEFAULT_BRANDING);
  const [locations, setLocations] = useState<import('./api/locations').Location[]>([]);
  // Admin/owner can switch active location filter; null = see all
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs so WS event handler always sees current values without re-registering
  const usersRef = useRef(users);
  const activeLocationIdRef = useRef(activeLocationId);
  // Debounce ref: rapid WS events collapse into a single listOrders fetch
  const wsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { activeLocationIdRef.current = activeLocationId; }, [activeLocationId]);

  // Restore session on mount — race against a 5s timeout so a dead backend
  // never leaves the app stuck on the loading spinner indefinitely.
  // A `cancelled` flag prevents stale responses from updating state after
  // the timeout fires and clears tokens.
  useEffect(() => {
    const token = api.getAccessToken();
    if (!token) { setIsAuthLoading(false); return; }

    let cancelled = false;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('auth_timeout')), 5000)
    );

    Promise.race([api.auth.me(), timeout])
      .then(user => {
        if (cancelled) return;
        setCurrentUser(user as User);
        if (location.pathname === '/' || (location.pathname === '/menu' && !(user as User).permissions.includes('view_menu'))) {
          setTimeout(() => handleLogin(user as User), 0);
        }
      })
      .catch(() => { if (!cancelled) api.clearTokens(); })
      .finally(() => { if (!cancelled) setIsAuthLoading(false); });

    return () => { cancelled = true; };
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

    const unsub = zenWs.onEvent((event: WsEvent) => {
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
      setNotifications(prev => [notif, ...prev].slice(0, 50));

      // Debounced order refresh — collapses rapid WS events into one fetch
      if (currentUser?.permissions.includes('view_orders')) {
        if (wsRefreshTimerRef.current) clearTimeout(wsRefreshTimerRef.current);
        wsRefreshTimerRef.current = setTimeout(() => {
          api.orders.listOrders(
            usersRef.current,
            undefined,
            activeLocationIdRef.current ?? undefined,
          ).then(setOrders).catch(console.error);
        }, 300);
      }

      // Toast pop-up (auto-dismiss after 4 s)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(notif);
      toastTimerRef.current = setTimeout(() => setToast(null), 4000);

      // Play the right sound
      if (event.type === 'new_order') playSound('new_order');
      else if (event.type === 'urgent') playSound('urgent');
      else if (event.type === 'status_update' && event.status === 'Done') playSound('status_done');
      else if (event.type === 'status_update' && event.status === 'Served') playSound('ready');
    });

    return unsub;
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
        wsRefreshTimerRef.current = setTimeout(() => {
          api.orders.listOrders(
            usersRef.current,
            undefined,
            activeLocationIdRef.current ?? undefined,
          ).then(setOrders).catch(console.error);
        }, 300);
      }
    };

    // Same-tab: storefront dispatches this event directly
    const onCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { orderNumber?: string; customerName?: string } | undefined;
      fireNotification(detail?.orderNumber ?? '', detail?.customerName ?? '');
      refreshOrders();
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

    if (canStaff) {
      api.users.listUsers().then(u => {
        setUsers(u);
        if (canOrders) {
          api.orders.listOrders(u, undefined, activeLocationId ?? undefined).then(setOrders).catch(console.error);
        }
      }).catch(console.error);
    } else if (canOrders) {
      // No staff permission — fetch orders directly (users array stays empty)
      api.orders.listOrders([], undefined, activeLocationId ?? undefined).then(setOrders).catch(console.error);
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch orders when admin switches location filter
  useEffect(() => {
    if (!currentUser || !hasPermission('view_orders')) return;
    api.orders.listOrders(users, undefined, activeLocationId ?? undefined).then(setOrders).catch(console.error);
  }, [activeLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasPermission = (permission: Permission): boolean => {
    if (!currentUser) return false;
    if (currentUser.permissions.includes(permission)) return true;

    // Role/Email-based fallback for critical views
    const roleName = (currentUser.role || '').toLowerCase();
    const email = (currentUser.email || '').toLowerCase();

    // Cashier roles → menu + orders access
    const isCashier = roleName.includes('cashier') || roleName.includes('caissier') || roleName.includes('caissière');
    if (isCashier && (permission === 'view_menu' || permission === 'view_orders')) return true;

    // Manager roles → broad access
    const isManager = roleName.includes('manager') || roleName.includes('gérant') || roleName.includes('responsable');
    if (isManager && (permission === 'view_menu' || permission === 'view_orders' || permission === 'view_staff' || permission === 'view_inventory' || permission === 'view_attendance')) return true;

    // Chef / kitchen roles → menu + orders
    const isChef = roleName.includes('chef') || roleName.includes('cook') || roleName.includes('cuisinier') || roleName.includes('kitchen');
    if (isChef && (permission === 'view_menu' || permission === 'view_orders')) return true;

    // Admin / owner roles → full access
    const isAdmin = roleName.includes('admin') || roleName.includes('owner') || roleName.includes('propriétaire');
    if (isAdmin) return true;

    // Attendance / pointeur roles
    if (permission === 'view_attendance' && (roleName.includes('attendance') || roleName.includes('pointeur') || email.includes('pointeur'))) return true;
    if (permission === 'view_hr' && (roleName.includes('hr') || isManager)) return true;
    if (permission === 'view_staff' && (roleName.includes('staff') || isManager)) return true;
    if (permission === 'view_settings' && isAdmin) return true;

    return false;
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

  const handleLogin = (user: User) => {
    sessionStorage.setItem('sessionOpenedAt', Date.now().toString());
    unlockAudio(); // Unlock AudioContext on first user gesture
    setCurrentUser(user);
    
    // Prioritize landing page based on permissions OR role/email fallbacks
    const perms = (user.permissions || []).map(p => p.toLowerCase());
    const roleName = (user.role || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    
    const hasPerm = (key: string) => perms.some(p => p.includes(key));
    const hasRole = (key: string) => roleName.includes(key);
    const hasEmail = (key: string) => email.includes(key);

    // Cashier / chef / manager role-based fast-paths (even if explicit permissions are empty)
    const isCashier = hasRole('cashier') || hasRole('caissier') || hasRole('caissière');
    const isChef = hasRole('chef') || hasRole('cook') || hasRole('cuisinier') || hasRole('kitchen');
    const isManager = hasRole('manager') || hasRole('gérant') || hasRole('responsable');
    const isAdmin = hasRole('admin') || hasRole('owner') || hasRole('propriétaire');

    if (hasPerm('view_menu') || isCashier || isChef || isManager || isAdmin) {
      navigate('/menu');
    } else if (hasPerm('view_orders')) {
      navigate('/orders');
    } else if (hasPerm('view_attendance') || hasPerm('attendance') || hasRole('attendance') || hasRole('pointeur') || hasEmail('pointeur')) {
      navigate('/attendance');
    } else if (hasPerm('view_staff') || hasPerm('view_hr') || hasRole('staff') || hasRole('hr')) {
      if (hasPerm('view_staff')) navigate('/settings/team');
      else navigate('/admin/hr');
    } else if (hasPerm('view_settings')) {
      navigate('/settings/branding');
    } else if (hasPerm('view_inventory')) {
      navigate('/admin/inventory');
    } else {
      // Absolute fallback: go to menu (hasPermission fallbacks will handle role-based access)
      navigate('/menu');
    }
  };

  const handleLogout = () => {
    api.auth.logout().catch(console.error);
    sessionStorage.removeItem('sessionOpenedAt');
    setCurrentUser(null);
    setOrders([]);
    setUsers([]);
    setCart([]);
    navigate('/admin');
  };

  const addToCart = (product: Product, selectedVariations?: Record<string, VariationOption>) => {
    setCart(prev => {
      const variationsString = selectedVariations
        ? Object.entries(selectedVariations).sort(([k1], [k2]) => k1.localeCompare(k2)).map(([k, v]) => `${k}:${v.id}`).join('|')
        : '';
      const cartItemId = `${product.id}${variationsString ? `|${variationsString}` : ''}`;
      const existing = prev.find(item => item.cartItemId === cartItemId);
      if (existing) {
        return prev.map(item => item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, cartItemId, quantity: 1, selectedVariations }];
    });
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
    setCart(order.items);
    if (order.status === 'Draft') {
      setOrders(prev => prev.filter(o => o.id !== order.id));
    }
    navigate('/menu');
    setIsCartOpen(true);
  };

  const clearCart = () => setCart([]);

  const handleOrderCreated = (newOrder: Order) => {
    setOrders(prev => [newOrder, ...prev]);
  };

  const refreshOrders = () => {
    api.orders.listOrders(users, undefined, activeLocationId ?? undefined).then(setOrders).catch(console.error);
  };

  // ── Public ordering routes (no auth required) ─────────────────────────────────
  const PUBLIC_PATHS = ['/', '/checkout', '/history'];
  const isPublicPath = PUBLIC_PATHS.includes(location.pathname) || location.pathname.startsWith('/track/');
  if (isPublicPath) {
    return (
      <Suspense fallback={<AppSpinner />}>
        <PublicCartProvider>
          <PublicMenuPage />
        </PublicCartProvider>
      </Suspense>
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
                      />
                    : <AccessDenied />
                } />

                <Route path="/attendance" element={
                  hasPermission('view_attendance')
                    ? <AttendanceView
                        setCurrentView={setCurrentView}
                        onLogout={handleLogout}
                        isKioskOnly={currentUser?.permissions.includes('view_attendance') && !currentUser?.permissions.includes('view_menu')}
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
        hasPermission={hasPermission}
        orders={orders}
        locations={locations}
        activeLocationId={activeLocationId}
        setActiveLocationId={setActiveLocationId}
        restaurantName={branding.restaurantName}
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
    </div>
  );
}

function _notifTitle(event: WsEvent): string {
  switch (event.type) {
    case 'new_order':    return `New Order ${event.order_number || ''}`;
    case 'urgent':       return `Urgent: ${event.order_number || ''}`;
    case 'status_update':return `Order ${event.order_number || ''} — ${event.status || ''}`;
    case 'order_done':   return `Order ${event.order_number || ''} Completed`;
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
