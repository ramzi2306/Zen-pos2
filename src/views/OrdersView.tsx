import React, { useState, useMemo, useEffect } from 'react';
import { Order, CartItem, USERS, User } from '../data';
import { motion, AnimatePresence } from 'motion/react';

const Timer = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
      {formatTime(elapsed)}
    </span>
  );
};

export const OrdersView = ({ 
  orders, 
  setOrders, 
  cart, 
  onEditOrder 
}: { 
  orders: Order[], 
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>, 
  cart: CartItem[], 
  onEditOrder?: (order: Order) => void 
}) => {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderRect, setOrderRect] = useState<DOMRect | null>(null);
  const [tempStatus, setTempStatus] = useState<Order['status']>('Queued');
  const [tempPaymentStatus, setTempPaymentStatus] = useState<Order['paymentStatus']>('Unpaid');
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  // New states for 3D touch menus
  const [cookMenuRect, setCookMenuRect] = useState<DOMRect | null>(null);
  const [assistMenuRect, setAssistMenuRect] = useState<DOMRect | null>(null);
  const [reviewModalOrder, setReviewModalOrder] = useState<Order | null>(null);
  const [reviewForm, setReviewForm] = useState({ stars: 5, comment: '' });

  const handleOrderClick = (order: Order, e: React.MouseEvent<HTMLDivElement>) => {
    if (order.status === 'Draft' && order.id === 'Current Cart') {
      if (onEditOrder) onEditOrder(order);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOrderRect(rect);
    setSelectedOrder(order);
    setTempStatus(order.status);
    setTempPaymentStatus(order.paymentStatus);
  };

  const handleSave = () => {
    if (selectedOrder) {
      if (selectedOrder.id === 'Current Cart') {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const newOrder: Order = {
          id: `ORD-${Math.floor(Math.random() * 10000)}`,
          table: 'N/A',
          status: tempStatus,
          paymentStatus: tempPaymentStatus,
          items: [...cart],
          total: subtotal * 1.08,
          time: 'Just now',
          orderType: 'dine_in'
        };
        setOrders(prev => [newOrder, ...prev]);
      } else {
        setOrders(prev => prev.map(o => 
          o.id === selectedOrder.id 
            ? { ...o, status: tempStatus, paymentStatus: tempPaymentStatus } 
            : o
        ));
      }
      setSelectedOrder(null);
    }
  };

  const handlePrint = () => {
    console.log('Printing recipe for order', selectedOrder?.id);
    setSelectedOrder(null);
  };

  const handleCancelOrder = () => {
    if (selectedOrder) {
      setOrders(prev => prev.map(o => 
        o.id === selectedOrder.id 
          ? { ...o, status: 'Cancelled' as Order['status'] } 
          : o
      ));
      setIsCancelDialogOpen(false);
      setSelectedOrder(null);
      setCancelReason('');
    }
  };

  const statusOptions: Order['status'][] = [
    'Queued', 'Scheduled', 'Preparing', 'Served', 'Packaging', 'Out for delivery', 'Done', 'Draft'
  ];

  const paymentOptions: Order['paymentStatus'][] = ['Paid', 'Unpaid'];

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'Queued': return 'bg-error-container/30 border border-error/20 text-error';
      case 'Scheduled': return 'bg-tertiary-container/30 border border-tertiary/20 text-tertiary';
      case 'Preparing': return 'bg-primary-container/30 border border-primary/10 text-primary';
      case 'Packaging': return 'bg-secondary-container/30 border border-secondary/20 text-secondary';
      case 'Out for delivery': return 'bg-tertiary-container/30 border border-tertiary/20 text-tertiary';
      case 'Cancelled': return 'bg-error/20 border border-error/30 text-error';
      case 'Draft': return 'bg-surface-variant/50 border border-outline/20 text-outline-variant';
      case 'Served':
      case 'Done': return 'bg-surface-variant/50 border border-outline/10 text-outline';
      default: return 'bg-surface-variant/50 text-outline';
    }
  };

  const handlePrepareOrder = (orderId: string, cook: User) => {
    setOrders(prev => prev.map(o => 
      o.id === orderId 
        ? { ...o, status: 'Preparing', startTime: Date.now(), cook } 
        : o
    ));
    setCookMenuRect(null);
  };

  const handleAssistRequest = (orderId: string, assistant: User) => {
    setOrders(prev => prev.map(o => 
      o.id === orderId 
        ? { ...o, assistants: [...(o.assistants || []), assistant] } 
        : o
    ));
    setAssistMenuRect(null);
  };

  const handleOrderServed = (order: Order) => {
    const nextStatus: Order['status'] = order.orderType === 'dine_in' ? 'Served' : 'Packaging';
    setOrders(prev => prev.map(o => 
      o.id === order.id ? { ...o, status: nextStatus } : o
    ));
  };

  const handleAddReview = () => {
    if (reviewModalOrder) {
      setOrders(prev => prev.map(o => 
        o.id === reviewModalOrder.id 
          ? { ...o, review: { stars: reviewForm.stars, comment: reviewForm.comment } } 
          : o
      ));
      setReviewModalOrder(null);
      setReviewForm({ stars: 5, comment: '' });
    }
  };

  const renderOrderCard = (order: Order, isClone = false) => (
    <div className="relative z-10 h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-headline text-2xl font-bold tracking-tight text-on-surface">#{order.id}</h3>
          <p className="font-headline text-xs font-bold tracking-widest uppercase text-outline mt-1">
            {order.orderType.replace('_', ' ')} • TABLE {order.table}
          </p>
          {order.status === 'Scheduled' && order.scheduledTime && (
            <p className="text-[10px] font-bold text-tertiary mt-1 uppercase tracking-wider">
              Scheduled: {order.scheduledTime}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${getStatusColor(order.status)}`}>
            {order.status === 'Preparing' && <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>}
            {order.status === 'Out for delivery' && <span className="w-1.5 h-1.5 bg-tertiary rounded-full"></span>}
            {order.status}
          </span>
          {order.status === 'Preparing' && order.startTime && (
            <Timer startTime={order.startTime} />
          )}
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${order.paymentStatus === 'Paid' ? 'bg-tertiary/20 text-tertiary' : 'bg-error/20 text-error'}`}>
            {order.paymentStatus}
          </span>
        </div>
      </div>

      {/* Cook Info */}
      {(order.cook || order.status === 'Preparing' || order.status === 'Served' || order.status === 'Done' || order.status === 'Packaging') && (
        <div className="flex items-center gap-2 mb-4 p-2 bg-surface-container-highest/50 rounded-lg border border-outline-variant/10">
          {order.cook ? (
            <>
              <img src={order.cook.image} alt={order.cook.name} className="w-8 h-8 rounded-full border border-primary/20" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-on-surface truncate">{order.cook.name}</p>
                <p className="text-[8px] text-outline uppercase tracking-tighter">Primary Cook</p>
              </div>
              {order.assistants && order.assistants.length > 0 && (
                <div className="flex -space-x-2">
                  {order.assistants.map((ast, i) => (
                    <img key={i} src={ast.image} alt={ast.name} title={ast.name} className="w-6 h-6 rounded-full border border-surface-container-highest" />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-outline italic text-[10px]">
              <span className="material-symbols-outlined text-sm">person_off</span>
              No cook assigned
            </div>
          )}
        </div>
      )}

      <div className={`mb-6 flex-1 ${order.isUrgent && !isClone ? 'grid grid-cols-2 gap-x-12 gap-y-3' : 'space-y-3'}`}>
        {order.items.map((item, idx) => (
          <div key={idx} className="flex flex-col text-sm">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">{item.name}</span>
              <span className="text-on-surface/60">x{item.quantity}</span>
            </div>
            {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.values(item.selectedVariations).map((opt: any) => (
                  <span key={opt.id} className="text-[9px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded-sm font-medium">
                    {opt.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 pt-4 border-t border-outline-variant/10 mt-auto">
        {/* Contextual Action Buttons */}
        {!isClone && (
          <div className="flex gap-2">
            {order.status === 'Queued' && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setCookMenuRect(e.currentTarget.getBoundingClientRect());
                  setSelectedOrder(order);
                }}
                className="flex-1 py-2 bg-primary text-on-primary rounded-lg text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">restaurant</span>
                Prepare Order
              </button>
            )}
            {order.status === 'Preparing' && (
              <>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssistMenuRect(e.currentTarget.getBoundingClientRect());
                    setSelectedOrder(order);
                  }}
                  className="flex-1 py-2 bg-surface-container-highest text-on-surface rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-surface-variant transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">group_add</span>
                  Assist
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOrderServed(order);
                  }}
                  className="flex-1 py-2 bg-[#8bc34a] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-[#7cb342] transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Order Served
                </button>
              </>
            )}
            {(order.status === 'Served' || order.status === 'Done' || order.status === 'Packaging') && !order.review && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setReviewModalOrder(order);
                }}
                className="flex-1 py-2 bg-tertiary text-on-tertiary rounded-lg text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">star</span>
                Add Review
              </button>
            )}
            {order.review && (
              <div className="flex-1 flex items-center gap-1 text-tertiary">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className={`material-symbols-outlined text-sm ${i < order.review!.stars ? 'fill-1' : ''}`}>star</span>
                ))}
                <span className="text-[9px] font-bold ml-1">Reviewed</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <span className="text-xs text-outline">{order.items.reduce((acc, i) => acc + i.quantity, 0)} items</span>
            {order.isUrgent && <span className="text-xs text-tertiary font-bold tracking-wide">URGENT</span>}
          </div>
          <span className="font-headline text-lg font-bold text-secondary">${order.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );

  const displayOrders = useMemo(() => {
    if (cart.length === 0) return orders;
    
    const subtotal = cart.reduce((sum, item) => {
      const variationsPrice = Object.values(item.selectedVariations || {}).reduce((vSum: number, opt: any) => vSum + (opt.priceAdjustment || 0), 0);
      const itemPrice = item.price + variationsPrice - (item.discount || 0);
      return sum + (itemPrice * item.quantity);
    }, 0);

    const activeDraft: Order = {
      id: 'Current Cart',
      table: 'N/A',
      status: 'Draft',
      paymentStatus: 'Unpaid',
      items: cart,
      total: subtotal * 1.08,
      time: 'Just now',
      orderType: 'dine_in'
    };
    
    return [activeDraft, ...orders];
  }, [cart, orders]);

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-grid-pattern">
      <div className="w-full">
        <div className="flex items-center justify-between mb-10 border-b border-outline-variant/10 pb-4">
          <div className="flex items-center gap-8">
            <button className="text-secondary border-b-2 border-secondary pb-4 px-1 font-headline text-sm font-bold tracking-wide">All Orders</button>
            <button className="text-primary/70 hover:text-primary transition-opacity pb-4 px-1 font-headline text-sm font-bold tracking-wide">Active</button>
            <button className="text-primary/70 hover:text-primary transition-opacity pb-4 px-1 font-headline text-sm font-bold tracking-wide">Ready</button>
            <button className="text-primary/70 hover:text-primary transition-opacity pb-4 px-1 font-headline text-sm font-bold tracking-wide">Completed</button>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-surface-container rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-[18px]">filter_list</span> Sort by Time
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-secondary text-on-secondary rounded-lg text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-[18px]">add</span> New Order
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayOrders.map(order => (
            <div key={order.id} onClick={(e) => handleOrderClick(order, e)} className={`group relative rounded-xl p-6 transition-all duration-300 hover:bg-surface-container-high cursor-pointer overflow-hidden ${order.isUrgent ? 'bg-surface-container border border-primary/20 lg:col-span-2' : 'bg-surface-container'} ${order.status === 'Draft' ? 'opacity-70 grayscale-[0.5]' : ''}`}>
              {renderOrderCard(order)}
            </div>
          ))}
        </div>
      </div>

      {/* 3D Touch Order Actions Overlay */}
      <AnimatePresence>
        {selectedOrder && orderRect && (
          <div className="fixed inset-0 z-[80]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setSelectedOrder(null)} 
            />
            
            {(() => {
              const menuHeight = 420; // Estimated height of actions menu
              const scale = 1.03;
              const scaledHeight = orderRect.height * scale;
              const scaledWidth = orderRect.width * scale;
              const isDesktop = window.innerWidth >= 768;
              
              let safeTop = orderRect.top;
              let menuTop = 0;
              let menuLeft = 0;
              const menuWidth = Math.max(orderRect.width, 320);
              let transformOrigin = 'top';

              if (isDesktop) {
                // Desktop: Position to the right
                if (safeTop + menuHeight > window.innerHeight - 20) {
                  safeTop = Math.max(20, window.innerHeight - 20 - menuHeight);
                }
                menuTop = safeTop;
                
                menuLeft = orderRect.left + scaledWidth + 16;
                transformOrigin = 'left top';
                
                // If menu goes off right of screen, shift it to the left of the card
                if (menuLeft + menuWidth > window.innerWidth - 20) {
                  menuLeft = orderRect.left - menuWidth - 16;
                  transformOrigin = 'right top';
                }
              } else {
                // Mobile: Position below
                if (safeTop + scaledHeight + 16 + menuHeight > window.innerHeight - 20) {
                  safeTop = Math.max(20, window.innerHeight - 20 - menuHeight - 16 - scaledHeight);
                }
                menuTop = safeTop + scaledHeight + 16;
                
                menuLeft = orderRect.left;
                transformOrigin = 'top';
                
                if (menuLeft + menuWidth > window.innerWidth - 20) {
                  menuLeft = Math.max(20, window.innerWidth - 20 - menuWidth);
                }
              }

              return (
                <>
                  {/* Cloned Order Card */}
                  <motion.div
                    initial={{ 
                      top: orderRect.top, 
                      left: orderRect.left, 
                      width: orderRect.width, 
                      height: orderRect.height,
                      scale: 1
                    }}
                    animate={{ 
                      top: safeTop,
                      scale: scale,
                    }}
                    exit={{ 
                      top: orderRect.top,
                      scale: 1,
                      opacity: 0
                    }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className={`fixed z-[90] rounded-xl p-6 overflow-hidden flex flex-col border shadow-2xl pointer-events-none origin-top ${selectedOrder.isUrgent ? 'bg-surface-container border-primary/20' : 'bg-surface-container border-outline-variant/20'}`}
                  >
                    {renderOrderCard(selectedOrder, true)}
                  </motion.div>

                  {/* Actions Menu */}
                  <motion.div
                    initial={{ opacity: 0, y: isDesktop ? 0 : -20, x: isDesktop ? (transformOrigin === 'right top' ? 20 : -20) : 0, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                    exit={{ opacity: 0, y: isDesktop ? 0 : -20, x: isDesktop ? (transformOrigin === 'right top' ? 20 : -20) : 0, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300, delay: 0.05 }}
                    style={{
                      position: 'fixed',
                      top: menuTop,
                      left: menuLeft,
                      width: menuWidth,
                      transformOrigin: transformOrigin,
                    }}
                    className="z-[90] bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col"
                  >
                    {/* Header with Print Button */}
                    <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 bg-surface-container-low">
                      <h3 className="font-headline font-bold text-sm text-on-surface">Manage Order</h3>
                      <button onClick={handlePrint} className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[18px]">print</span>
                        Print
                      </button>
                    </div>

                    <div className="p-5 overflow-y-auto max-h-[60vh] space-y-6">
                      {/* Order Status */}
                      <div>
                        <h4 className="font-headline font-bold text-xs text-on-surface mb-3 uppercase tracking-wider">Order Status</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {statusOptions.map(status => (
                            <button
                              key={status}
                              onClick={() => setTempStatus(status)}
                              className={`p-2.5 rounded-lg border text-left transition-all text-xs font-bold ${
                                tempStatus === status 
                                  ? 'border-primary bg-primary/10 text-primary' 
                                  : 'border-outline-variant/20 bg-surface-container hover:bg-surface-container-high text-on-surface'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Payment Status */}
                      <div>
                        <h4 className="font-headline font-bold text-xs text-on-surface mb-3 uppercase tracking-wider">Payment Status</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {paymentOptions.map(status => (
                            <button
                              key={status}
                              onClick={() => setTempPaymentStatus(status)}
                              className={`p-2.5 rounded-lg border text-center transition-all text-xs font-bold ${
                                tempPaymentStatus === status 
                                  ? (status === 'Paid' ? 'border-tertiary bg-tertiary/10 text-tertiary' : 'border-error bg-error/10 text-error')
                                  : 'border-outline-variant/20 bg-surface-container hover:bg-surface-container-high text-on-surface'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="p-4 border-t border-outline-variant/10 bg-surface-container-low flex gap-2">
                      <button 
                        onClick={() => {
                          if (onEditOrder && selectedOrder) {
                            onEditOrder(selectedOrder);
                          }
                        }}
                        className="flex-1 py-3 bg-surface-container-highest text-on-surface rounded-lg text-xs font-bold hover:bg-surface-variant transition-colors shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                        Edit Order
                      </button>
                      <button 
                        onClick={() => setIsCancelDialogOpen(true)}
                        className="flex-1 py-3 bg-error/10 text-error rounded-lg text-xs font-bold hover:bg-error/20 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                        Cancel
                      </button>
                      <button 
                        onClick={handleSave}
                        className="w-12 py-3 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-md flex items-center justify-center flex-shrink-0"
                      >
                        <span className="material-symbols-outlined text-lg">save</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              );
            })()}
          </div>
        )}
      </AnimatePresence>

      {/* Cook Selection Menu (3D Touch) */}
      <AnimatePresence>
        {cookMenuRect && selectedOrder && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-md"
              onClick={() => setCookMenuRect(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-[120] bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden w-64"
              style={{
                top: Math.min(cookMenuRect.top, window.innerHeight - 350),
                left: Math.min(cookMenuRect.left, window.innerWidth - 280)
              }}
            >
              <div className="p-4 bg-surface-container-low border-b border-outline-variant/10">
                <h3 className="text-on-surface font-bold text-xs uppercase tracking-wider">Assign Cook</h3>
              </div>
              <div className="p-2 max-h-80 overflow-y-auto">
                {USERS.filter(u => u.role === 'Cook').map(user => (
                  <button
                    key={user.id}
                    onClick={() => handlePrepareOrder(selectedOrder.id, user)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-surface-container transition-colors rounded-xl text-left"
                  >
                    <img src={user.image} alt={user.name} className="w-10 h-10 rounded-full border border-outline-variant/20" />
                    <div>
                      <p className="text-sm font-bold text-on-surface">{user.name}</p>
                      <p className="text-[10px] text-outline uppercase tracking-wider">{user.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Assist Selection Menu (3D Touch) */}
      <AnimatePresence>
        {assistMenuRect && selectedOrder && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-md"
              onClick={() => setAssistMenuRect(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-[120] bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden w-64"
              style={{
                top: Math.min(assistMenuRect.top, window.innerHeight - 350),
                left: Math.min(assistMenuRect.left, window.innerWidth - 280)
              }}
            >
              <div className="p-4 bg-surface-container-low border-b border-outline-variant/10">
                <h3 className="text-on-surface font-bold text-xs uppercase tracking-wider">Request Assistance</h3>
              </div>
              <div className="p-2 max-h-80 overflow-y-auto">
                {USERS.filter(u => u.id !== selectedOrder.cook?.id).map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleAssistRequest(selectedOrder.id, user)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-surface-container transition-colors rounded-xl text-left"
                  >
                    <img src={user.image} alt={user.name} className="w-10 h-10 rounded-full border border-outline-variant/20" />
                    <div>
                      <p className="text-sm font-bold text-on-surface">{user.name}</p>
                      <p className="text-[10px] text-outline uppercase tracking-wider">{user.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Review Modal */}
      <AnimatePresence>
        {reviewModalOrder && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setReviewModalOrder(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-outline-variant/10 bg-surface-container-low">
                <h3 className="font-headline text-xl font-bold text-on-surface">Add Review</h3>
                <p className="text-xs text-outline mt-1 uppercase tracking-widest">Order #{reviewModalOrder.id}</p>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Client Info */}
                <div className="p-4 bg-surface-container rounded-xl border border-outline-variant/10 space-y-2">
                  <h4 className="text-[10px] font-bold text-outline uppercase tracking-widest">Client Information</h4>
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">person</span>
                    <span className="text-sm font-bold text-on-surface">{reviewModalOrder.customer?.name || 'Walk-in Customer'}</span>
                  </div>
                  {reviewModalOrder.customer?.phone && (
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">phone</span>
                      <span className="text-sm text-on-surface-variant">{reviewModalOrder.customer.phone}</span>
                    </div>
                  )}
                  {reviewModalOrder.customer?.address && (
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">location_on</span>
                      <span className="text-sm text-on-surface-variant">{reviewModalOrder.customer.address}</span>
                    </div>
                  )}
                </div>

                {/* Stars */}
                <div className="flex flex-col items-center gap-3">
                  <label className="text-xs font-bold text-outline uppercase tracking-widest">Rating</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setReviewForm({ ...reviewForm, stars: star })}
                        className={`material-symbols-outlined text-4xl transition-all ${
                          star <= reviewForm.stars ? 'text-tertiary fill-1 scale-110' : 'text-outline-variant'
                        }`}
                      >
                        star
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comment */}
                <div>
                  <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-2">Comment</label>
                  <textarea
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    className="w-full bg-surface-container border border-outline-variant/20 rounded-xl p-4 text-sm text-on-surface focus:outline-none focus:border-tertiary focus:ring-1 focus:ring-tertiary transition-all resize-none h-32"
                    placeholder="Describe the experience..."
                  />
                </div>
              </div>

              <div className="p-4 border-t border-outline-variant/10 bg-surface-container-low flex justify-end gap-3">
                <button 
                  onClick={() => setReviewModalOrder(null)}
                  className="px-6 py-2.5 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddReview}
                  className="px-6 py-2.5 bg-tertiary text-on-tertiary rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md"
                >
                  Submit Review
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Cancel Dialog */}
      <AnimatePresence>
        {isCancelDialogOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsCancelDialogOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-3xl">warning</span>
                </div>
                <h3 className="font-headline text-xl font-bold text-on-surface mb-2">Cancel Order?</h3>
                <p className="text-sm text-on-surface-variant">
                  Are you sure you want to cancel order #{selectedOrder?.id}? This action cannot be undone.
                </p>
              </div>
              <div className="p-4 bg-surface-container-low flex gap-3">
                <button 
                  onClick={() => setIsCancelDialogOpen(false)}
                  className="flex-1 py-3 bg-surface-container-highest text-on-surface rounded-xl text-sm font-bold hover:bg-surface-variant transition-colors"
                >
                  No, Keep It
                </button>
                <button 
                  onClick={handleCancelOrder}
                  className="flex-1 py-3 bg-error text-on-error rounded-xl text-sm font-bold hover:bg-error/90 transition-colors shadow-md"
                >
                  Yes, Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
