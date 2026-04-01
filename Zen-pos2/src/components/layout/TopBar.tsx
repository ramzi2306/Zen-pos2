import React, { useState, useEffect, useRef } from 'react';
import type { Location } from '../../api/locations';
import type { AppNotification } from '../../App';

/**
 * TopBar — sticky header with brand, main tab navigation, search, notifications,
 * and the user avatar that opens the ProfilePanel.
 *
 * Desktop only (hidden on mobile — use MobileNav instead).
 *
 * Navigation tabs are permission-gated:
 * - Menu          (view_menu)
 * - Commandes     (view_orders)
 * - Présence      (view_attendance)
 * - Inventaire    (view_inventory)
 *
 * @prop currentView      - Active view key (e.g. 'menu', 'orders')
 * @prop setCurrentView   - Navigate to a view
 * @prop isProfileOpen    - Controls whether the ProfilePanel is open
 * @prop setIsProfileOpen - Toggle ProfilePanel
 * @prop currentUser      - Logged-in user (name, role, image)
 * @prop hasPermission    - Permission guard helper
 */
export const TopBar = ({
  currentView,
  setCurrentView,
  isProfileOpen,
  setIsProfileOpen,
  currentUser,
  hasPermission,
  restaurantName,
  locations = [],
  activeLocationId,
  notifications = [],
  onClearNotification,
  onMarkAllRead,
}: {
  currentView: string;
  setCurrentView: (v: string) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (v: boolean) => void;
  currentUser: any;
  hasPermission: (p: any) => boolean;
  restaurantName?: string;
  locations?: Location[];
  activeLocationId?: string | null;
  notifications?: AppNotification[];
  onClearNotification?: (id: string) => void;
  onMarkAllRead?: () => void;
}) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationsOpen]);

  const unreadCount = notifications.filter(n => !n.read).length;

  function notifIcon(n: AppNotification): { icon: string; color: string } {
    switch (n.type) {
      case 'new_order':    return { icon: 'add_circle',   color: 'text-primary' };
      case 'urgent':       return { icon: 'priority_high', color: 'text-error' };
      case 'status_update':return { icon: 'sync',          color: 'text-secondary' };
      case 'order_done':   return { icon: 'check_circle',  color: 'text-[#8bc34a]' };
      default:             return { icon: 'notifications', color: 'text-on-surface-variant' };
    }
  }

  return (
    <header className="w-full h-16 flex-shrink-0 bg-surface-container-lowest/80 backdrop-blur-md border-b border-outline-variant/20 flex items-center justify-between px-6 z-[90] relative">
      {/* Brand */}
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 bg-primary-container rounded hidden md:flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-lg">architecture</span>
        </div>
        <div>
          <h1 className="font-headline font-extrabold text-primary tracking-tight leading-none text-lg">{restaurantName || 'ZEN POS'}</h1>
          {(() => {
            const activeLoc = activeLocationId ? locations.find(l => l.id === activeLocationId) : null;
            const sub = currentUser?.locationName
              || activeLoc?.subtitle
              || activeLoc?.name;
            return sub ? (
              <p className="font-headline text-[9px] uppercase tracking-micro text-on-surface-variant font-bold hidden md:block">{sub}</p>
            ) : null;
          })()}
        </div>
      </div>

      {/* Main Nav */}
      <nav className="hidden md:flex items-center gap-2 h-full">
        {hasPermission('view_menu') && (
          <button
            onClick={() => setCurrentView('menu')}
            className={`h-full flex items-center px-4 transition-colors font-headline text-[10px] font-bold uppercase tracking-micro ${
              currentView === 'menu' ? 'text-secondary border-b-2 border-secondary bg-surface-container/30' : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] mr-2">restaurant_menu</span> Menu
          </button>
        )}
        {hasPermission('view_orders') && (
          <button
            onClick={() => setCurrentView('orders')}
            className={`h-full flex items-center px-4 transition-colors font-headline text-[10px] font-bold uppercase tracking-micro ${
              currentView === 'orders' ? 'text-secondary border-b-2 border-secondary bg-surface-container/30' : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] mr-2">receipt_long</span> Commandes
          </button>
        )}
        {(hasPermission('view_attendance') || hasPermission('view_inventory') || hasPermission('view_hr') || hasPermission('view_staff') || hasPermission('view_settings') || hasPermission('view_orders')) && (
          <button
            onClick={() => setCurrentView('admin_panel')}
            className={`h-full flex items-center px-4 transition-colors font-headline text-[10px] font-bold uppercase tracking-micro ${
              currentView === 'admin_panel' || currentView === 'pos_settings' ? 'text-secondary border-b-2 border-secondary bg-surface-container/30' : 'text-on-surface-variant hover:text-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] mr-2">admin_panel_settings</span> Administration
          </button>
        )}
      </nav>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Search */}
        <div className="relative">
          <button className="lg:hidden w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined">search</span>
          </button>
          <div className="relative hidden lg:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-sm">search</span>
            <input
              type="text"
              placeholder="Rechercher..."
              className="bg-surface-container border-none rounded text-xs pl-9 pr-4 py-2 w-48 focus:ring-1 focus:ring-primary/50 text-on-surface placeholder:text-outline-variant transition-all"
            />
          </div>
        </div>

        <div className="h-6 w-px bg-outline-variant/30 mx-1 hidden md:block" />

        {/* Notifications */}
        <div className="relative hidden md:block" ref={notificationsRef}>
          <button
            onClick={() => {
              setIsNotificationsOpen(!isNotificationsOpen);
              if (!isNotificationsOpen && onMarkAllRead) onMarkAllRead();
            }}
            className={`transition-colors relative flex items-center justify-center w-10 h-10 rounded-full ${
              isNotificationsOpen ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] bg-error text-on-error text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border border-surface-container-lowest">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {isNotificationsOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl z-[90] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container/50">
                <h3 className="font-headline font-bold text-sm text-on-surface">Notifications</h3>
                {notifications.length > 0 && onClearNotification && (
                  <button
                    onClick={() => notifications.forEach(n => onClearNotification!(n.id))}
                    className="text-[10px] text-on-surface-variant hover:text-error transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center text-on-surface-variant text-xs">
                    <span className="material-symbols-outlined text-3xl mb-2 block opacity-30">notifications_off</span>
                    No notifications
                  </div>
                ) : notifications.map(notif => {
                  const { icon, color } = notifIcon(notif);
                  return (
                    <div
                      key={notif.id}
                      onClick={() => { setCurrentView('orders'); setIsNotificationsOpen(false); }}
                      className={`p-4 border-b border-outline-variant/5 hover:bg-surface-container transition-colors cursor-pointer flex gap-3 ${!notif.read ? 'bg-surface-container/30' : ''}`}
                    >
                      <div className={`mt-0.5 flex-shrink-0 ${color}`}>
                        <span className="material-symbols-outlined text-xl">{icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <h4 className="text-sm font-bold text-on-surface truncate">{notif.title}</h4>
                          <span className="text-[10px] text-on-surface-variant whitespace-nowrap flex-shrink-0">{notif.time}</span>
                        </div>
                        <p className="text-xs text-on-surface-variant leading-snug">{notif.message}</p>
                      </div>
                      {onClearNotification && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onClearNotification(notif.id); }}
                          className="text-outline-variant hover:text-error transition-colors flex-shrink-0 mt-0.5"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="p-2 border-t border-outline-variant/10 bg-surface-container/30 text-center">
                <button
                  onClick={() => { setCurrentView('orders'); setIsNotificationsOpen(false); }}
                  className="text-xs text-primary hover:underline font-medium p-2 w-full flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">receipt_long</span>
                  View Orders
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div
          className="flex items-center gap-2 ml-2 cursor-pointer group"
          onClick={() => setIsProfileOpen(true)}
        >
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors">{currentUser?.name}</p>
            <p className="font-headline text-[9px] uppercase tracking-micro text-on-surface-variant">{currentUser?.role}</p>
          </div>
          <div className="w-8 h-8 rounded bg-surface-container-high border border-outline-variant/30 overflow-hidden flex items-center justify-center">
            {currentUser?.image ? (
              <img src={currentUser.image} alt="Profile" className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
            ) : (
              <span className="material-symbols-outlined text-outline-variant">person</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
