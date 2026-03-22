import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'motion/react';
import { Calculator } from 'lucide-react';
import { CartItem, ORDERS } from '../data';

export const ProfilePanel = ({ isOpen, onClose, setCurrentView, setCurrentSetting, isLoggedIn, currentUser, onLogout, hasPermission }: { 
  isOpen: boolean, 
  onClose: () => void, 
  setCurrentView: (v: string) => void,
  setCurrentSetting: (s: string) => void,
  isLoggedIn: boolean,
  currentUser: any,
  onLogout: () => void,
  hasPermission: (p: any) => boolean
}) => {
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const totalSales = ORDERS.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = ORDERS.length;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-80 bg-[#3c3f41] text-white z-[101] flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="bg-[#d84315] p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-2xl">storefront</span>
                  <div>
                    <p className="text-[10px] uppercase font-bold opacity-80 leading-none mb-1">Point of Sale</p>
                    <p className="text-lg font-bold leading-none">Kouba</p>
                  </div>
                </div>
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors">
                  <span className="material-symbols-outlined">swap_horiz</span>
                </button>
              </div>

              {/* User Info */}
              <div className="p-6 bg-[#4a4d4f] flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center overflow-hidden border border-white/10">
                  {currentUser?.image ? (
                    <img src={currentUser.image} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-3xl opacity-50">person</span>
                  )}
                </div>
                <div>
                  <p className="text-lg font-bold leading-none mb-1">{currentUser?.name || 'Guest'}</p>
                  <p className="text-xs opacity-60">{currentUser?.email || 'No email'}</p>
                  <p className="text-[10px] uppercase font-bold text-secondary mt-1 tracking-widest">{currentUser?.role || 'No Role'}</p>
                </div>
              </div>

              {/* Main Content Area (Empty space in screenshot) */}
              <div className="flex-1" />

              {/* Stats Grid */}
              <div className="grid grid-cols-2 border-t border-white/10">
                <div className="p-6 border-r border-white/10">
                  <p className="text-[10px] uppercase font-bold opacity-40 mb-2">Orders</p>
                  <p className="text-xl font-bold">{totalOrders}</p>
                </div>
                <div className="p-6">
                  <p className="text-[10px] uppercase font-bold opacity-40 mb-2">Open</p>
                  <p className="text-sm font-bold">8 hours ago</p>
                </div>
              </div>

              {/* Sales & Close Registry */}
              <div className="p-6 bg-[#4a4d4f] flex items-center justify-between border-t border-white/10">
                <div>
                  <p className="text-[10px] uppercase font-bold opacity-40 mb-2">Sales</p>
                  <p className="text-2xl font-bold">${totalSales.toLocaleString()}</p>
                </div>
                <button 
                  onClick={() => setIsCloseModalOpen(true)}
                  className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-3xl opacity-60">logout</span>
                </button>
              </div>

              {/* Footer Buttons */}
              <div className="p-4 grid grid-cols-2 gap-4 bg-[#3c3f41] border-t border-white/10">
                {hasPermission('view_settings') && (
                  <button 
                    onClick={() => { setCurrentView('pos_settings'); setCurrentSetting('branding'); onClose(); }}
                    className="py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10"
                  >
                    POS Settings
                  </button>
                )}
                {(hasPermission('view_staff') || hasPermission('view_hr')) && (
                  <button 
                    onClick={() => { setCurrentView('admin_panel'); setCurrentSetting('team'); onClose(); }}
                    className="py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10"
                  >
                    Administration
                  </button>
                )}
              </div>

              {isLoggedIn && (
                <div className="p-4 bg-[#3c3f41] border-t border-white/10">
                  <button 
                    onClick={() => { onLogout(); onClose(); }}
                    className="w-full py-3 bg-error/10 hover:bg-error/20 text-error rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-error/20 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">logout</span>
                    Logout Admin
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CloseRegisterModal 
        isOpen={isCloseModalOpen} 
        onClose={() => setIsCloseModalOpen(false)} 
        expectedSales={totalSales}
        onConfirm={() => {
          setIsCloseModalOpen(false);
          onClose();
          setCurrentView('attendance');
        }}
      />
    </>
  );
};

interface CloseRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  expectedSales: number;
  onConfirm?: () => void;
}

const CloseRegisterModal = ({ isOpen, onClose, expectedSales, onConfirm }: CloseRegisterModalProps) => {
  const [actualAmounts, setActualAmounts] = useState<Record<string, string>>({
    'Cash': '',
    'Credit Card': ''
  });
  const [notes, setNotes] = useState('');
  const [activeNumpadMethod, setActiveNumpadMethod] = useState<string | null>(null);
  const [numpadPosition, setNumpadPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const paymentMethods = [
    { 
      name: 'Cash', 
      ordersCount: ORDERS.length > 0 ? Math.ceil(ORDERS.length * 0.7) : 0, 
      total: expectedSales * 0.7, 
      refunds: 0 
    },
    { 
      name: 'Credit Card', 
      ordersCount: ORDERS.length > 0 ? Math.floor(ORDERS.length * 0.3) : 0, 
      total: expectedSales * 0.3, 
      refunds: 0 
    },
  ];

  let totalActual = 0;
  (Object.values(actualAmounts) as string[]).forEach(val => {
    totalActual += parseFloat(val) || 0;
  });

  const handleActualChange = (method: string, value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setActualAmounts(prev => ({ ...prev, [method]: value }));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full h-full bg-[#1a1d21] overflow-hidden pointer-events-auto flex flex-col"
          >
            {/* Header */}
            <div className="bg-[#d84315] p-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-2xl">point_of_sale</span>
                <span className="text-lg font-bold uppercase tracking-wider">Close Register</span>
              </div>
              <button onClick={onClose} className="material-symbols-outlined text-3xl hover:opacity-70 transition-opacity">close</button>
            </div>

            {/* Top Info */}
            <div className="flex items-center justify-between border-b border-white/5 px-8 py-2.5 bg-white/[0.01]">
              <div className="flex items-center gap-12">
                <div className="flex items-center gap-2">
                  <p className="text-[9px] uppercase font-bold text-white/30 tracking-widest">POS:</p>
                  <p className="text-sm font-bold text-white/60">Kouba</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-[9px] uppercase font-bold text-white/30 tracking-widest">CASHIER:</p>
                  <p className="text-sm font-bold text-white/60 text-[#d84315]">ramzi</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[9px] uppercase font-bold text-white/30 tracking-widest">OPENED:</p>
                <p className="text-sm font-bold text-white/60">MARCH 21, 2026 AT 3:19 PM <span className="text-white/30 ml-2 font-medium">(9h ago)</span></p>
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-7 text-center border-b border-white/10 bg-[#22252a] shadow-sm">
              <div className="p-4 text-[11px] font-bold text-white/50 border-r border-white/10 uppercase tracking-wider">Payment</div>
              <div className="p-4 text-[11px] font-bold text-white/50 border-r border-white/10 uppercase tracking-wider">Orders</div>
              <div className="p-4 text-[11px] font-bold text-white/50 border-r border-white/10 uppercase tracking-wider">Total</div>
              <div className="p-4 text-[11px] font-bold text-white/50 border-r border-white/10 uppercase tracking-wider">Refunds</div>
              <div className="p-4 text-[11px] font-bold text-white/50 border-r border-white/10 uppercase tracking-wider">Expected</div>
              <div className="p-4 text-[11px] font-bold text-white/50 border-r border-white/10 uppercase tracking-wider">Counted</div>
              <div className="p-4 text-[11px] font-bold text-white/50 uppercase tracking-wider">Difference</div>
            </div>

            {/* Table Content */}
            <div className="bg-[#1a1d21] flex-1 overflow-y-auto border-b border-white/10">
              {paymentMethods.map((pm) => {
                const expected = pm.total - pm.refunds;
                const actual = parseFloat(actualAmounts[pm.name]) || 0;
                const diff = actual - expected;
                const isActive = activeNumpadMethod === pm.name;
                
                return (
                  <div key={pm.name} className="grid grid-cols-7 text-center border-b border-white/5 last:border-b-0 items-stretch relative">
                    <div className="p-6 text-sm font-bold text-white/70 text-left pl-8 bg-white/[0.02] border-r border-white/5 flex items-center">{pm.name}</div>
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">{pm.ordersCount}</div>
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">${pm.total.toLocaleString()}</div>
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">{pm.refunds === 0 ? '—' : `$${pm.refunds.toLocaleString()}`}</div>
                    <div className="p-6 text-sm font-bold text-white/80 border-r border-white/5 flex items-center justify-center">${expected.toLocaleString()}</div>
                    <div className="p-4 border-r border-white/5 flex items-center justify-center">
                      <div className={`relative w-full max-w-[180px] transition-all duration-300 ${isActive ? 'z-[110]' : 'z-auto'}`}>
                        <div className={`relative group p-1 rounded-2xl transition-all ${isActive ? 'bg-[#22252a] shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-2 ring-[#d84315] scale-110' : ''}`}>
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-bold text-sm">$</div>
                          <input 
                            type="text"
                            value={actualAmounts[pm.name]}
                            onChange={(e) => handleActualChange(pm.name, e.target.value)}
                            placeholder="0"
                            className="w-full bg-transparent border-2 border-[#d84315] rounded-xl pl-8 pr-12 py-4 text-lg font-bold focus:outline-none transition-all text-white placeholder:text-white/10 shadow-[0_0_15px_rgba(216,67,21,0.1)]"
                          />
                          <div className="absolute -top-2.5 left-4 bg-[#1a1d21] px-2 text-[11px] font-bold text-[#d84315] uppercase tracking-wider">Counted Value</div>
                          <button 
                            onClick={(e) => {
                              const rect = e.currentTarget.closest('.group')?.getBoundingClientRect();
                              if (rect) {
                                setNumpadPosition({ top: rect.bottom, left: rect.left, width: rect.width });
                                setActiveNumpadMethod(pm.name);
                              }
                            }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-[#d84315] transition-colors"
                          >
                            <Calculator size={20} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className={`p-6 text-sm font-bold flex items-center justify-center ${diff === 0 ? 'text-white/40' : diff > 0 ? 'text-tertiary' : 'text-secondary'}`}>
                      {diff === 0 ? '$0' : (diff > 0 ? '+$' : '-$') + Math.abs(diff).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Footer */}
            <div className="bg-[#1a1d21] border-b border-white/10 p-3 flex justify-end items-center pr-8">
              <span className="text-xs text-white/40 font-medium">1-1 of 1</span>
            </div>

            {/* Notes & Total */}
            <div className="grid grid-cols-2 bg-[#1a1d21]">
              <div className="p-4 border-r border-white/10">
                <p className="text-[9px] uppercase font-bold text-white/40 mb-1.5 tracking-widest">COMMENTS / PRIVATE NOTES</p>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a comment if the amount is not as expected..."
                  className="w-full h-16 p-2.5 bg-white/[0.02] border border-white/10 rounded text-sm focus:outline-none focus:border-[#d84315]/50 transition-colors resize-none placeholder:text-white/20 text-white"
                />
              </div>
              <div className="p-4 flex flex-col justify-center items-end pr-10">
                <div className="text-right">
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-0.5">TOTAL IN REGISTER</p>
                  <p className="text-3xl font-headline font-extrabold text-white/80">
                    <span className="text-lg font-bold opacity-50 mr-1">$</span>{totalActual.toLocaleString()}
                  </p>
                  {totalActual !== expectedSales && expectedSales > 0 && (
                    <p className={`text-[9px] font-bold mt-1 uppercase tracking-widest ${totalActual > expectedSales ? 'text-tertiary' : 'text-secondary'}`}>
                      GLOBAL DIFFERENCE: {totalActual > expectedSales ? '+$' : '-$'}{Math.abs(totalActual - expectedSales).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-[#22252a] border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <button className="flex items-center gap-3 text-sm font-bold text-[#d84315] hover:underline uppercase tracking-widest">
                  <span className="material-symbols-outlined text-2xl">print</span>
                  Print Report
                </button>
              </div>
              <div className="flex gap-6">
                <button 
                  onClick={onClose}
                  className="px-8 py-4 text-sm font-bold text-white/40 hover:text-white/60 transition-colors uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button 
                  onClick={onConfirm || onClose}
                  className="px-12 py-4 bg-[#d84315] text-white rounded-lg text-sm font-bold uppercase tracking-widest hover:bg-[#bf360c] transition-all shadow-lg shadow-[#d84315]/20"
                >
                  Close Register
                </button>
              </div>
            </div>

            {/* 3D Touch Numpad Overlay */}
            <AnimatePresence>
              {activeNumpadMethod && numpadPosition && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setActiveNumpadMethod(null)}
                  className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md pointer-events-auto"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0 
                    }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ 
                      position: 'fixed',
                      top: numpadPosition.top + 10,
                      left: numpadPosition.left + (numpadPosition.width / 2) - 130
                    }}
                    className="bg-[#22252a] w-[260px] rounded-[32px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10 p-4 z-[110]"
                  >
                    {/* Numpad Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map((num) => (
                        <motion.button
                          key={num}
                          whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.08)' }}
                          whileTap={{ scale: 0.92, backgroundColor: 'rgba(255,255,255,0.12)' }}
                          onClick={() => {
                            const current = actualAmounts[activeNumpadMethod] || '';
                            if (num === '.' && current.includes('.')) return;
                            handleActualChange(activeNumpadMethod, current + num);
                          }}
                          className="h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center text-xl font-bold text-white/90 transition-shadow hover:shadow-[0_10px_20px_rgba(0,0,0,0.2)]"
                        >
                          {num}
                        </motion.button>
                      ))}
                      <motion.button
                        whileHover={{ scale: 1.05, backgroundColor: 'rgba(216,67,21,0.1)' }}
                        whileTap={{ scale: 0.92, backgroundColor: 'rgba(216,67,21,0.2)' }}
                        onClick={() => {
                          const current = actualAmounts[activeNumpadMethod] || '';
                          handleActualChange(activeNumpadMethod, current.slice(0, -1));
                        }}
                        className="h-14 rounded-2xl bg-white/[0.04] flex items-center justify-center text-white/90"
                      >
                        <span className="material-symbols-outlined text-2xl">backspace</span>
                      </motion.button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const Sidebar = ({ currentSetting, setCurrentSetting, type, hasPermission }: { 
  currentSetting: string, 
  setCurrentSetting: (s: string) => void, 
  type: 'pos_settings' | 'admin_panel',
  hasPermission: (p: any) => boolean
}) => {
  const navItems = [
    { id: 'branding', icon: 'palette', label: 'Branding', category: 'pos_settings', permission: 'view_settings' },
    { id: 'hardware', icon: 'print', label: 'Hardware', category: 'pos_settings', permission: 'view_settings' },
    { id: 'products', icon: 'restaurant_menu', label: 'Products', category: 'admin_panel', permission: 'view_settings' },
    { id: 'team', icon: 'group', label: 'Staff', category: 'admin_panel', permission: 'view_staff' },
    { id: 'hr', icon: 'badge', label: 'Human Resources', category: 'admin_panel', permission: 'view_hr' },
    { id: 'locations', icon: 'location_on', label: 'Locations', category: 'admin_panel', permission: 'view_settings' },
    { id: 'roles', icon: 'admin_panel_settings', label: 'Roles', category: 'admin_panel', permission: 'manage_roles' },
  ];

  const filteredItems = navItems.filter(item => 
    item.category === type && 
    (!item.permission || hasPermission(item.permission as any))
  );

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-surface-container-lowest border-r border-outline-variant/10 z-10 hidden md:flex">
      <div className="flex flex-col h-full py-8">
        <div className="px-6 mb-10">
          <span className="text-xl font-bold tracking-tighter text-primary font-headline">
            {type === 'pos_settings' ? 'POS Settings' : 'Administration'}
          </span>
        </div>
        <nav className="flex-1 space-y-1">
          {filteredItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentSetting(item.id)}
              className={`w-full px-6 py-4 flex items-center gap-4 transition-colors duration-200 font-headline tracking-[0.05rem] uppercase text-xs font-semibold ${
                currentSetting === item.id 
                  ? 'text-secondary border-l-4 border-secondary bg-surface-container-high' 
                  : 'text-primary/60 hover:text-primary hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export const TopBar = ({ currentView, setCurrentView, isProfileOpen, setIsProfileOpen, currentUser, hasPermission }: { 
  currentView: string, 
  setCurrentView: (v: string) => void,
  isProfileOpen: boolean,
  setIsProfileOpen: (v: boolean) => void,
  currentUser: any,
  hasPermission: (p: any) => boolean
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotificationsOpen]);

  const MOCK_NOTIFICATIONS = [
    { id: 1, type: 'ready', title: 'Order #142 Ready', message: 'Ready to send/deliver.', time: '2 min ago', icon: 'check_circle', color: 'text-[#8bc34a]' },
    { id: 2, type: 'verify', title: 'Web Order #143', message: 'Needs verification before kitchen.', time: '5 min ago', icon: 'storefront', color: 'text-secondary' },
    { id: 3, type: 'ready', title: 'Order #140 Ready', message: 'Ready to send/deliver.', time: '12 min ago', icon: 'check_circle', color: 'text-[#8bc34a]' },
  ];

  return (
    <header className="w-full h-16 flex-shrink-0 bg-surface-container-lowest/80 backdrop-blur-md border-b border-outline-variant/20 flex items-center justify-between px-6 z-[70] relative">
      {/* Brand */}
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 bg-primary-container rounded hidden md:flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-lg">architecture</span>
        </div>
        <div>
          <h1 className="font-headline font-extrabold text-primary tracking-tight leading-none text-lg">ZEN POS</h1>
          <p className="font-headline text-[9px] uppercase tracking-micro text-on-surface-variant font-bold hidden md:block">Omakase Station 01</p>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="hidden md:flex items-center gap-2 h-full">
        {hasPermission('view_menu') && (
          <button onClick={() => setCurrentView('menu')} className={`h-full flex items-center px-4 transition-colors font-headline text-[10px] font-bold uppercase tracking-micro ${currentView === 'menu' ? 'text-secondary border-b-2 border-secondary bg-surface-container/30' : 'text-on-surface-variant hover:text-primary'}`}>
            <span className="material-symbols-outlined text-[18px] mr-2">restaurant_menu</span> Menu
          </button>
        )}
        {hasPermission('view_orders') && (
          <button onClick={() => setCurrentView('orders')} className={`h-full flex items-center px-4 transition-colors font-headline text-[10px] font-bold uppercase tracking-micro ${currentView === 'orders' ? 'text-secondary border-b-2 border-secondary bg-surface-container/30' : 'text-on-surface-variant hover:text-primary'}`}>
            <span className="material-symbols-outlined text-[18px] mr-2">receipt_long</span> Commandes
          </button>
        )}
        {hasPermission('view_attendance') && (
          <button onClick={() => setCurrentView('attendance')} className={`h-full flex items-center px-4 transition-colors font-headline text-[10px] font-bold uppercase tracking-micro ${currentView === 'attendance' ? 'text-secondary border-b-2 border-secondary bg-surface-container/30' : 'text-on-surface-variant hover:text-primary'}`}>
            <span className="material-symbols-outlined text-[18px] mr-2">fingerprint</span> Présence
          </button>
        )}
        {hasPermission('view_inventory') && (
          <button onClick={() => setCurrentView('inventory')} className={`h-full flex items-center px-4 transition-colors font-headline text-[10px] font-bold uppercase tracking-micro ${currentView === 'inventory' ? 'text-secondary border-b-2 border-secondary bg-surface-container/30' : 'text-on-surface-variant hover:text-primary'}`}>
            <span className="material-symbols-outlined text-[18px] mr-2">inventory_2</span> Inventaire
          </button>
        )}
      </nav>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="relative">
          <button className="lg:hidden w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined">search</span>
          </button>
          <div className="relative hidden lg:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-sm">search</span>
            <input type="text" placeholder="Rechercher..." className="bg-surface-container border-none rounded text-xs pl-9 pr-4 py-2 w-48 focus:ring-1 focus:ring-primary/50 text-on-surface placeholder:text-outline-variant transition-all" />
          </div>
        </div>
        <div className="h-6 w-px bg-outline-variant/30 mx-1 hidden md:block"></div>
        <div className="relative hidden md:block" ref={notificationsRef}>
          <button 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className={`transition-colors relative flex items-center justify-center w-10 h-10 rounded-full ${isNotificationsOpen ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:text-primary hover:bg-surface-container'}`}
          >
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-secondary rounded-full border-2 border-surface-container-lowest"></span>
          </button>
          
          {/* Notifications Dropdown */}
          {isNotificationsOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl z-[90] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container/50">
                  <h3 className="font-headline font-bold text-sm text-on-surface">Notifications</h3>
                  <span className="text-[10px] bg-secondary/20 text-secondary px-2 py-0.5 rounded-full font-bold">3 Nouveaux</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {MOCK_NOTIFICATIONS.map(notif => (
                    <div key={notif.id} className="p-4 border-b border-outline-variant/5 hover:bg-surface-container transition-colors cursor-pointer flex gap-3">
                      <div className={`mt-0.5 ${notif.color}`}>
                        <span className="material-symbols-outlined text-xl">{notif.icon}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="text-sm font-bold text-on-surface">{notif.title}</h4>
                          <span className="text-[10px] text-on-surface-variant whitespace-nowrap ml-2">{notif.time}</span>
                        </div>
                        <p className="text-xs text-on-surface-variant leading-snug">{notif.message}</p>
                        {notif.type === 'verify' && (
                          <div className="mt-2 flex gap-2">
                            <button className="text-[10px] font-bold uppercase tracking-wider bg-primary text-on-primary px-3 py-1.5 rounded hover:bg-primary/90 transition-colors">Vérifier</button>
                            <button className="text-[10px] font-bold uppercase tracking-wider bg-surface-container-high text-on-surface px-3 py-1.5 rounded hover:bg-surface-container-highest transition-colors">Voir</button>
                          </div>
                        )}
                        {notif.type === 'ready' && (
                          <div className="mt-2">
                            <button className="text-[10px] font-bold uppercase tracking-wider bg-[#8bc34a] text-white px-3 py-1.5 rounded hover:bg-[#7cb342] transition-colors">Marquer Envoyé</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-2 border-t border-outline-variant/10 bg-surface-container/30 text-center">
                  <button className="text-xs text-primary hover:underline font-medium p-2 w-full">Voir toute l'activité</button>
                </div>
              </div>
          )}
        </div>
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

export const CartFloatingAction = ({ cart, onOpen }: { cart: CartItem[], onOpen: () => void }) => {
  const subtotal = cart.reduce((sum, item) => {
    const variationsPrice = Object.values(item.selectedVariations || {}).reduce((vSum: number, opt: any) => vSum + (opt.priceAdjustment || 0), 0);
    const itemPrice = item.price + variationsPrice - (item.discount || 0);
    return sum + (itemPrice * item.quantity);
  }, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (cart.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] md:w-full max-w-md z-40 lg:hidden cursor-pointer" onClick={onOpen}>
      <div className="bg-surface-container-high/90 backdrop-blur-xl border border-white/5 p-4 rounded-2xl shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <span className="material-symbols-outlined text-secondary text-3xl">shopping_basket</span>
            <span className="absolute -top-1 -right-1 bg-tertiary text-on-tertiary text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalItems}</span>
          </div>
          <div>
            <span className="text-xs text-on-surface-variant font-medium block">Order Summary</span>
            <span className="font-headline font-bold text-on-surface">View Order Details</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant block">Total</span>
          <span className="font-headline font-extrabold text-xl text-primary">${subtotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export const MobileNav = ({ currentView, setCurrentView, onOpenCart, hasPermission }: { 
  currentView: string, 
  setCurrentView: (v: string) => void, 
  onOpenCart: () => void,
  hasPermission: (p: any) => boolean
}) => {
  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-4 pt-2 bg-[#1d2024]/80 backdrop-blur-xl rounded-t-xl shadow-[0_-10px_30px_rgba(0,0,0,0.4)] lg:hidden">
      {hasPermission('view_menu') && (
        <div 
          onClick={() => setCurrentView('menu')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 active:scale-98 transition-all duration-200 cursor-pointer ${currentView === 'menu' ? 'bg-[#272a2e] text-[#ffb4a5]' : 'text-[#c0c7d4] opacity-60 hover:opacity-100'}`}
        >
          <span className="material-symbols-outlined">restaurant_menu</span>
          <span className="font-body text-[10px] font-medium tracking-tight">Menu</span>
        </div>
      )}
      {hasPermission('view_menu') && (
        <div 
          onClick={onOpenCart}
          className="flex flex-col items-center justify-center text-[#c0c7d4] opacity-60 px-4 py-1 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <span className="material-symbols-outlined">shopping_cart</span>
          <span className="font-body text-[10px] font-medium tracking-tight">Cart</span>
        </div>
      )}
      {hasPermission('view_orders') && (
        <div 
          onClick={() => setCurrentView('orders')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 active:scale-98 transition-all duration-200 cursor-pointer ${currentView === 'orders' ? 'bg-[#272a2e] text-[#ffb4a5]' : 'text-[#c0c7d4] opacity-60 hover:opacity-100'}`}
        >
          <span className="material-symbols-outlined">receipt_long</span>
          <span className="font-body text-[10px] font-medium tracking-tight">Orders</span>
        </div>
      )}
      {hasPermission('view_attendance') && (
        <div 
          onClick={() => setCurrentView('attendance')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 active:scale-98 transition-all duration-200 cursor-pointer ${currentView === 'attendance' ? 'bg-[#272a2e] text-[#ffb4a5]' : 'text-[#c0c7d4] opacity-60 hover:opacity-100'}`}
        >
          <span className="material-symbols-outlined">fingerprint</span>
          <span className="font-body text-[10px] font-medium tracking-tight">Staff</span>
        </div>
      )}
    </nav>
  );
};

const MOCK_CLIENTS = [
  { phone: '1234567890', name: 'John Doe', zone: 'Zone 1 (Downtown)', address: '123 Main St, Apt 4B', lastOrderTime: '2 hours ago' },
  { phone: '0987654321', name: 'Jane Smith', zone: 'Zone 2 (Northside)', address: '456 Elm St', lastOrderTime: '2 months ago' },
];

const SwipeableCartItem = ({ item, expandedItemId, setExpandedItemId, updateQuantity, updateCartItem }: any) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, -80], [0, 1]);
  const background = useTransform(x, [0, -80], ['#00000000', '#d32f2f']);
  const isExpanded = expandedItemId === item.cartItemId;
  const [editMenuRect, setEditMenuRect] = useState<DOMRect | null>(null);

  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x < -80) {
      updateQuantity(item.cartItemId, -item.quantity);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  };

  const handleItemClick = (e: React.MouseEvent) => {
    if (isExpanded) {
      setExpandedItemId(null);
      setEditMenuRect(null);
    } else {
      setExpandedItemId(item.cartItemId);
      setEditMenuRect(e.currentTarget.getBoundingClientRect());
    }
  };

  const itemContent = (
    <>
      <div className="w-12 h-12 rounded bg-surface-container-lowest overflow-hidden flex-shrink-0 border border-outline-variant/10">
        <img src={item.image} alt={item.name} className="w-full h-full object-cover opacity-80" />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start leading-tight mb-1">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-on-surface group-hover:text-primary transition-colors">{item.name}</h4>
              <span className="material-symbols-outlined text-on-surface-variant text-[16px] transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                expand_more
              </span>
            </div>
            {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {Object.values(item.selectedVariations).map((opt: any) => (
                  <span key={opt.id} className="text-[9px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded-sm font-medium">
                    {opt.name} {opt.priceAdjustment ? `(+$${opt.priceAdjustment.toFixed(2)})` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center border border-outline-variant/20 rounded px-2 py-0.5 text-xs font-bold">
              {item.quantity}
            </div>
            <div className="text-right w-16">
              {item.discount ? (
                <div className="flex flex-col items-end">
                  <span className="font-bold text-sm text-primary">${((item.price + Object.values(item.selectedVariations || {}).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0) - item.discount) * item.quantity).toFixed(2)}</span>
                  <span className="text-[10px] text-on-surface-variant line-through">${((item.price + Object.values(item.selectedVariations || {}).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0)) * item.quantity).toFixed(2)}</span>
                </div>
              ) : (
                <span className="font-bold text-sm text-primary">${((item.price + Object.values(item.selectedVariations || {}).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0)) * item.quantity).toFixed(2)}</span>
              )}
            </div>
          </div>
        </div>
        {item.notes && !isExpanded && (
          <div className="mt-1">
            <span className="inline-block bg-tertiary-container text-tertiary text-[8px] font-headline font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm">{item.notes}</span>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="relative border-b border-outline-variant/10 last:border-0 overflow-hidden">
      {/* Background delete indicator */}
      <motion.div 
        className="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-white font-bold"
        style={{ background, opacity, width: '100%' }}
      >
        <span className="material-symbols-outlined">delete</span>
      </motion.div>

      {/* Foreground item */}
      <motion.div 
        className="relative bg-surface-container pb-4 px-4 -mx-4"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
      >
        <div 
          className={`flex gap-4 cursor-pointer group transition-opacity duration-200 ${isExpanded ? 'opacity-0' : 'opacity-100'}`}
          onClick={handleItemClick}
        >
          {itemContent}
        </div>

        {/* Expanded Form (3D Touch Style) */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isExpanded && editMenuRect && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[85] bg-black/20 backdrop-blur-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedItemId(null);
                    setEditMenuRect(null);
                  }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 0, top: editMenuRect.top - 16 }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1.02, 
                    y: -4, 
                    top: Math.max(16, Math.min(editMenuRect.top - 16, window.innerHeight - 550)) 
                  }}
                  exit={{ opacity: 0, scale: 0.95, y: 0, top: editMenuRect.top - 16 }}
                  className="fixed z-[90] bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl flex flex-col overflow-y-auto max-h-[calc(100vh-32px)]"
                  style={{
                    left: Math.max(16, Math.min(editMenuRect.left - 16, window.innerWidth - (editMenuRect.width + 32))),
                    width: editMenuRect.width + 32,
                    transformOrigin: 'top center'
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {/* The elevated product item */}
                  <div 
                    className="flex gap-4 p-4 border-b border-outline-variant/10 bg-surface-container cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedItemId(null);
                      setEditMenuRect(null);
                    }}
                  >
                    {itemContent}
                  </div>
                  
                  {/* The form */}
                  <div className="p-4 space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-bold text-on-surface">Edit Item</h4>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedItemId(null);
                          setEditMenuRect(null);
                        }}
                        className="text-on-surface-variant hover:text-on-surface"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>
                  <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                    <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Product Name</span>
                    <input 
                      type="text" 
                      className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface" 
                      value={item.name}
                      onChange={(e) => updateCartItem(item.cartItemId, { name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                      <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Qty</span>
                      <div className="flex justify-between items-center">
                        <input 
                          type="number" 
                          className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface" 
                          value={item.quantity}
                          onChange={(e) => {
                            const newQty = parseInt(e.target.value);
                            if (!isNaN(newQty)) {
                              updateQuantity(item.cartItemId, newQty - item.quantity);
                            }
                          }}
                        />
                        <div className="flex flex-col gap-1">
                          <button onClick={() => updateQuantity(item.cartItemId, 1)} className="text-on-surface-variant hover:text-primary"><span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span></button>
                          <button onClick={() => updateQuantity(item.cartItemId, -1)} className="text-on-surface-variant hover:text-primary"><span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span></button>
                        </div>
                      </div>
                    </div>
                    <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                      <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Discount</span>
                      <input 
                        type="number" 
                        className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface" 
                        value={item.discount || ''}
                        placeholder="0.00"
                        onChange={(e) => updateCartItem(item.cartItemId, { discount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                      <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Price</span>
                      <input 
                        type="number" 
                        className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface" 
                        value={item.price}
                        onChange={(e) => updateCartItem(item.cartItemId, { price: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div className="border border-outline-variant/20 rounded-lg p-2.5 flex flex-col bg-surface-container">
                    <span className="text-[10px] text-on-surface-variant mb-1 uppercase tracking-wider font-bold">Preparation Notes</span>
                    <input 
                      type="text" 
                      className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-on-surface" 
                      placeholder="e.g. No onions, well done..."
                      value={item.notes || ''}
                      onChange={(e) => updateCartItem(item.cartItemId, { notes: e.target.value })}
                    />
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedItemId(null);
                      setEditMenuRect(null);
                    }}
                    className="w-full bg-primary text-on-primary font-bold py-3 rounded-lg shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    Save Changes
                  </button>
                </div>
              </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
      </motion.div>
    </div>
  );
};

export const CartSidebar = ({ cart, updateQuantity, updateCartItem, isOpen, onClose, onClearCart, onSaveDraft }: { cart: CartItem[], updateQuantity: (cartItemId: string, delta: number) => void, updateCartItem: (cartItemId: string, updates: Partial<CartItem>) => void, isOpen: boolean, onClose: () => void, onClearCart?: () => void, onSaveDraft?: () => void }) => {
  const subtotal = cart.reduce((sum, item) => {
    const variationsPrice = Object.values(item.selectedVariations || {}).reduce((vSum: number, opt: any) => vSum + (opt.priceAdjustment || 0), 0);
    const itemPrice = item.price + variationsPrice - (item.discount || 0);
    return sum + (itemPrice * item.quantity);
  }, 0);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryDetails, setDeliveryDetails] = useState({ name: '', phone: '', zone: '', address: '' });
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [viewMode, setViewMode] = useState<'cart' | 'receipt'>('cart');
  const [isClientListModalOpen, setIsClientListModalOpen] = useState(false);
  const [newOrderMenuRect, setNewOrderMenuRect] = useState<DOMRect | null>(null);
  const [paymentMenuRect, setPaymentMenuRect] = useState<DOMRect | null>(null);
  const [noteMenuRect, setNoteMenuRect] = useState<DOMRect | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const total = subtotal * 1.28875;
  const change = parseFloat(amountPaid) > total ? parseFloat(amountPaid) - total : 0;

  const handlePrint = () => {
    const printContent = document.getElementById('receipt-content');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            .receipt { width: 300px; margin: 0 auto; }
            .text-center { text-align: center; }
            .flex { display: flex; justify-content: space-between; }
            .border-b { border-bottom: 1px dashed #ccc; margin: 10px 0; }
            .font-bold { font-weight: bold; }
            .text-sm { font-size: 12px; }
            .text-xs { font-size: 10px; color: #666; }
          </style>
        </head>
        <body>
          <div class="receipt">
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSendToKitchen = () => {
    setToast({ message: 'Order sent to kitchen successfully!', type: 'success' });
    setTimeout(() => {
      if (onClearCart) onClearCart();
      setViewMode('cart');
      setToast(null);
    }, 2000);
  };

  const handleSaveForLater = () => {
    if (onSaveDraft) onSaveDraft();
    setToast({ message: 'Order saved as draft.', type: 'success' });
    setTimeout(() => {
      setViewMode('cart');
      setToast(null);
    }, 2000);
  };

  const filteredClients = MOCK_CLIENTS.filter(client => client.phone.includes(customerSearch) || client.name.toLowerCase().includes(customerSearch.toLowerCase()));

  const handleSelectClient = (client: typeof MOCK_CLIENTS[0]) => {
    setDeliveryDetails({ ...client, address: '' });
    setCustomerSearch('');
    setShowClientDropdown(false);
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[55] lg:hidden backdrop-blur-sm" 
          onClick={onClose}
        />
      )}
      <aside className={`fixed inset-y-0 right-0 w-96 max-w-[90vw] flex-shrink-0 bg-surface-container/95 backdrop-blur-xl border-l border-outline-variant/20 flex flex-col z-[80] shadow-2xl transition-transform duration-300 lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {viewMode === 'cart' ? (
          <>
            <div className="border-b border-outline-variant/10 relative">
              <div className="p-4 flex justify-between items-center bg-surface-container-lowest">
                {!deliveryDetails.name ? (
              <div className="flex items-center gap-3 w-full relative">
                <motion.button 
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setIsClientListModalOpen(true)} 
                  className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-surface-variant/50"
                >
                  <span className="material-symbols-outlined">person</span>
                </motion.button>
                <input 
                  type="text" 
                  placeholder="Rechercher un client (nom ou téléphone)" 
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm text-on-surface"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowClientDropdown(e.target.value.length > 0);
                  }}
                  onFocus={() => setShowClientDropdown(customerSearch.length > 0)}
                />
                <motion.button 
                  whileTap={{ scale: 0.85 }}
                  onClick={(e) => setNewOrderMenuRect(e.currentTarget.getBoundingClientRect())} 
                  className="text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full hover:bg-surface-variant/50"
                >
                  <span className="material-symbols-outlined">add</span>
                </motion.button>
                
                {/* Dropdown for client search */}
                {showClientDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-surface-container-lowest border border-outline-variant/20 rounded-lg shadow-xl z-[70] max-h-48 overflow-y-auto">
                    {filteredClients.length > 0 ? (
                      filteredClients.map(client => (
                        <div 
                          key={client.phone} 
                          className="p-3 hover:bg-surface-container cursor-pointer border-b border-outline-variant/10 last:border-0"
                          onClick={() => handleSelectClient(client)}
                        >
                          <div className="font-bold text-sm text-on-surface">{client.name}</div>
                          <div className="text-xs text-on-surface-variant">{client.phone} • {client.zone}</div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-surface-container-lowest">
                        <div className="text-xs text-on-surface-variant mb-2">Nouveau client</div>
                        <input
                          type="text"
                          placeholder="Nom du client"
                          className="w-full bg-surface-container border border-outline-variant/20 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary"
                          value={newClientName}
                          onChange={(e) => setNewClientName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newClientName.trim()) {
                              setDeliveryDetails({ name: newClientName, phone: customerSearch, zone: '', address: '' });
                              setCustomerSearch('');
                              setNewClientName('');
                              setShowClientDropdown(false);
                            }
                          }}
                        />
                        <button 
                          onClick={() => {
                            if (newClientName.trim()) {
                              setDeliveryDetails({ name: newClientName, phone: customerSearch, zone: '', address: '' });
                              setCustomerSearch('');
                              setNewClientName('');
                              setShowClientDropdown(false);
                            }
                          }} 
                          className="mt-2 w-full py-2 bg-primary text-on-primary rounded text-xs font-bold hover:bg-primary/90 transition-colors"
                        >
                          Ajouter
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between w-full bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[18px]">person</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-on-surface leading-none">{deliveryDetails.name}</span>
                    {deliveryDetails.phone && <span className="text-xs text-on-surface-variant mt-1">{deliveryDetails.phone}</span>}
                  </div>
                </div>
                <button onClick={() => setDeliveryDetails({ name: '', phone: '', zone: '', address: '' })} className="text-on-surface-variant hover:text-[#d32f2f] transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#d32f2f]/10">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            )}
            <button onClick={onClose} className="lg:hidden ml-2 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 cart-scroll">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-on-surface-variant opacity-50">
              <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
              <p className="font-headline text-sm uppercase tracking-widest">Cart is empty</p>
            </div>
          ) : (
            cart.map(item => (
              <SwipeableCartItem
                key={item.cartItemId}
                item={item}
                expandedItemId={expandedItemId}
                setExpandedItemId={setExpandedItemId}
                updateQuantity={updateQuantity}
                updateCartItem={updateCartItem}
              />
            ))
          )}
        </div>

        <div className="p-4 bg-surface-container-low border-t border-outline-variant/20">
          <div className="mb-3">
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setOrderType('dine_in')}
                className={`py-2 px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${orderType === 'dine_in' ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                <span className="material-symbols-outlined text-[18px]">restaurant</span>
                <span className="text-[9px] font-bold uppercase tracking-wider">Dine in</span>
              </button>
              <button 
                onClick={() => setOrderType('takeaway')}
                className={`py-2 px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${orderType === 'takeaway' ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                <span className="material-symbols-outlined text-[18px]">takeout_dining</span>
                <span className="text-[9px] font-bold uppercase tracking-wider">Takeaway</span>
              </button>
              <button 
                onClick={() => setOrderType('delivery')}
                className={`py-2 px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${orderType === 'delivery' ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                <span className="text-[9px] font-bold uppercase tracking-wider">Delivery</span>
              </button>
            </div>
            {orderType === 'delivery' && (
              <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <input 
                  type="text" 
                  placeholder="Adresse de livraison" 
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  value={deliveryDetails.address || ''}
                  onChange={(e) => setDeliveryDetails({...deliveryDetails, address: e.target.value})}
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => {
                if (cart.length > 0) setViewMode('receipt');
              }}
              className="w-full py-3 bg-[#8bc34a] text-white rounded-lg font-headline font-extrabold text-lg hover:bg-[#7cb342] transition-colors shadow-lg flex items-center justify-between px-5"
            >
              <div className="flex flex-col items-start">
                <span>Payer</span>
                <span className="text-xs font-medium opacity-90">{cart.length} articles</span>
              </div>
              <span className="text-xl">${subtotal.toFixed(2)}</span>
            </button>
          </div>
        </div>
        </>
        ) : (
          <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300 bg-[#1a1d21]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#22252a]">
              <div className="flex items-center gap-3">
                <button onClick={() => setViewMode('cart')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-colors">
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 className="font-headline font-bold text-sm uppercase tracking-widest text-white">Receipt Preview</h2>
              </div>
              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 text-[#8bc34a] hover:text-[#7cb342] font-bold text-xs tracking-wider transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
                PRINT
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-[#1a1d21] flex flex-col items-center">
              {/* Paper Receipt */}
              <div id="receipt-content" className="w-full max-w-[320px] bg-white text-black pt-8 px-6 pb-6 relative shadow-2xl font-mono">
                {/* Receipt Content */}
                <div className="text-center mb-6">
                  <h3 className="font-bold text-xl mb-1">ZEN OMAKASE</h3>
                  <p className="text-xs text-gray-500">123 Zen Garden Way, Tokyo<br/>District</p>
                </div>
                
                <div className="border-b border-dashed border-gray-300 pb-3 mb-4 flex justify-between text-[10px] text-gray-500 uppercase">
                  <span>Date: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span>Order: #884-04</span>
                </div>

                {(deliveryDetails.name || deliveryDetails.address || deliveryDetails.phone) && (
                  <div className="mb-4 text-[10px] uppercase tracking-wider border-b border-dashed border-gray-200 pb-3">
                    <div className="font-bold mb-1">Customer Details</div>
                    {deliveryDetails.name && <div>Name: {deliveryDetails.name}</div>}
                    {deliveryDetails.phone && <div>Phone: {deliveryDetails.phone}</div>}
                    {deliveryDetails.address && <div>Address: {deliveryDetails.address}</div>}
                  </div>
                )}
                
                <div className="space-y-4 mb-6">
                  {cart.map(item => (
                    <div key={item.cartItemId} className="text-sm">
                      <div className="flex justify-between font-bold">
                        <span>{item.name}</span>
                        <span>${((item.price + Object.values(item.selectedVariations || {}).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0) - (item.discount || 0)) * item.quantity).toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.quantity > 1 ? `${item.quantity}x @ $${(item.price + Object.values(item.selectedVariations || {}).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0) - (item.discount || 0)).toFixed(2)} ` : ''}
                        {item.selectedVariations && Object.values(item.selectedVariations).map((opt: any) => opt.name).join(', ')}
                        {item.notes && ` - ${item.notes}`}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-dashed border-gray-300 pt-3 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Tax (8.875%)</span>
                    <span>${(subtotal * 0.08875).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Gratuity (20%)</span>
                    <span>${(subtotal * 0.20).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold mt-3 pt-3 border-t border-dashed border-gray-300">
                    <span>TOTAL</span>
                    <span>${(subtotal * 1.28875).toFixed(2)}</span>
                  </div>
                </div>
                
                {/* Jagged Edge */}
                <div className="absolute -bottom-2 left-0 w-full h-2" style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='16' height='8' viewBox='0 0 16 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h16L8 8z' fill='%23ffffff'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat-x'
                }}></div>
              </div>
            </div>

            <div className="p-4 bg-[#22252a] border-t border-white/10 space-y-3">
              <button 
                onClick={(e) => setPaymentMenuRect(e.currentTarget.getBoundingClientRect())}
                className="w-full py-3 bg-[#8bc34a] text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#7cb342] transition-colors shadow-md"
              >
                <span className="material-symbols-outlined">payments</span>
                Process Payment
              </button>
              <button 
                onClick={handleSendToKitchen}
                className="w-full py-3 bg-secondary text-on-secondary rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors shadow-md"
              >
                <span className="material-symbols-outlined">restaurant</span>
                Send to Kitchen
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleSaveForLater}
                  className="py-3 bg-white/10 text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors text-xs shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  Save for Later
                </button>
                <button 
                  onClick={(e) => setNoteMenuRect(e.currentTarget.getBoundingClientRect())}
                  className="py-3 bg-white/10 text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors text-xs shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">edit_note</span>
                  Order Note
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* New Order Menu (3D Touch) */}
      <AnimatePresence>
        {newOrderMenuRect && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[65] bg-black/20 backdrop-blur-sm"
              onClick={() => setNewOrderMenuRect(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className="fixed z-[100] bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl overflow-hidden min-w-[200px]"
              style={{
                top: newOrderMenuRect.bottom + 8,
                left: newOrderMenuRect.left - 160 // Align to the right of the button roughly
              }}
            >
              <div className="flex flex-col py-2">
                <button 
                  onClick={() => {
                    if (onSaveDraft) onSaveDraft();
                    setNewOrderMenuRect(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-left w-full"
                >
                  <span className="material-symbols-outlined text-primary">save</span>
                  <span className="font-medium text-on-surface">Save Draft</span>
                </button>
                <div className="h-px bg-outline-variant/20 my-1" />
                <button 
                  onClick={() => {
                    if (onClearCart) onClearCart();
                    setNewOrderMenuRect(null);
                  }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-error/10 transition-colors text-left w-full text-error"
                >
                  <span className="material-symbols-outlined">delete_sweep</span>
                  <span className="font-medium">Clear Cart</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Payment Menu (3D Touch) */}
      <AnimatePresence>
        {paymentMenuRect && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-md"
              onClick={() => setPaymentMenuRect(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-[100] bg-[#1a1d21] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-80 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="p-4 bg-[#22252a] border-b border-white/10 flex justify-between items-center">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Payment</h3>
                <div className="text-[#8bc34a] font-mono font-bold text-lg">${total.toFixed(2)}</div>
              </div>
              
              <div className="p-4 space-y-4">
                <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                  <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Amount Paid</div>
                  <div className="text-2xl text-white font-mono font-bold flex items-center">
                    <span className="text-gray-500 mr-1">$</span>
                    {amountPaid || '0.00'}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, 'C'].map((num) => (
                    <button
                      key={num}
                      onClick={() => {
                        if (num === 'C') setAmountPaid('');
                        else if (num === '.' && amountPaid.includes('.')) return;
                        else setAmountPaid(prev => prev + num);
                      }}
                      className="h-12 bg-white/5 hover:bg-white/10 text-white rounded-lg font-bold transition-colors active:scale-95"
                    >
                      {num}
                    </button>
                  ))}
                </div>
                
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <div className="text-sm text-gray-400">Change Due:</div>
                  <div className="text-xl text-[#8bc34a] font-mono font-bold">${change.toFixed(2)}</div>
                </div>
                
                <button 
                  onClick={() => {
                    const paid = parseFloat(amountPaid);
                    if (isNaN(paid) || paid < total) {
                      setToast({ message: `Amount paid ($${paid || 0}) is less than total due ($${total.toFixed(2)})`, type: 'error' });
                      setTimeout(() => setToast(null), 3000);
                      return;
                    }
                    setToast({ message: 'Payment recorded successfully!', type: 'success' });
                    setPaymentMenuRect(null);
                    setAmountPaid('');
                    setTimeout(() => setToast(null), 2000);
                  }}
                  className="w-full py-3 bg-[#8bc34a] text-white rounded-xl font-bold hover:bg-[#7cb342] transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">check_circle</span>
                  DONE
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Order Note Menu (3D Touch) */}
      <AnimatePresence>
        {noteMenuRect && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-md"
              onClick={() => setNoteMenuRect(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-[100] bg-[#1a1d21] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-80"
              style={{
                bottom: window.innerHeight - noteMenuRect.top + 16,
                right: window.innerWidth - noteMenuRect.right
              }}
            >
              <div className="p-4 bg-[#22252a] border-b border-white/10">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Order Note</h3>
              </div>
              <div className="p-4 space-y-4">
                <textarea 
                  autoFocus
                  className="w-full h-32 bg-black/30 border border-white/10 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-primary transition-colors resize-none"
                  placeholder="Add a note to this order..."
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                />
                <button 
                  onClick={() => {
                    setToast({ message: 'Note saved!', type: 'success' });
                    setNoteMenuRect(null);
                    setTimeout(() => setToast(null), 2000);
                  }}
                  className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">save</span>
                  SAVE NOTE
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-[100] px-6 py-3 bg-surface-container-highest border border-outline-variant/20 rounded-full shadow-2xl flex items-center gap-3 min-w-[300px]"
          >
            <div className={toast.type === 'success' ? 'text-[#8bc34a]' : 'text-error'}>
              <span className="material-symbols-outlined">
                {toast.type === 'success' ? 'check_circle' : 'error'}
              </span>
            </div>
            <span className="text-on-surface font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Client List Modal */}
      <AnimatePresence>
        {isClientListModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setIsClientListModalOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
                <h3 className="font-headline text-xl font-bold text-on-surface">Client List</h3>
                <button onClick={() => setIsClientListModalOpen(false)} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="overflow-y-auto p-4 flex-1">
                <div className="grid gap-4">
                  {MOCK_CLIENTS.map(client => (
                    <div 
                      key={client.phone} 
                      onClick={() => {
                        handleSelectClient(client);
                        setIsClientListModalOpen(false);
                      }}
                      className="bg-surface-container p-2 px-4 rounded-xl border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-container-high transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-base text-on-surface">{client.name}</div>
                        <div className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[14px]">phone</span>
                          {client.phone}
                        </div>
                        {client.address && (
                          <div className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                            {client.address}
                          </div>
                        )}
                      </div>
                      <div className="bg-surface-variant/50 px-2 py-1 rounded-lg text-[10px] font-medium text-on-surface-variant flex items-center gap-1.5 self-start sm:self-auto">
                        <span className="material-symbols-outlined text-[12px]">history</span>
                        Last: {client.lastOrderTime}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delivery Details Modal */}
      {isDeliveryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDeliveryModalOpen(false)} />
          <div className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
              <h3 className="font-headline text-xl font-bold text-on-surface">Delivery Details</h3>
              <button onClick={() => setIsDeliveryModalOpen(false)} className="text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 bg-surface-container-lowest">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Name</label>
                <input 
                  type="text" 
                  value={deliveryDetails.name}
                  onChange={(e) => setDeliveryDetails({...deliveryDetails, name: e.target.value})}
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Phone Number</label>
                <input 
                  type="tel" 
                  value={deliveryDetails.phone}
                  onChange={(e) => setDeliveryDetails({...deliveryDetails, phone: e.target.value})}
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Delivery Zone</label>
                <select 
                  value={deliveryDetails.zone}
                  onChange={(e) => setDeliveryDetails({...deliveryDetails, zone: e.target.value})}
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none"
                >
                  <option value="" disabled>Select a zone</option>
                  <option value="Zone 1 (Downtown)">Zone 1 (Downtown)</option>
                  <option value="Zone 2 (Northside)">Zone 2 (Northside)</option>
                  <option value="Zone 3 (Eastside)">Zone 3 (Eastside)</option>
                  <option value="Zone 4 (Westside)">Zone 4 (Westside)</option>
                  <option value="Zone 5 (Southside)">Zone 5 (Southside)</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-outline-variant/10 bg-surface-container-low flex justify-end gap-3">
              <button 
                onClick={() => setIsDeliveryModalOpen(false)}
                className="px-5 py-2.5 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => setIsDeliveryModalOpen(false)}
                className="px-5 py-2.5 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-md"
              >
                Save Details
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
