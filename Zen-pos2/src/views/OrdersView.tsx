import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Order, CartItem, User } from '../data';
import { motion, AnimatePresence } from 'motion/react';
import { getCartItemPrice, getSubtotal } from '../utils/cartUtils';
import { buildReceiptHtml, firePrint } from '../utils/printReceipt';
import * as api from '../api';
import { playSound } from '../utils/sounds';
import type { BrandingData } from '../api/settings';
import { DEFAULT_BRANDING } from '../api/settings';
import { useLocalization } from '../context/LocalizationContext';
import QRCode from 'react-qr-code';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const Timer = ({ startTime, endTime, running, label }: { startTime: number; endTime?: number; running: boolean; label?: string }) => {
  const frozenElapsed = endTime ? Math.floor((endTime - startTime) / 1000) : null;
  const [elapsed, setElapsed] = useState(() =>
    frozenElapsed !== null ? frozenElapsed : Math.floor((Date.now() - startTime) / 1000)
  );

  useEffect(() => {
    if (!running) {
      setElapsed(frozenElapsed !== null ? frozenElapsed : Math.floor((Date.now() - startTime) / 1000));
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, endTime, running, frozenElapsed]);

  return (
    <div className="flex flex-col items-end gap-0.5">
      {label && <span className="text-[8px] font-bold uppercase tracking-widest text-outline leading-none">{label}</span>}
      <span className={`text-xl font-mono font-bold px-3 py-1 rounded-lg tracking-tight ${
        running
          ? 'text-primary bg-primary/10'
          : 'text-outline bg-surface-variant/60'
      }`}>
        {formatTime(elapsed)}
      </span>
    </div>
  );
};

export const OrdersView = ({
  orders,
  setOrders,
  cart,
  onEditOrder,
  users = [],
  onRefresh,
  branding,
  recentlyUpdatedIds,
  onClearRecentlyUpdated,
}: {
  orders: Order[],
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>,
  cart: CartItem[],
  onEditOrder?: (order: Order) => void,
  users?: User[],
  onRefresh?: (date?: string, start?: string, end?: string) => void,
  branding?: BrandingData,
  recentlyUpdatedIds?: Set<string>,
  onClearRecentlyUpdated?: (id: string) => void,
}) => {
  const { formatCurrency, localization } = useLocalization();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const [dateFilter, setDateFilter] = useState<{
    type: 'today' | 'yesterday' | 'week' | 'custom';
    date?: string;
    start?: string;
    end?: string;
  }>(() => {
    const saved = localStorage.getItem('zenpos_orders_date_filter');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // If it was 'today' or 'yesterday', we should use the CURRENT today/yesterday
        if (parsed.type === 'today') return { type: 'today', date: today };
        if (parsed.type === 'yesterday') return { type: 'yesterday', date: yesterday };
        if (parsed.type === 'week') return { type: 'week', start: lastWeek, end: today };
        return parsed;
      } catch {
        return { type: 'today', date: today };
      }
    }
    return { type: 'today', date: today };
  });

  useEffect(() => {
    localStorage.setItem('zenpos_orders_date_filter', JSON.stringify(dateFilter));
  }, [dateFilter]);

  const [statusFilter, setStatusFilter] = useState<string>('active');

  const FILTER_TABS: { key: string; label: string; statuses: Order['status'][] }[] = [
    { key: 'all',       label: 'All Orders', statuses: [] },
    { key: 'active',    label: 'Active',     statuses: ['Verification', 'Queued', 'Scheduled', 'Preparing'] },
    { key: 'draft',     label: 'Drafts',     statuses: ['Draft'] },
    { key: 'online',    label: 'Online',     statuses: ['Verification'] },
    { key: 'ready',     label: 'Ready',      statuses: ['Served', 'Packaging', 'Out for delivery'] },
    { key: 'completed', label: 'Completed',  statuses: ['Done'] },
    { key: 'cancelled', label: 'Cancelled',  statuses: ['Cancelled'] },
  ];

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderRect, setOrderRect] = useState<DOMRect | null>(null);
  const [scheduledTime, setScheduledTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingScheduled, setPendingScheduled] = useState(false);
  const [receiptModal, setReceiptModal] = useState<Order | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const b: BrandingData = branding ?? DEFAULT_BRANDING;
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [callCustomerOrder, setCallCustomerOrder] = useState<Order | null>(null);
  const [callCustomerLoading, setCallCustomerLoading] = useState<'queue' | 'cancel' | null>(null);
  // Delivery agent picker
  const [agentPickerOrder, setAgentPickerOrder] = useState<Order | null>(null);
  const [deliveryAgents, setDeliveryAgents] = useState<{ id: string; name: string; phone: string; vehicle_type: string; is_active: boolean }[]>([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [newAgentForm, setNewAgentForm] = useState({ name: '', phone: '' });
  const [showNewAgentForm, setShowNewAgentForm] = useState(false);

  useEffect(() => {
    api.orders.listOrders(users, dateFilter.date, undefined, dateFilter.start, dateFilter.end)
      .then(setOrders)
      .catch(console.error);
  }, [dateFilter, users]);

  // Keep a ref so the interval callback always sees current orders without being recreated on every change
  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // Auto-transition "Out for delivery" → "Done" after 45 minutes.
  // Interval is created once (empty deps) — ordersRef gives it fresh data each tick.
  useEffect(() => {
    const DELIVERY_TIMEOUT_MS = 45 * 60 * 1000;
    const interval = setInterval(async () => {
      const outForDelivery = ordersRef.current.filter(o => o.status === 'Out for delivery' && o.endTime);
      for (const order of outForDelivery) {
        const elapsed = Date.now() - order.endTime!;
        if (elapsed >= DELIVERY_TIMEOUT_MS) {
          try {
            await api.orders.updateOrderStatus(order.id, 'Done');
            setOrders(prev => prev.map(o =>
              o.id === order.id ? { ...o, status: 'Done' as Order['status'] } : o
            ));
            playSound('status_done');
          } catch {
            // silently ignore — will retry next tick
          }
        }
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for new online orders arriving from the storefront (WebSocket + storage)
  useEffect(() => {
    const refetch = () => api.orders.listOrders(users, dateFilter.date, undefined, dateFilter.start, dateFilter.end).then(setOrders).catch(() => {});
    const onStorage = (e: StorageEvent) => { if (e.key === 'zenpos_mock_online_orders') refetch(); };

    window.addEventListener('storage', onStorage);
    window.addEventListener('zenpos:new_order', refetch as EventListener);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('zenpos:new_order', refetch as EventListener);
    };
  }, [dateFilter, users, setOrders]);


  const getValidTransitions = (order: Order): Order['status'][] => {
    const map: Record<string, Order['status'][]> = {
      'Draft':            ['Queued', 'Cancelled'],
      'Verification':     ['Queued', 'Cancelled'],
      'Queued':           ['Preparing', 'Scheduled', 'Cancelled'],
      'Scheduled':        ['Queued', 'Cancelled'],
      'Preparing':        order.orderType === 'dine_in'
                            ? ['Served', 'Cancelled']
                            : ['Packaging', 'Cancelled'],
      'Served':           ['Done'],
      'Packaging':        order.orderType === 'delivery'
                            ? ['Out for delivery', 'Done']
                            : ['Done'],
      'Out for delivery': ['Done'],
      'Done':             [],
      'Cancelled':        [],
    };
    return map[order.status] ?? [];
  };
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // New states for 3D touch menus
  const [cookMenuRect, setCookMenuRect] = useState<DOMRect | null>(null);
  const [assistMenuRect, setAssistMenuRect] = useState<DOMRect | null>(null);
  const [reviewModalOrder, setReviewModalOrder] = useState<Order | null>(null);
  const [reviewForm, setReviewForm] = useState({ stars: 5, comment: '' });

  // Lock body scroll while any overlay is open to prevent anchor-scroll
  useEffect(() => {
    const isOverlayOpen = !!(selectedOrder || cookMenuRect || assistMenuRect || reviewModalOrder);
    document.body.style.overflow = isOverlayOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedOrder, cookMenuRect, assistMenuRect, reviewModalOrder]);

  const handleOrderClick = (order: Order, e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onClearRecentlyUpdated?.(order.id);
    if (order.status === 'Draft' && order.id === 'Current Cart') {
      if (onEditOrder) onEditOrder(order);
      return;
    }
    const el = e.currentTarget;
    const container = scrollContainerRef.current;

    if (container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Always center the card vertically in its scroll container
      container.scrollTop =
        container.scrollTop +
        elRect.top - containerRect.top -
        containerRect.height / 2 +
        elRect.height / 2;
    }

    // Capture rect after the instant scroll settles in the next paint
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      setOrderRect(rect);
      setSelectedOrder(order);
      setScheduledTime('');
      setPendingScheduled(false);
    });
  };

  const handleStatusSelect = async (status: Order['status']) => {
    if (!selectedOrder || status === selectedOrder.status || isSaving) return;
    if (status === 'Scheduled') { setPendingScheduled(true); return; }
    // Intercept "Out for delivery" to show agent picker
    if (status === 'Out for delivery') {
      try {
        const agents = await api.delivery.listAgents();
        setDeliveryAgents(agents);
      } catch { setDeliveryAgents([]); }
      setAgentPickerOrder(selectedOrder);
      setSelectedOrder(null);
      return;
    }
    setPendingScheduled(false);
    setIsSaving(true);
    try {
      const updated = await api.orders.updateOrderStatus(selectedOrder.id, status);
      const merged = { ...updated, endTime: selectedOrder.status === 'Preparing' ? Date.now() : updated.endTime };
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? merged : o));
      setSelectedOrder(merged);
      onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
    } catch (err: any) {
      console.error('Status update failed:', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduleConfirm = async () => {
    if (!selectedOrder || !scheduledTime || isSaving) return;
    setIsSaving(true);
    try {
      const updated = await api.orders.updateOrderStatus(selectedOrder.id, 'Scheduled', scheduledTime);
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updated : o));
      setSelectedOrder(updated);
      setPendingScheduled(false);
      onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
    } catch (err: any) {
      console.error('Schedule update failed:', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaymentSelect = async (status: Order['paymentStatus']) => {
    if (!selectedOrder || status === selectedOrder.paymentStatus || isSaving) return;
    setIsSaving(true);
    try {
      const updated = await api.orders.updateOrderPayment(selectedOrder.id, status);
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updated : o));
      setSelectedOrder(updated);
      onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
    } catch (err: any) {
      console.error('Payment update failed:', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintReceipt = () => {
    if (!receiptModal) return;
    const trackingUrl = receiptModal.trackingToken
      ? `${window.location.origin}/track/${receiptModal.trackingToken}`
      : `${window.location.origin}/track/${receiptModal.orderNumber}`;
    const items = receiptModal.items.map(item => {
      const itemPrice = getCartItemPrice(item);
      const lineTotal = (itemPrice - (item.discount || 0)) * item.quantity;
      const varNames = Object.values(item.selectedVariations || {}).map((o: any) => o.name).join(', ');
      const suppNames = Object.values(item.selectedSupplements || {}).map((o: any) => o.name).join(', ');
      const modifiers = [varNames, suppNames].filter(Boolean).join(' | ');
      return { name: item.name, quantity: item.quantity, lineTotal, modifiers, notes: item.notes };
    });
    const html = buildReceiptHtml({
      branding: b,
      orderNumber: receiptModal.orderNumber,
      orderType: receiptModal.orderType ?? 'dine_in',
      date: receiptModal.createdAt ? new Date(receiptModal.createdAt) : new Date(),
      items,
      customer: receiptModal.customer
        ? { name: receiptModal.customer.name, phone: receiptModal.customer.phone, address: receiptModal.customer.address }
        : undefined,
      notes: receiptModal.notes || undefined,
      subtotal: receiptModal.subtotal ?? receiptModal.total,
      taxAmount: receiptModal.tax ?? 0,
      taxRate: localization.taxEnabled ? localization.taxRate : undefined,
      total: receiptModal.total,
      trackingUrl,
      formatCurrency,
    });
    firePrint(html);
  };

  useEffect(() => {
    if (printReady && receiptModal) {
      handlePrintReceipt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printReady, receiptModal]);

  const handlePrint = () => {
    if (!selectedOrder) return;
    setReceiptModal(selectedOrder);
    setSelectedOrder(null);
    setOrderRect(null);
    setPrintReady(false);
    setTimeout(() => setPrintReady(true), 3000);
  };

  const handleCancelOrder = async () => {
    if (selectedOrder) {
      try {
        await api.orders.updateOrderStatus(selectedOrder.id, 'Cancelled');
        setOrders(prev => prev.map(o =>
          o.id === selectedOrder.id
            ? { ...o, status: 'Cancelled' as Order['status'] }
            : o
        ));
        onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
      } catch (err: any) {
        console.error('Cancel order failed:', err.message);
      }
      setIsCancelDialogOpen(false);
      setSelectedOrder(null);
      setCancelReason('');
    }
  };

  const paymentOptions: Order['paymentStatus'][] = ['Paid', 'Unpaid'];

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'Queued': return 'bg-orange-500/15 border border-orange-400/30 text-orange-400 shadow-[0_0_10px_2px_rgba(251,146,60,0.25)]';
      case 'Scheduled': return 'bg-tertiary-container/30 border border-tertiary/20 text-tertiary';
      case 'Preparing': return 'bg-green-500/15 border border-green-500/30 text-green-400 shadow-[0_0_10px_2px_rgba(74,222,128,0.25)]';
      case 'Packaging': return 'bg-secondary-container/30 border border-secondary/20 text-secondary';
      case 'Out for delivery': return 'bg-tertiary-container/30 border border-tertiary/20 text-tertiary';
      case 'Cancelled': return 'bg-error/20 border border-error/30 text-error';
      case 'Draft': return 'bg-surface-variant/50 border border-outline/20 text-outline-variant';
      case 'Verification': return 'bg-amber-500/15 border border-amber-400/30 text-amber-400 shadow-[0_0_10px_2px_rgba(245,158,11,0.25)]';
      case 'Served':
      case 'Done': return 'bg-surface-variant/50 border border-outline/10 text-outline';
      default: return 'bg-surface-variant/50 text-outline';
    }
  };

  const handlePrepareOrder = async (orderId: string, cook: User) => {
    try {
      const updated = await api.orders.assignCook(orderId, cook.id, users);
      await api.orders.updateOrderStatus(orderId, 'Preparing');
      setOrders(prev => prev.map(o => o.id === orderId ? { ...updated, status: 'Preparing', startTime: Date.now(), cook } : o));
      onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
    } catch (err: any) { console.error(err.message); }
    setCookMenuRect(null);
  };

  const handleAssistRequest = async (orderId: string, assistant: User) => {
    try {
      const updated = await api.orders.assignAssistant(orderId, assistant.id, users);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...updated, assistants: [...(o.assistants || []), assistant] } : o));
      onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
    } catch (err: any) { console.error(err.message); }
    setAssistMenuRect(null);
  };

  const handleOrderServed = async (order: Order) => {
    const nextStatus: Order['status'] = order.orderType === 'dine_in' ? 'Served' : 'Packaging';
    try {
      await api.orders.updateOrderStatus(order.id, nextStatus);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: nextStatus, endTime: o.status === 'Preparing' ? Date.now() : o.endTime } : o));
      onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
    } catch (err: any) { console.error(err.message); }
  };

  const handleAddReview = async () => {
    if (reviewModalOrder) {
      try {
        await api.orders.submitReview(reviewModalOrder.id, reviewForm.stars, reviewForm.comment);
        setOrders(prev => prev.map(o => o.id === reviewModalOrder.id
          ? { ...o, review: { stars: reviewForm.stars, comment: reviewForm.comment }, status: 'Done' } : o));
      } catch (err: any) { console.error(err.message); }
      setReviewModalOrder(null);
      setReviewForm({ stars: 5, comment: '' });
    }
  };

  const handleCallCustomerAction = async (action: 'queue' | 'cancel') => {
    if (!callCustomerOrder) return;
    setCallCustomerLoading(action);
    try {
      const newStatus = action === 'queue' ? 'Queued' : 'Cancelled';
      const updated = await api.orders.updateOrderStatus(callCustomerOrder.id, newStatus);
      setOrders(prev => prev.map(o => o.id === callCustomerOrder!.id ? updated : o));
      onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
      setCallCustomerOrder(null);
    } catch (err: any) { 
      console.error(`${action === 'queue' ? 'Queue' : 'Cancel'} failed:`, err.message);
    } finally {
      setCallCustomerLoading(null);
    }
  };

  const renderOrderCard = (order: Order, isClone = false) => (
    <div className="relative z-10 h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-headline text-2xl font-bold tracking-tight text-on-surface">{order.orderNumber ?? `#${order.id.slice(-4)}`}</h3>
          <div className="text-[10px] text-outline-variant font-medium mt-1 mb-2 uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px]">schedule</span>
            {order.createdAt ? new Date(order.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (order.time || '')}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {(() => {
              const typeConfig: Record<string, { icon: string; label: string; cls: string }> = {
                dine_in:  { icon: 'restaurant',     label: 'Dine In',  cls: 'bg-[#8bc34a]/15 text-[#8bc34a] border-[#8bc34a]/30' },
                takeaway: { icon: 'takeout_dining', label: 'Takeaway', cls: 'bg-primary/15 text-primary border-primary/30' },
                delivery: { icon: 'local_shipping', label: 'Delivery', cls: 'bg-tertiary/15 text-tertiary border-tertiary/30' },
                online:   { icon: 'public',         label: 'Online',   cls: 'bg-amber-500/15 text-amber-400 border-amber-400/30' },
              };
              const cfg = typeConfig[order.orderType] ?? { icon: 'restaurant', label: order.orderType, cls: 'bg-surface-variant text-outline border-outline/20' };
              return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${cfg.cls}`}>
                  <span className="material-symbols-outlined text-[11px]">{cfg.icon}</span>
                  {cfg.label}
                </span>
              );
            })()}
            {order.table && (
              <span className="text-[9px] font-bold text-outline uppercase tracking-wider">TABLE {order.table}</span>
            )}
          </div>
          {order.status === 'Scheduled' && order.scheduledTime && (
            <p className="text-[10px] font-bold text-tertiary mt-1 uppercase tracking-wider">
              Scheduled: {order.scheduledTime}
            </p>
          )}
          {order.notes && (
            <div className="flex items-start gap-1.5 mt-2 bg-surface-container-highest/60 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-base text-outline-variant mt-0.5 flex-shrink-0">sticky_note_2</span>
              <p className="text-sm text-on-surface-variant leading-snug">{order.notes}</p>
            </div>
          )}
          {order.channel === 'online' && order.customer && (
            <div className="flex items-start gap-1.5 mt-2 bg-amber-500/8 border border-amber-400/20 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-sm text-amber-400 mt-0.5 flex-shrink-0">person</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-on-surface truncate">{order.customer.name}</p>
                <p className="text-[10px] text-outline font-medium">{order.customer.phone}</p>
                {order.customer.address && (
                  <p className="text-[9px] text-outline-variant truncate">{order.customer.address}</p>
                )}
              </div>
            </div>
          )}
          {/* Delivery Agent */}
          {order.deliveryAgent && order.status === 'Out for delivery' && (
            <div className="flex items-center gap-1.5 mt-2 bg-tertiary/8 border border-tertiary/20 rounded-lg px-3 py-2">
              <span className="material-symbols-outlined text-sm text-tertiary flex-shrink-0">person_pin</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-on-surface truncate">{order.deliveryAgent.name}</p>
                <p className="text-[10px] text-outline font-medium">{order.deliveryAgent.phone}</p>
              </div>
              <span className="text-[8px] font-bold uppercase tracking-widest text-tertiary bg-tertiary/10 px-1.5 py-0.5 rounded">Driver</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${getStatusColor(order.status)}`}>
            {order.status === 'Queued' && <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(251,146,60,0.9)]"></span>}
            {order.status === 'Preparing' && <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.9)]"></span>}
            {order.status === 'Out for delivery' && <span className="w-1.5 h-1.5 bg-tertiary rounded-full"></span>}
            {order.status === 'Verification' && <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(245,158,11,0.9)]"></span>}
            {order.status}
          </span>
          {/* Queue timer — live while Queued */}
          {order.queueStartTime && order.status === 'Queued' && (
            <Timer startTime={order.queueStartTime} running={true} label="Queue" />
          )}
          {/* Prep timer — live while Preparing */}
          {order.startTime && order.status === 'Preparing' && (
            <Timer startTime={order.startTime} running={true} label="Prep" />
          )}
          {/* Total time — frozen once preparation ends */}
          {order.queueStartTime && order.endTime && !['Queued', 'Preparing', 'Draft', 'Scheduled', 'Cancelled'].includes(order.status) && (
            <Timer startTime={order.queueStartTime} endTime={order.endTime} running={false} label="Total" />
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

      <div className={`mb-6 flex-1 ${order.isUrgent && !isClone ? 'grid grid-cols-2 gap-x-12 gap-y-4' : 'space-y-4'}`}>
        {order.items.map((item, idx) => (
          <div key={idx} className="flex flex-col text-base">
            <div className="flex justify-between gap-2">
              <span className="text-on-surface font-semibold">{item.name}</span>
              <span className="text-on-surface font-bold text-base flex-shrink-0">×{item.quantity}</span>
            </div>
            {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.values(item.selectedVariations).map((opt: any) => (
                  <span key={opt.id} className="text-xs text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded font-medium">
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
                  onClearRecentlyUpdated?.(order.id);
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
                    onClearRecentlyUpdated?.(order.id);
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
                    onClearRecentlyUpdated?.(order.id);
                    handleOrderServed(order);
                  }}
                  className="flex-1 py-2 bg-[#8bc34a] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-[#7cb342] transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Order Served
                </button>
              </>
            )}
            {/* Delivery: after Served → Out for Delivery */}
            {order.status === 'Served' && order.orderType === 'delivery' && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  onClearRecentlyUpdated?.(order.id);
                  // Load agents and show picker
                  try {
                    const agents = await api.delivery.listAgents();
                    setDeliveryAgents(agents);
                  } catch { setDeliveryAgents([]); }
                  setAgentPickerOrder(order);
                }}
                className="w-full py-2 bg-tertiary text-on-tertiary rounded-lg text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">local_shipping</span>
                Out for Delivery
              </button>
            )}
            {/* Delivery: Out for delivery → Done */}
            {order.status === 'Out for delivery' && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await api.orders.updateOrderStatus(order.id, 'Done');
                    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'Done' as Order['status'] } : o));
                    onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
                  } catch (err: any) { console.error(err.message); }
                }}
                className="flex-1 py-2 bg-[#8bc34a] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-[#7cb342] transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Mark as Done
              </button>
            )}
            {/* Dine-in: after Served → Done */}
            {order.status === 'Served' && order.orderType === 'dine_in' && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await api.orders.updateOrderStatus(order.id, 'Done');
                    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'Done' as Order['status'] } : o));
                    onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
                  } catch (err: any) { console.error(err.message); }
                }}
                className="flex-1 py-2 bg-[#8bc34a] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-[#7cb342] transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Mark as Done
              </button>
            )}
            {/* Delivery: after Packaging → Out for delivery */}
            {order.status === 'Packaging' && order.orderType === 'delivery' && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  onClearRecentlyUpdated?.(order.id);
                  try {
                    const agents = await api.delivery.listAgents();
                    setDeliveryAgents(agents);
                  } catch { setDeliveryAgents([]); }
                  setAgentPickerOrder(order);
                }}
                className="w-full py-2 bg-tertiary text-on-tertiary rounded-lg text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">local_shipping</span>
                Out for Delivery
              </button>
            )}
            {/* Takeaway: after Packaging → Done */}
            {order.status === 'Packaging' && order.orderType === 'takeaway' && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await api.orders.updateOrderStatus(order.id, 'Done');
                    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'Done' as Order['status'] } : o));
                    onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
                  } catch (err: any) { console.error(err.message); }
                }}
                className="flex-1 py-2 bg-[#8bc34a] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-[#7cb342] transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Mark as Done
              </button>
            )}
            {(order.status === 'Out for delivery' || (order.status === 'Packaging' && order.orderType !== 'delivery')) && !order.review && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onClearRecentlyUpdated?.(order.id);
                  setReviewModalOrder(order);
                }}
                className="flex-1 py-2 bg-tertiary text-on-tertiary rounded-lg text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">star</span>
                Add Review
              </button>
            )}
            {order.review && (
              <div className="flex-1 flex flex-col gap-0.5">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <span 
                      key={i} 
                      className={`material-symbols-outlined text-sm ${i < order.review!.stars ? 'text-tertiary fill-1' : 'text-outline-variant/40 fill-0'}`}
                    >
                      star
                    </span>
                  ))}
                  <span className="text-[9px] font-bold ml-1 text-on-surface-variant/60">Reviewed</span>
                </div>
                {order.review.comment && (
                  <p className="text-[10px] text-on-surface-variant italic line-clamp-1 px-1 mt-0.5">
                    "{order.review.comment}"
                  </p>
                )}
              </div>
            )}
            {/* Online order — Verification button */}
            {order.status === 'Verification' && (
              <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onClearRecentlyUpdated?.(order.id);
                  setCallCustomerOrder(order); 
                }}
                className="w-full py-2.5 bg-amber-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">verified_user</span>
                Verify Order
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <span className="text-xs text-outline">{order.items.reduce((acc, i) => acc + i.quantity, 0)} items</span>
            {order.isUrgent && <span className="text-xs text-tertiary font-bold tracking-wide">URGENT</span>}
          </div>
          <span className="font-headline text-lg font-bold text-secondary">{formatCurrency(order.total)}</span>
        </div>
      </div>
    </div>
  );

  const allDisplayOrders = useMemo(() => {
    if (cart.length === 0) return orders;
    const subtotal = getSubtotal(cart);
    const activeDraft: Order = {
      id: 'Current Cart',
      table: 'N/A',
      status: 'Draft',
      paymentStatus: 'Unpaid',
      items: cart,
      total: subtotal * 1.08,
      time: 'Just now',
      orderType: 'dine_in',
    };
    return [activeDraft, ...orders];
  }, [cart, orders]);

  const displayOrders = useMemo(() => {
    if (statusFilter === 'online') {
      return allDisplayOrders.filter(o => o.channel === 'online');
    }
    const tab = FILTER_TABS.find(t => t.key === statusFilter);
    if (!tab || tab.statuses.length === 0) return allDisplayOrders.filter(o => o.status !== 'Cancelled');
    return allDisplayOrders.filter(o => tab.statuses.includes(o.status));
  }, [allDisplayOrders, statusFilter]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 bg-grid-pattern">
      <div className="w-full">
        <div className="flex items-center justify-between mb-10 border-b border-outline-variant/10 pb-4">
          <div className="flex items-center gap-6">
            {FILTER_TABS.map(tab => {
              const count = tab.key === 'online'
                ? allDisplayOrders.filter(o => o.channel === 'online').length
                : tab.statuses.length === 0
                  ? allDisplayOrders.filter(o => o.status !== 'Cancelled').length
                  : allDisplayOrders.filter(o => tab.statuses.includes(o.status)).length;
              const isActive = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`flex items-center gap-2 pb-4 px-1 font-headline text-sm font-bold tracking-wide transition-all border-b-2 ${
                    isActive
                      ? 'text-secondary border-secondary'
                      : 'text-on-surface-variant border-transparent hover:text-on-surface'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                      tab.key === 'online'
                        ? isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/15 text-amber-400 animate-pulse'
                        : isActive ? 'bg-secondary/20 text-secondary' : 'bg-surface-variant text-outline'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 p-1 bg-surface-container-highest/30 rounded-lg mr-2 border border-outline-variant/10">
              {[
                { label: 'Today', type: 'today', d: today },
                { label: 'Yesterday', type: 'yesterday', d: yesterday },
                { label: 'Past Week', type: 'week', s: lastWeek, e: today },
              ].map(s => (
                <button
                  key={s.label}
                  onClick={() => setDateFilter(s.type === 'week' ? { type: 'week', start: s.s, end: s.e } : { type: s.type as any, date: s.d })}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                    dateFilter.type === s.type
                      ? 'bg-secondary text-on-secondary shadow-lg shadow-secondary/20'
                      : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-surface-container rounded-lg px-3 py-2 border border-outline-variant/20">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">calendar_today</span>
              <input
                type="date"
                value={dateFilter.date || ''}
                max={today}
                onChange={e => setDateFilter({ type: 'custom', date: e.target.value })}
                className="bg-transparent text-xs font-bold text-on-surface focus:outline-none"
              />
              {dateFilter.type !== 'today' && (
                <button
                  onClick={() => setDateFilter({ type: 'today', date: today })}
                  className="text-primary text-[10px] font-bold hover:underline ml-1 uppercase"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayOrders.map(order => (
            <div key={order.id} onClick={(e) => handleOrderClick(order, e)} className={`group relative rounded-xl p-6 transition-all duration-300 hover:bg-surface-container-high cursor-pointer overflow-hidden border ${order.isUrgent ? 'bg-surface-container border-primary/30 lg:col-span-2' : 'bg-surface-container border-outline-variant/25'} ${order.status === 'Draft' ? 'opacity-70 grayscale-[0.5]' : ''} ${recentlyUpdatedIds?.has(order.id) ? 'order-updated-glow' : ''}`}>
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
              const PAD = 20;
              const menuHeight = 420;
              const scale = 1.03;
              const scaledHeight = orderRect.height * scale;
              const scaledWidth = orderRect.width * scale;
              const isDesktop = window.innerWidth >= 768;
              const vw = window.innerWidth;
              const vh = window.innerHeight;

              // ── Clamp card position so it never goes off-canvas ──────────
              let safeTop = orderRect.top;
              let safeLeft = orderRect.left;

              // Clamp horizontally (scale pushes edges outward by half the delta)
              const hOverflow = (scaledWidth - orderRect.width) / 2;
              if (safeLeft - hOverflow < PAD) safeLeft = PAD + hOverflow;
              if (safeLeft + scaledWidth > vw - PAD) safeLeft = vw - PAD - scaledWidth + hOverflow;

              // Clamp vertically (card must stay above bottom edge)
              if (safeTop + scaledHeight > vh - PAD) {
                safeTop = Math.max(PAD, vh - PAD - scaledHeight);
              }
              if (safeTop < PAD) safeTop = PAD;

              // ── Position actions menu ─────────────────────────────────────
              let menuTop = 0;
              let menuLeft = 0;
              const menuWidth = Math.max(orderRect.width, 320);
              let transformOrigin = 'top';

              if (isDesktop) {
                // Always center the menu vertically in the viewport
                menuTop = Math.max(PAD, Math.round((vh - menuHeight) / 2));

                // Place to the right of card; fall back to left if it overflows
                menuLeft = safeLeft + scaledWidth + 16;
                transformOrigin = 'left center';
                if (menuLeft + menuWidth > vw - PAD) {
                  menuLeft = safeLeft - menuWidth - 16;
                  transformOrigin = 'right center';
                  if (menuLeft < PAD) menuLeft = PAD;
                }
              } else {
                // Mobile: always center the menu vertically in the viewport
                menuTop = Math.max(PAD, Math.round((vh - menuHeight) / 2));

                menuLeft = safeLeft;
                transformOrigin = 'center';
                if (menuLeft + menuWidth > vw - PAD) {
                  menuLeft = Math.max(PAD, vw - PAD - menuWidth);
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
                      left: safeLeft,
                      scale: scale,
                    }}
                    exit={{
                      top: orderRect.top,
                      left: orderRect.left,
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
                      maxHeight: vh - PAD * 2,
                      transformOrigin: transformOrigin,
                    }}
                    className="z-[90] bg-surface-container-lowest rounded-xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col"
                  >
                    {/* Header with Print Button */}
                    <div className="flex justify-between items-center p-4 border-b border-outline-variant/10 bg-surface-container-low flex-shrink-0">
                      <h3 className="font-headline font-bold text-sm text-on-surface">Manage Order</h3>
                      <button onClick={handlePrint} className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[18px]">print</span>
                        Print
                      </button>
                    </div>

                    <div className="p-5 overflow-y-auto flex-1 space-y-6">
                      {/* Order Status */}
                      <div>
                        <h4 className="font-headline font-bold text-xs text-on-surface mb-3 uppercase tracking-wider">Order Status</h4>
                        {getValidTransitions(selectedOrder).length === 0 ? (
                          <p className="text-xs text-outline italic">No further transitions available.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {[selectedOrder.status, ...getValidTransitions(selectedOrder)].map(status => (
                              <button
                                key={status}
                                onClick={() => handleStatusSelect(status as Order['status'])}
                                disabled={status === selectedOrder.status || isSaving}
                                className={`p-2.5 rounded-lg border text-left transition-all text-xs font-bold ${
                                  pendingScheduled && status === 'Scheduled'
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : status === selectedOrder.status
                                    ? 'border-outline-variant/10 bg-surface-container/50 text-outline cursor-default'
                                    : 'border-outline-variant/20 bg-surface-container hover:bg-surface-container-high text-on-surface'
                                }`}
                              >
                                {status === selectedOrder.status ? `${status} (current)` : status}
                              </button>
                            ))}
                          </div>
                        )}
                        {pendingScheduled && (
                          <div className="mt-3 space-y-2">
                            <label className="text-[10px] font-bold text-outline uppercase tracking-wider block">Scheduled Date & Time</label>
                            <input
                              type="datetime-local"
                              value={scheduledTime}
                              onChange={e => setScheduledTime(e.target.value)}
                              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                            />
                            <button
                              onClick={handleScheduleConfirm}
                              disabled={!scheduledTime || isSaving}
                              className="w-full py-2 bg-primary text-on-primary rounded-lg text-xs font-bold disabled:opacity-40 transition-opacity"
                            >
                              {isSaving ? 'Saving…' : 'Confirm Schedule'}
                            </button>
                          </div>
                        )}
                        {getValidTransitions(selectedOrder).includes('Preparing') && !selectedOrder.cook && (
                          <p className="mt-2 text-[10px] text-error font-bold">A cook must be assigned first. Use the "Prepare Order" button on the card.</p>
                        )}
                      </div>

                      {/* Payment Status */}
                      <div>
                        <h4 className="font-headline font-bold text-xs text-on-surface mb-3 uppercase tracking-wider">Payment Status</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {paymentOptions.map(status => (
                            <button
                              key={status}
                              onClick={() => handlePaymentSelect(status as Order['paymentStatus'])}
                              disabled={status === selectedOrder.paymentStatus || isSaving}
                              className={`p-2.5 rounded-lg border text-center transition-all text-xs font-bold ${
                                selectedOrder.paymentStatus === status
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
                    <div className="p-4 border-t border-outline-variant/10 bg-surface-container-low flex gap-2 flex-shrink-0">
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
                {users.filter(u => u.role === 'Cook' || u.permissions.includes('view_orders')).map(user => (
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
                {users.filter(u => u.id !== selectedOrder.cook?.id).map(user => (
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
              <div className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-error/10 text-error rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-2xl">warning</span>
                  </div>
                  <div>
                    <h3 className="font-headline text-xl font-bold text-on-surface">Cancel Order?</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Order {selectedOrder?.orderNumber ?? `#${selectedOrder?.id.slice(-4)}`} · This cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (optional)..."
                    rows={3}
                    className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 pt-3 pb-8 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-error focus:ring-1 focus:ring-error transition-all resize-none"
                  />
                  <span className="material-symbols-outlined text-[18px] text-outline-variant absolute bottom-2.5 right-3 pointer-events-none">keyboard</span>
                </div>
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

      {/* Delivery Agent Picker Modal */}
      <AnimatePresence>
        {agentPickerOrder && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => { setAgentPickerOrder(null); setShowNewAgentForm(false); setAgentSearch(''); setNewAgentForm({ name: '', phone: '' }); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[70vh]"
            >
              <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
                <div>
                  <h3 className="font-headline text-lg font-bold text-on-surface">Select Delivery Agent</h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">Order #{agentPickerOrder.orderNumber}</p>
                </div>
                <button onClick={() => { setAgentPickerOrder(null); setShowNewAgentForm(false); setAgentSearch(''); setNewAgentForm({ name: '', phone: '' }); }} className="text-on-surface-variant hover:text-on-surface transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Search */}
              <div className="px-4 pt-3">
                <div className="flex items-center gap-2 bg-surface-container rounded-lg px-3 py-2 border border-outline-variant/20">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
                  <input type="text" placeholder="Search agents…" value={agentSearch} onChange={e => setAgentSearch(e.target.value)} className="flex-1 bg-transparent border-none focus:outline-none text-sm text-on-surface" />
                </div>
              </div>

              {/* Agent list */}
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {deliveryAgents.filter(a => a.is_active && (a.name.toLowerCase().includes(agentSearch.toLowerCase()) || a.phone.includes(agentSearch))).map(agent => (
                  <button
                    key={agent.id}
                    onClick={async () => {
                      try {
                        await api.orders.updateOrderStatus(agentPickerOrder.id, 'Out for delivery');
                        await api.delivery.assignAgentToOrder(agentPickerOrder.id, agent.id);
                        setOrders(prev => prev.map(o => o.id === agentPickerOrder.id ? { ...o, status: 'Out for delivery' as Order['status'], deliveryAgent: { agent_id: agent.id, name: agent.name, phone: agent.phone } } : o));
                        onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
                        setAgentPickerOrder(null);
                        setAgentSearch('');
                      } catch (err: any) { console.error(err.message); }
                    }}
                    className="w-full bg-surface-container rounded-xl border border-outline-variant/10 p-3.5 flex items-center gap-3 hover:border-primary/30 hover:bg-surface-container-high transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-tertiary/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-tertiary">person_pin</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface">{agent.name}</p>
                      <p className="text-xs text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">phone</span>{agent.phone}
                      </p>
                    </div>
                    {agent.vehicle_type && (
                      <span className="text-[10px] font-bold text-tertiary bg-tertiary/10 px-2 py-1 rounded-lg">{agent.vehicle_type}</span>
                    )}
                  </button>
                ))}
                {deliveryAgents.filter(a => a.is_active).length === 0 && !showNewAgentForm && (
                  <div className="text-center py-6 text-on-surface-variant text-sm opacity-50">
                    <span className="material-symbols-outlined text-3xl mb-2 block">person_off</span>
                    No delivery agents configured. Add one below.
                  </div>
                )}
              </div>

              {/* Add new agent inline */}
              <div className="p-4 border-t border-outline-variant/10 bg-surface-container-low">
                {showNewAgentForm ? (
                  <div className="space-y-2">
                    <input type="text" placeholder="Agent name *" value={newAgentForm.name} onChange={e => setNewAgentForm({ ...newAgentForm, name: e.target.value })} className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary outline-none" />
                    <input type="tel" placeholder="Phone *" value={newAgentForm.phone} onChange={e => setNewAgentForm({ ...newAgentForm, phone: e.target.value })} className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface focus:border-primary outline-none" />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!newAgentForm.name.trim() || !newAgentForm.phone.trim()) return;
                          try {
                            const newAgent = await api.delivery.createAgent({ name: newAgentForm.name, phone: newAgentForm.phone, vehicle_type: '', is_active: true });
                            setDeliveryAgents(prev => [...prev, newAgent]);
                            setNewAgentForm({ name: '', phone: '' });
                            setShowNewAgentForm(false);
                            // Auto-select the new agent
                            await api.orders.updateOrderStatus(agentPickerOrder.id, 'Out for delivery');
                            await api.delivery.assignAgentToOrder(agentPickerOrder.id, newAgent.id);
                            setOrders(prev => prev.map(o => o.id === agentPickerOrder.id ? { ...o, status: 'Out for delivery' as Order['status'], deliveryAgent: { agent_id: newAgent.id, name: newAgent.name, phone: newAgent.phone } } : o));
                            onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
                            setAgentPickerOrder(null);
                          } catch (err: any) { console.error(err.message); }
                        }}
                        disabled={!newAgentForm.name.trim() || !newAgentForm.phone.trim()}
                        className="flex-1 py-2 bg-primary text-on-primary rounded-lg text-xs font-bold disabled:opacity-40 transition-all"
                      >Add & Assign</button>
                      <button onClick={() => { setShowNewAgentForm(false); setNewAgentForm({ name: '', phone: '' }); }} className="px-3 py-2 bg-surface-container text-on-surface-variant rounded-lg text-xs font-bold">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setShowNewAgentForm(true)} className="flex-1 py-2.5 bg-surface-container border border-outline-variant/20 text-on-surface-variant rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">person_add</span>
                      Add New Agent
                    </button>
                    <button
                      onClick={async () => {
                        // Skip agent assignment - just set status
                        try {
                          await api.orders.updateOrderStatus(agentPickerOrder.id, 'Out for delivery');
                          setOrders(prev => prev.map(o => o.id === agentPickerOrder.id ? { ...o, status: 'Out for delivery' as Order['status'] } : o));
                          onRefresh?.(dateFilter.date, dateFilter.start, dateFilter.end);
                          setAgentPickerOrder(null);
                        } catch (err: any) { console.error(err.message); }
                      }}
                      className="py-2.5 px-4 bg-tertiary/10 text-tertiary rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-tertiary/20 transition-colors"
                    >Skip</button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Online Order Cancel Modal */}
      <AnimatePresence>
        {callCustomerOrder && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setCallCustomerOrder(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-2xl">call</span>
                  </div>
                  <div>
                    <h3 className="font-headline text-xl font-bold text-on-surface">Verify Order</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">{callCustomerOrder.orderNumber} · Online Verification</p>
                    {callCustomerOrder.createdAt && (
                      <p className="text-xs text-on-surface-variant/60 mt-0.5 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                        {new Date(callCustomerOrder.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Customer details */}
                <div className="bg-surface-container rounded-xl p-4 mb-4 space-y-2">
                  <p className="text-sm font-semibold text-on-surface">{callCustomerOrder.customer?.name ?? '—'}</p>
                  <a
                    href={`tel:${callCustomerOrder.customer?.phone}`}
                    className="flex items-center gap-2 text-primary font-bold text-lg tracking-wide hover:opacity-80 transition-opacity"
                    onClick={e => e.stopPropagation()}
                  >
                    <span className="material-symbols-outlined text-xl">call</span>
                    {callCustomerOrder.customer?.phone ?? '—'}
                  </a>
                  {callCustomerOrder.customer?.address && (
                    <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">location_on</span>
                      {callCustomerOrder.customer.address}
                    </p>
                  )}
                </div>

                {/* Order summary */}
                <div className="space-y-1 mb-2">
                  {callCustomerOrder.items.map((item, i) => {
                    const itemPrice = getCartItemPrice(item);
                    const varNames = Object.values(item.selectedVariations || {}).map(v => v.name).join(' · ');
                    const suppNames = Object.values(item.selectedSupplements || {}).map(s => `+${s.name}`).join(' · ');
                    const mods = [varNames, suppNames].filter(Boolean).join(' | ');
                    return (
                      <div key={i} className="flex flex-col gap-0.5">
                        <div className="flex justify-between text-xs text-on-surface-variant">
                          <span>{item.quantity}× {item.name}</span>
                          <span>{formatCurrency(itemPrice * item.quantity)}</span>
                        </div>
                        {mods && <p className="text-[10px] text-on-surface-variant/70 italic ml-4">{mods}</p>}
                      </div>
                    );
                  })}
                  <div className="flex justify-between text-sm font-bold text-on-surface border-t border-outline-variant/20 pt-2 mt-2">
                    <span>Total</span>
                    <span>{formatCurrency(callCustomerOrder.total)}</span>
                  </div>
                </div>
              </div>

                {/* Verification Actions */}
                <div className="flex flex-col gap-2 p-4 pt-0">
                  <button
                    onClick={() => handleCallCustomerAction('queue')}
                    disabled={callCustomerLoading !== null}
                    className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {callCustomerLoading === 'queue' ? (
                      <span className="material-symbols-outlined animate-spin">sync</span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">queue_play_next</span>
                        Add to Queue
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleCallCustomerAction('cancel')}
                    disabled={callCustomerLoading !== null}
                    className="w-full py-3 bg-error/10 text-error rounded-xl font-bold uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-error/20 transition-colors disabled:opacity-50"
                  >
                    {callCustomerLoading === 'cancel' ? (
                      <span className="material-symbols-outlined animate-spin">sync</span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">cancel</span>
                        Cancel Order
                      </>
                    )}
                  </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Modal */}
      <AnimatePresence>
        {receiptModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              onClick={() => setReceiptModal(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#1a1d21] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-4 bg-[#22252a] border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-[18px]">receipt</span>
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">Order Receipt</h3>
                    <p className="text-gray-400 text-[10px] uppercase tracking-wider">{receiptModal.orderNumber}</p>
                  </div>
                </div>
                <button
                  onClick={() => setReceiptModal(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Receipt paper */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center bg-[#1a1d21]">
                {(() => {
                  const trackingUrl = receiptModal.trackingToken
                    ? `${window.location.origin}/track/${receiptModal.trackingToken}`
                    : `${window.location.origin}/track/${receiptModal.orderNumber}`;
                  const createdAt = receiptModal.createdAt ? new Date(receiptModal.createdAt) : new Date();
                  const dateStr = createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const timeStr = createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                  const hasCustomer = receiptModal.customer && (receiptModal.customer.name || receiptModal.customer.phone || receiptModal.customer.address);
                  const Sep = () => <div className="border-t border-dashed border-black/50 my-1.5" />;
                  const Sep2 = () => <div className="border-t-2 border-black my-1.5" />;
                  return (
                    <div id="zen-order-receipt-print" className="w-full max-w-[300px] bg-white text-black font-mono text-[12px] font-bold leading-snug shadow-2xl">
                      {/* Header */}
                      <div className="text-center pt-5 px-4 pb-3">
                        {b.logo && (
                          <img src={b.logo} alt="logo" className="w-12 h-12 object-contain mx-auto mb-2" style={{ filter: 'grayscale(1) contrast(2)' }} />
                        )}
                        <div className="font-bold text-[15px] uppercase tracking-wide">{b.restaurantName || 'ZEN POS'}</div>
                        {(b.address || '').split('\n').filter(Boolean).map((line: string, i: number) => (
                          <div key={i} className="text-[11px]">{line}</div>
                        ))}
                        {b.phone && <div className="text-[11px]">{b.phone}</div>}
                      </div>

                      <div className="px-4"><Sep /></div>

                      {/* Order info */}
                      <div className="px-4 py-1">
                        <div>Order: #{receiptModal.orderNumber}</div>
                        <div>Date:  {dateStr}  {timeStr}</div>
                        <div className="capitalize">Type:  {(receiptModal.orderType || 'dine_in').replace('_', ' ')}{receiptModal.table ? `  ·  Table ${receiptModal.table}` : ''}</div>
                      </div>

                      {/* Customer */}
                      {hasCustomer && (
                        <>
                          <div className="px-4"><Sep /></div>
                          <div className="px-4 py-1">
                            <div className="font-bold">CUSTOMER DETAILS:</div>
                            {receiptModal.customer!.name && <div>{receiptModal.customer!.name}</div>}
                            {receiptModal.customer!.phone && <div>{receiptModal.customer!.phone}</div>}
                            {receiptModal.customer!.address && <div>{receiptModal.customer!.address}</div>}
                          </div>
                        </>
                      )}

                      <div className="px-4"><Sep /></div>

                      {/* Items */}
                      <div className="px-4 py-1 space-y-2">
                        {receiptModal.items.map((item, i) => {
                          const itemPrice = getCartItemPrice(item);
                          const lineTotal = (itemPrice - (item.discount || 0)) * item.quantity;
                          const varNames = Object.values(item.selectedVariations || {}).map((o: any) => o.name).join(', ');
                          const suppNames = Object.values(item.selectedSupplements || {}).map((o: any) => o.name).join(', ');
                          const modifiers = [varNames, suppNames].filter(Boolean).join(' | ');
                          const noteStr = [modifiers, item.notes].filter(Boolean).join(' | ');
                          return (
                            <div key={i}>
                              <div className="flex justify-between">
                                <span>{item.quantity}x {item.name}</span>
                                <span className="ml-2 whitespace-nowrap">{formatCurrency(lineTotal)}</span>
                              </div>
                              {noteStr && <div className="pl-4 text-[11px] font-bold text-black">{noteStr}</div>}
                            </div>
                          );
                        })}
                      </div>

                      {receiptModal.notes && (
                        <>
                          <div className="px-4"><Sep /></div>
                          <div className="px-4 text-[12px] font-bold text-black">Note: {receiptModal.notes}</div>
                        </>
                      )}

                      <div className="px-4"><Sep /></div>

                      {/* Subtotals */}
                      <div className="px-4 py-1 space-y-0.5 text-[11px] text-gray-600">
                        <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(receiptModal.subtotal)}</span></div>
                        {receiptModal.tax > 0 && <div className="flex justify-between"><span>Tax{localization.taxEnabled ? ` (${localization.taxRate}%)` : ''}:</span><span>{formatCurrency(receiptModal.tax)}</span></div>}
                      </div>

                      <div className="px-4"><Sep2 /></div>
                      <div className="px-4 flex justify-between font-bold text-[14px]">
                        <span>TOTAL:</span><span>{formatCurrency(receiptModal.total)}</span>
                      </div>
                      <div className="px-4"><Sep2 /></div>

                      <div className="px-4"><Sep /></div>

                      {/* QR / Loyalty — only when printQrCode is enabled */}
                      {b.printQrCode && (
                        <>
                          <div className="text-center px-4 py-3">
                            <div className="font-bold text-[12px] tracking-wider mb-1">*** FIDELITY PROGRAM ***</div>
                            <div className="text-[11px] mb-3 leading-snug">Scan QR to collect points<br />Redeem discounts &amp; free delivery</div>
                            <div className="flex justify-center my-2"><QRCode value={trackingUrl} size={110} /></div>
                            <div className="font-bold text-[11px] tracking-[3px] mt-2">SCAN ME</div>
                          </div>
                          <div className="px-4"><Sep /></div>
                        </>
                      )}

                      <div className="text-center text-[11px] py-2 px-4">{b.footerText || 'Thank you for dining with us!'}</div>
                      <div className="h-4" />
                    </div>
                  );
                })()}
              </div>

              {/* Print button */}
              <div className="p-4 bg-[#22252a] border-t border-white/10">
                <button
                  onClick={printReady ? handlePrintReceipt : undefined}
                  disabled={!printReady}
                  className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    printReady
                      ? 'bg-white text-black hover:bg-gray-100 shadow-lg cursor-pointer'
                      : 'bg-white/10 text-white/40 cursor-not-allowed'
                  }`}
                >
                  {printReady ? (
                    <><span className="material-symbols-outlined">print</span>Print Receipt</>
                  ) : (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Preparing receipt…
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
