import React, { useState } from 'react';
import { Sidebar, TopBar, CartSidebar, MobileNav, CartFloatingAction, ProfilePanel } from './components/Layout';
import { MenuView } from './views/MenuView';
import { OrdersView } from './views/OrdersView';
import { InventoryView, SettingsView } from './views/AdminViews';
import { AttendanceView } from './views/AttendanceView';
import { AdminLoginView } from './views/AdminLoginView';
import { Product, CartItem, VariationOption, Order, ORDERS, User, ROLES, Permission } from './data';
import { VirtualKeyboard } from './components/VirtualKeyboard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState('menu');
  const [currentSetting, setCurrentSetting] = useState('branding');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>(ORDERS);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const hasPermission = (permission: Permission) => {
    if (!currentUser) return false;
    const role = ROLES.find(r => r.id === currentUser.roleId);
    return role?.permissions.includes(permission) || false;
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // Set initial view based on permissions
    if (user.roleId === 'r_cook') {
      setCurrentView('orders');
    } else if (user.roleId === 'r_attendance_manager') {
      setCurrentView('attendance');
    } else if (user.roleId === 'r_hr_manager') {
      setCurrentView('admin_panel');
      setCurrentSetting('team');
    } else {
      setCurrentView('menu');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('menu');
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
    if (order.status === 'Draft' && order.id !== 'Current Cart') {
      setOrders(prev => prev.filter(o => o.id !== order.id));
    }
    setCurrentView('menu');
    setIsCartOpen(true);
  };

  const clearCart = () => {
    setCart([]);
  };

  const saveDraft = () => {
    if (cart.length === 0) return;
    const subtotal = cart.reduce((sum, item) => {
      const variationsPrice = Object.values(item.selectedVariations || {}).reduce((vSum: number, opt: any) => vSum + (opt.priceAdjustment || 0), 0);
      const itemPrice = item.price + variationsPrice - (item.discount || 0);
      return sum + (itemPrice * item.quantity);
    }, 0);
    
    const newDraft: Order = {
      id: `DRAFT-${Math.floor(Math.random() * 10000)}`,
      table: 'N/A',
      status: 'Draft' as any,
      paymentStatus: 'Unpaid',
      items: [...cart],
      total: subtotal * 1.08, // including tax
      time: 'Just now',
      orderType: 'dine_in'
    };
    setOrders(prev => [newDraft, ...prev]);
    setCart([]);
  };

  if (!currentUser) {
    return <AdminLoginView onLogin={handleLogin} />;
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div 
        className={`flex flex-col h-full overflow-hidden text-on-surface pb-20 lg:pb-0 transition-all duration-500 ease-in-out ${
          isProfileOpen ? 'blur-xl scale-[0.96] opacity-40 pointer-events-none' : 'blur-0 scale-100 opacity-100'
        }`}
      >
        {currentView !== 'attendance' && (
          <TopBar 
            currentView={currentView} 
            setCurrentView={setCurrentView} 
            isProfileOpen={isProfileOpen}
            setIsProfileOpen={setIsProfileOpen}
            currentUser={currentUser}
            hasPermission={hasPermission}
          />
        )}
        
        <div className="flex-1 flex overflow-hidden">
          {(currentView === 'pos_settings' || currentView === 'admin_panel') && (
            <Sidebar 
              type={currentView as 'pos_settings' | 'admin_panel'} 
              currentSetting={currentSetting} 
              setCurrentSetting={setCurrentSetting} 
              hasPermission={hasPermission}
            />
          )}
          
          <main className="flex-1 flex flex-col overflow-hidden relative">
            {currentView === 'menu' && hasPermission('view_menu') && <MenuView addToCart={addToCart} />}
            {currentView === 'orders' && hasPermission('view_orders') && <OrdersView orders={orders} setOrders={setOrders} cart={cart} onEditOrder={handleEditOrder} />}
            {currentView === 'inventory' && hasPermission('view_inventory') && <InventoryView />}
            {(currentView === 'pos_settings' || currentView === 'admin_panel') && <SettingsView currentSetting={currentSetting} hasPermission={hasPermission} />}
            {currentView === 'attendance' && hasPermission('view_attendance') && <AttendanceView setCurrentView={setCurrentView} />}
            
            {/* Fallback if no permission for current view */}
            {((currentView === 'menu' && !hasPermission('view_menu')) ||
              (currentView === 'orders' && !hasPermission('view_orders')) ||
              (currentView === 'inventory' && !hasPermission('view_inventory')) ||
              (currentView === 'attendance' && !hasPermission('view_attendance'))) && (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <div className="max-w-md">
                  <span className="material-symbols-outlined text-6xl text-error mb-4">lock</span>
                  <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                  <p className="text-on-surface-variant">You do not have permission to view this page. Please contact your administrator if you believe this is an error.</p>
                </div>
              </div>
            )}

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
                onSaveDraft={saveDraft}
              />
            </>
          )}
        </div>

        <MobileNav 
          currentView={currentView} 
          setCurrentView={setCurrentView} 
          onOpenCart={() => setIsCartOpen(true)} 
          hasPermission={hasPermission}
        />
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
      />
    </div>
  );
}
