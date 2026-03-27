import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  motion, AnimatePresence,
  useMotionValue, useTransform, animate as motionAnimate,
} from 'motion/react';
import { usePublicCart, itemKey } from '../../context/PublicCartContext';
import { LocalizationProvider, useLocalization } from '../../context/LocalizationContext';
import { ProductCard } from '../../components/product/ProductCard';
import { CategoryFilter } from '../../components/product/CategoryFilter';
import { VariationModal } from '../../components/product/VariationModal';
import * as publicApi from '../../api/public';
import { saveMockCustomer } from '../../api/customers';
import type { Product, VariationOption, PublicCartItem, PublicTrackingInfo, PublicOrder } from '../../data';

function getBranding() {
  try { const b = localStorage.getItem('zenpos_branding'); if (b) return JSON.parse(b); } catch {}
  return {};
}

const CUSTOMER_SESSION_KEY = 'zenpos_public_customer';
const MOCK_ORDERS_KEY = 'zenpos_mock_online_orders';
interface SavedCustomer { phone: string; name: string; address: string; customerId?: string; savedAt: number; }
function loadCustomerSession(): SavedCustomer | null {
  try { const s = localStorage.getItem(CUSTOMER_SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveCustomerSession(data: SavedCustomer): void {
  localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(data));
}

// ─── Swipeable public cart item (with 3D-touch editor) ─────────────────────────
function SwipeablePublicItem({
  item,
  itemKey: key,
  onRemove,
  onUpdateQty,
  onUpdateNote,
}: {
  item: PublicCartItem;
  itemKey: string;
  onRemove: () => void;
  onUpdateQty: (delta: number) => void;
  onUpdateNote: (note: string) => void;
}) {
  const { formatCurrency } = useLocalization();
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [0, -72], [0, 1]);
  const deleteBg = useTransform(x, [0, -72], ['#00000000', '#ef444480']);

  const [editRect, setEditRect] = useState<DOMRect | null>(null);
  const [noteVal, setNoteVal] = useState(item.note ?? '');

  const varAdj = Object.values(item.selectedVariations ?? {}).reduce((s, v) => s + (v.priceAdjustment ?? 0), 0);
  const linePrice = (item.price + varAdj) * item.quantity;
  const isExpanded = editRect !== null;

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x < -72) onRemove();
    else motionAnimate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isExpanded) { setEditRect(null); return; }
    setNoteVal(item.note ?? '');
    setEditRect(e.currentTarget.getBoundingClientRect());
  };

  const closeEditor = () => setEditRect(null);

  const saveAndClose = () => {
    onUpdateNote(noteVal.trim());
    closeEditor();
  };

  const rowContent = (
    <div className="flex items-center gap-3">
      {item.image && (
        <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-outline-variant/10" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-on-surface leading-snug truncate">{item.name}</p>
          <span
            className="material-symbols-outlined text-on-surface-variant text-[15px] transition-transform duration-200 flex-shrink-0"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >expand_more</span>
        </div>
        {Object.values(item.selectedVariations ?? {}).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {Object.values(item.selectedVariations!).map(v => (
              <span key={v.id} className="text-[9px] bg-surface-container-highest text-on-surface-variant px-1.5 py-0.5 rounded font-medium">{v.name}</span>
            ))}
          </div>
        )}
        {item.note && !isExpanded && (
          <span className="inline-block mt-1 text-[9px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-1.5 py-0.5 rounded font-medium truncate max-w-full">{item.note}</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-bold text-on-surface-variant border border-outline-variant/20 px-2 py-0.5 rounded-md">{item.quantity}×</span>
        <span className="text-sm font-bold text-primary">{formatCurrency(linePrice)}</span>
      </div>
    </div>
  );

  return (
    <div className="relative overflow-hidden">
      {/* Delete hint */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end pr-5 rounded-xl"
        style={{ background: deleteBg, opacity: deleteOpacity }}
      >
        <span className="material-symbols-outlined text-white text-xl">delete</span>
      </motion.div>

      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.08}
        onDragEnd={handleDragEnd}
        className={`relative bg-surface-container-low rounded-xl p-3 cursor-pointer select-none transition-opacity ${isExpanded ? 'opacity-0' : 'opacity-100'}`}
        onClick={handleClick}
      >
        {rowContent}
      </motion.div>

      {/* 3D-touch editor portal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isExpanded && editRect && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[85] bg-black/30 backdrop-blur-sm"
                onClick={closeEditor}
              />
              {/* Floating editor card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 0, top: editRect.top - 8 }}
                animate={{
                  opacity: 1, scale: 1.02, y: -4,
                  top: Math.max(16, Math.min(editRect.top - 8, window.innerHeight - 420)),
                }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                className="fixed z-[90] bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden"
                style={{
                  left: Math.max(12, Math.min(editRect.left - 8, window.innerWidth - (editRect.width + 16))),
                  width: editRect.width + 16,
                  transformOrigin: 'top center',
                }}
                onPointerDown={e => e.stopPropagation()}
              >
                {/* Header — mirrors the row, tap to close */}
                <div
                  className="px-4 py-3 bg-surface-container border-b border-outline-variant/10 cursor-pointer"
                  onClick={closeEditor}
                >
                  {rowContent}
                </div>

                {/* Edit body */}
                <div className="p-4 space-y-4">
                  <p className="text-[10px] font-bold text-outline uppercase tracking-widest">Edit Item</p>

                  {/* Qty stepper */}
                  <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Quantity</p>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => onUpdateQty(-1)}
                        className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-colors text-on-surface-variant hover:text-error active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[18px]">{item.quantity <= 1 ? 'delete' : 'remove'}</span>
                      </button>
                      <span className="font-headline font-extrabold text-2xl text-on-surface tabular-nums">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQty(1)}
                        className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors text-primary active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      </button>
                    </div>
                  </div>

                  {/* Note */}
                  <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-3 focus-within:border-primary/50 transition-colors">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Note for kitchen</p>
                    <textarea
                      value={noteVal}
                      onChange={e => setNoteVal(e.target.value)}
                      placeholder="e.g. No onions, extra spicy…"
                      rows={2}
                      className="w-full bg-transparent text-sm text-on-surface placeholder:text-outline-variant focus:outline-none resize-none"
                      onPointerDown={e => e.stopPropagation()}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={closeEditor}
                      className="flex-1 py-3 rounded-xl bg-surface-container text-on-surface-variant text-sm font-bold hover:bg-surface-container-high transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveAndClose}
                      className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity shadow-md shadow-primary/20 flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Done
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

// ─── Panel view type ───────────────────────────────────────────────────────────
type PanelView = 'cart' | 'checkout' | 'placed' | 'tracking' | 'history_phone' | 'history_otp' | 'history_list';

// ─── Cart panel ────────────────────────────────────────────────────────────────
function PublicCartPanel({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { 
    items, updateQty, updateNote, removeItem, subtotal, itemCount, clearCart,
    ui, setUi, resetUi
  } = usePublicCart();
  const { view, checkoutStep, name, phone, address, note } = ui;

  const { formatCurrency } = useLocalization();
  const branding = getBranding();
  const restaurantName: string = branding.restaurantName || 'Our Restaurant';

  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useParams();

  // Sync internal view with URL
  useEffect(() => {
    if (location.pathname === '/checkout') {
      setUi({ view: 'checkout' });
      setOpen(true);
    } else if (location.pathname.startsWith('/track/')) {
      setUi({ view: 'tracking' });
      setOpen(true);
    } else if (location.pathname === '/history') {
      setUi({ view: 'history_phone' });
      setOpen(true);
    } else if (location.pathname === '/') {
      setUi({ view: 'cart' });
    }
  }, [location.pathname, setOpen, setUi]);

  const setView = (v: PanelView) => setUi({ view: v });
  const setCheckoutStep = (s: any) => setUi({ checkoutStep: s });
  const setName = (v: string) => setUi({ name: v });
  const setPhone = (v: string) => setUi({ phone: v });
  const setAddress = (v: string) => setUi({ address: v });
  const setNote = (v: string) => setUi({ note: v });

  const [foundCustomer, setFoundCustomer] = useState<{ id: string; name: string; address?: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [placed, setPlacedState] = useState<publicApi.CreateOrderResponse | null>(ui.placedOrder ? { orderId: ui.placedOrder.orderId, orderNumber: ui.placedOrder.orderNumber, trackingToken: ui.placedOrder.trackingToken } : null);
  const [cartSnapshot, setCartSnapshotState] = useState<PublicCartItem[]>(ui.placedOrder?.items || []);
  const [firebaseActive, setFirebaseActive] = useState(true);

  const setPlaced = (p: publicApi.CreateOrderResponse | null, items?: PublicCartItem[]) => {
    setPlacedState(p);
    if (p && items) setUi({ placedOrder: { ...p, items, subtotal: items.reduce((s, i) => s + (i.price + Object.values(i.selectedVariations ?? {}).reduce((a, v) => a + (v.priceAdjustment ?? 0), 0)) * i.quantity, 0) } });
    else if (!p) setUi({ placedOrder: undefined });
  };
  const setCartSnapshot = (s: PublicCartItem[]) => {
    setCartSnapshotState(s);
    if (ui.placedOrder) setUi({ placedOrder: { ...ui.placedOrder, items: s } });
  };

  // Integration check
  useEffect(() => {
    import('../../api/settings').then(m => m.getIntegration()).then(i => {
      setFirebaseActive(i.firebaseEnabled);
    }).catch(() => setFirebaseActive(false));
  }, []);

  // Tracking
  const [tracking, setTracking] = useState<PublicTrackingInfo | null>(null);

  // Tracking review
  const [trackingReviewOpen, setTrackingReviewOpen] = useState(false);
  const [trackingReviewStars, setTrackingReviewStars] = useState(5);
  const [trackingReviewComment, setTrackingReviewComment] = useState('');
  const [trackingReviewDone, setTrackingReviewDone] = useState(false);

  // History
  const [histPhone, setHistPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [histOrders, setHistOrders] = useState<PublicOrder[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<PublicOrder | null>(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const logout = () => {
    localStorage.removeItem('customer_session');
    setUi({ view: 'history_phone', name: '', phone: '', address: '' });
    setHistOrders([]);
  };
  const [confirming, setConfirming] = useState(false);

  // Cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Auto-fetch history if session exists
  useEffect(() => {
    if (view !== 'history_phone' && view !== 'history_otp') return;
    const sessionToken = localStorage.getItem('customer_session');
    if (sessionToken) {
      setHistLoading(true);
      publicApi.getCustomerHistory(sessionToken)
        .then(orders => {
          setHistOrders(orders);
          setView('history_list');
        })
        .catch(() => {
          // Token probably expired or invalid, keep on history_phone
          localStorage.removeItem('customer_session');
        })
        .finally(() => setHistLoading(false));
    } else if (!firebaseActive) {
      // Try silent login if we have a mock session from a previous order and no SMS is required
      const mock = loadCustomerSession();
      if (mock && mock.phone) {
        setHistLoading(true);
        publicApi.loginNoOTP(mock.phone)
          .then(res => {
            localStorage.setItem('customer_session', res.sessionToken);
            return publicApi.getCustomerHistory(res.sessionToken);
          })
          .then(orders => {
            setHistOrders(orders);
            setView('history_list');
          })
          .catch(() => {})
          .finally(() => setHistLoading(false));
      }
    }
  }, [view, firebaseActive]);

  // Auto-navigate to tracking 3 s after order is placed
  useEffect(() => {
    if (view !== 'placed') return;
    const t = setTimeout(() => setView('tracking'), 3000);
    return () => clearTimeout(t);
  }, [view]);

  // Tracking poll + mock fallback when no real token
  useEffect(() => {
    if (view !== 'tracking') return;
    const currentToken = placed?.trackingToken || token || ui.placedOrder?.trackingToken;
    if (!currentToken) return;

    // Use URL token if present, otherwise fallout to placed or stored state
    const tToken = currentToken;

    setTracking(prev => prev ?? {
      orderId: placed?.orderId || ui.placedOrder?.orderId || '',
      orderNumber: placed?.orderNumber || ui.placedOrder?.orderNumber || '',
      status: 'Draft',
      channel: 'online',
      items: cartSnapshot.length ? cartSnapshot.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.price })) : (ui.placedOrder?.items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.price })) || []),
      subtotal: ui.placedOrder?.subtotal || subtotal || 0, 
      tax: 0, 
      total: ui.placedOrder?.subtotal || subtotal || 0,
      customer: { name: name.trim() || ui.name, maskedPhone: phone.trim() || ui.phone, address: address.trim() || ui.address },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      trackingToken: tToken,
      estimatedDelivery: new Date(Date.now() + 35 * 60000).toISOString(),
    });

    const poll = () => publicApi.getOrderTracking(tToken).then(setTracking).catch(() => {});
    poll();

    // WebSocket for instant updates
    const apiUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/public/ws/track/${tToken}`;
    
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = () => poll(); // Refresh on any event on this track topic
    } catch {}

    const id = setInterval(poll, 10000); // 10s fallback polling
    return () => {
      clearInterval(id);
      ws?.close();
    };
  }, [view, placed?.trackingToken, token, ui.placedOrder?.trackingToken]);

  // Load saved customer session when entering checkout
  useEffect(() => {
    if (view !== 'checkout') return;
    const session = loadCustomerSession();
    const valid = session && (Date.now() - session.savedAt < 24 * 60 * 60 * 1000);
    if (valid) {
      setPhone(session!.phone);
      setName(session!.name);
      setAddress(session!.address);
      setFoundCustomer(session!.customerId ? { id: session!.customerId, name: session!.name, address: session!.address } : null);
      setCheckoutStep('details');
    } else {
      setCheckoutStep('phone');
    }
  }, [view]);

  const reset = () => {
    resetUi();
    setErrors({}); setServerError(''); setPlaced(null); setTracking(null); setCartSnapshot([]);
    setTrackingReviewOpen(false); setTrackingReviewStars(5); setTrackingReviewComment(''); setTrackingReviewDone(false);
    setFoundCustomer(null); setLookingUp(false); setLookupError('');
  };

  const submitTrackingReview = async () => {
    if (!placed && !ui.placedOrder) return;
    const orderId = placed?.orderId || ui.placedOrder?.orderId || '';
    const token = localStorage.getItem('customer_session') ?? '';
    try { await publicApi.submitCustomerReview(orderId, trackingReviewStars, trackingReviewComment, token); } catch {}
    setTrackingReviewDone(true); setTrackingReviewOpen(false);
  };


  const lookupPhone = async (phoneVal?: string) => {
    const val = (phoneVal ?? phone).trim();
    if (!val) { setErrors({ phone: 'Required' }); return; }
    setLookingUp(true); setLookupError(''); setErrors({});
    const customer = await publicApi.lookupCustomerByPhone(val);
    setLookingUp(false);
    if (customer) { setFoundCustomer(customer); setCheckoutStep('confirm_identity'); }
    else { setCheckoutStep('details'); }
  };

  const confirmIdentity = () => {
    if (!foundCustomer) return;
    setName(foundCustomer.name);
    setAddress(foundCustomer.address ?? '');
    setCheckoutStep('details');
  };

  const notMe = () => {
    setName(''); setAddress(''); setFoundCustomer(null); setCheckoutStep('details');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Required';
    if (!phone.trim()) e.phone = 'Required';
    if (!address.trim()) e.address = 'Required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const placeOrder = async () => {
    if (!validate()) return;
    setSubmitting(true); setServerError('');
    try {
      const snap = [...items];
      const result = await publicApi.createOnlineOrder({
        items: items,
        customer: { name, phone, address, note },
      });
      // Persist customer session for future visits
      saveCustomerSession({ phone: phone.trim(), name: name.trim(), address: address.trim(), customerId: foundCustomer?.id, savedAt: Date.now() });

      // Always register / update the customer in the mock store so the POS customer list stays in sync
      saveMockCustomer({
        id: foundCustomer?.id ?? result.orderId,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        totalSpent: subtotal,
      });

      // Notify the POS (same tab or other tabs) that a new order arrived
      window.dispatchEvent(new CustomEvent('zenpos:new_order', {
        detail: { orderId: result.orderId, orderNumber: result.orderNumber, customerName: name.trim() },
      }));

      setPlaced(result, snap); setCartSnapshot(snap); setView('placed');
      clearCart();
      setUi({ view: 'placed', note: '' });

      // Persist the session if returned, so history is auto-logged
      if (result.sessionToken) {
        localStorage.setItem('customer_session', result.sessionToken);
      }

    } catch (err: any) { setServerError(err.message || 'Failed to place order.'); }
    finally { setSubmitting(false); }
  };

  const requestOtp = async () => {
    if (!histPhone.trim()) return;
    setOtpSending(true); setOtpError('');
    try {
      if (!firebaseActive) {
        // Bypass OTP authentication as requested by USER
        const { sessionToken } = await publicApi.loginNoOTP(histPhone.trim());
        localStorage.setItem('customer_session', sessionToken);
        const orders = await publicApi.getCustomerHistory(sessionToken);
        setHistOrders(orders); setView('history_list');
      } else {
        await publicApi.requestOTP(histPhone.trim()); 
        setView('history_otp'); setCooldown(60);
      }
    } catch (err: any) { setOtpError(err.message || 'Failed to access history.'); }
    finally { setOtpSending(false); }
  };

  const verifyOtp = async () => {
    setHistLoading(true); setOtpError('');
    try {
      const { sessionToken } = await publicApi.verifyOTP(histPhone, otp.trim());
      localStorage.setItem('customer_session', sessionToken);
      const orders = await publicApi.getCustomerHistory(sessionToken);
      setHistOrders(orders); setView('history_list');
      // Prepopulate checkout form with latest info if available
      if (orders.length > 0 && (!ui.name || !ui.phone)) {
        const last = orders[0].customer;
        setUi({ name: last.name, phone: last.phone, address: last.address || '' });
      }
    } catch (err: any) { setOtpError(err.message || 'Invalid code.'); }
    finally { setHistLoading(false); }
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    const token = localStorage.getItem('customer_session') ?? '';
    try {
      await publicApi.submitCustomerReview(reviewTarget.id, reviewStars, reviewComment, token);
      setHistOrders(prev => prev.map(o => o.id === reviewTarget!.id ? { ...o, review: { stars: reviewStars, comment: reviewComment } } : o));
      // Delay reset slightly to avoid UI flicker while state propagates
      setTimeout(() => {
        setReviewTarget(null); setReviewStars(5); setReviewComment('');
      }, 300);
    } catch {}
  };



  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <motion.aside
        initial={false}
        animate={{ x: open ? 0 : '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 35 }}
        className={`fixed top-0 right-0 h-full z-[90] w-full sm:w-[400px] flex flex-col
                   bg-surface-container-lowest shadow-[0_0_60px_rgba(0,0,0,0.5)]
                   ${!open ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'}
                   lg:relative lg:w-80 lg:shadow-none lg:z-auto lg:!translate-x-0 lg:border-l lg:border-outline-variant/10 lg:opacity-100 lg:pointer-events-auto`}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10 bg-surface-container-low/80 backdrop-blur-md">
          {location.pathname !== '/' && (
            <button 
              onClick={() => (location.pathname.startsWith('/track/') || view === 'tracking' || view === 'placed') ? navigate('/history') : navigate('/')} 
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors text-on-surface-variant flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back_ios_new</span>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-headline font-bold text-on-surface truncate flex items-center gap-2">
              {view.startsWith('history') ? 'Order History' : 
               view.startsWith('tracking') ? (
                 <>
                   Tracking
                   <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-widest truncate">
                     {placed?.orderNumber ?? '...'}
                   </span>
                 </>
               ) : 
               view === 'checkout' ? 'Checkout' : 
               (<>Cart<span className="material-symbols-outlined text-[18px] opacity-40">shopping_basket</span></>)}
            </h2>
            {view === 'cart' && (
              <p className="text-[11px] text-on-surface-variant">{itemCount ? `${itemCount} item${itemCount > 1 ? 's' : ''}` : 'Empty'}</p>
            )}
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>


        {/* ── CART ─────────────────────────────────────────────────────────── */}
        {view === 'cart' && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 gap-4 text-on-surface-variant select-none">
                  <div className="w-20 h-20 rounded-2xl bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl opacity-40">shopping_basket</span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold">Nothing here yet</p>
                    <p className="text-xs opacity-50 mt-1">Tap a dish to add it</p>
                  </div>
                </div>
              ) : items.map(item => {
                const key = itemKey(item);
                return (
                  <SwipeablePublicItem
                    key={key}
                    item={item}
                    itemKey={key}
                    onRemove={() => removeItem(item.productId, key)}
                    onUpdateQty={delta => updateQty(item.productId, delta, key)}
                    onUpdateNote={note => updateNote(item.productId, note, key)}
                  />
                );
              })}
            </div>

            <div className="flex-shrink-0 border-t border-outline-variant/10 bg-surface-container-low/60 backdrop-blur-md">
              {items.length > 0 && (
                <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                  <span className="text-sm text-on-surface-variant font-medium">Subtotal</span>
                  <span className="font-headline font-extrabold text-2xl text-on-surface">{formatCurrency(subtotal)}</span>
                </div>
              )}
              <div className="px-4 pb-4 pt-2 space-y-2">
                {items.length > 0 && (
                  <button
                    onClick={() => navigate('/checkout')}
                    className="w-full py-4 bg-primary text-on-primary rounded-2xl font-headline font-bold text-sm uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">shopping_cart_checkout</span>
                    Checkout · {formatCurrency(subtotal)}
                  </button>
                )}
                <button
                  onClick={() => navigate('/history')}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors uppercase tracking-wider"
                >
                  My Orders
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── CHECKOUT ─────────────────────────────────────────────────────── */}
        {view === 'checkout' && (
          <AnimatePresence mode="wait">

            {/* Step 1 — Phone */}
            {checkoutStep === 'phone' && (
              <motion.div key="step-phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">
                  <div>
                    <p className="font-headline font-bold text-on-surface text-lg">What's your phone number?</p>
                    <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">We'll use it to save your order and look up your profile.</p>
                  </div>
                  <label className={`flex items-center gap-3 bg-surface-container border rounded-2xl px-4 py-3.5 transition-all ${errors.phone ? 'border-error/60 bg-error/5' : 'border-outline-variant/20 focus-within:border-primary/60'}`}>
                    <span className="material-symbols-outlined text-[18px] text-outline-variant">phone</span>
                    <input
                      type="tel" placeholder="Phone number"
                      value={phone}
                      onChange={e => {
                        const val = e.target.value;
                        setPhone(val); setErrors({}); setLookupError('');
                        if (val.replace(/\D/g, '').length >= 10 && !lookingUp) lookupPhone(val);
                      }}
                      onKeyDown={e => e.key === 'Enter' && lookupPhone()}
                      autoFocus
                      className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline-variant focus:outline-none"
                    />
                    {lookingUp && <span className="material-symbols-outlined text-[18px] text-primary animate-spin flex-shrink-0">sync</span>}
                  </label>
                  {(errors.phone || lookupError) && <p className="text-xs text-error -mt-2">{errors.phone || lookupError}</p>}
                  {/* Mini order summary */}
                  <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-outline-variant/10">
                      <p className="text-[10px] font-bold text-outline uppercase tracking-widest">Your Order · {formatCurrency(subtotal)}</p>
                    </div>
                    <div className="px-4 py-3 space-y-1.5">
                      {items.map(item => {
                        const varAdj = Object.values(item.selectedVariations ?? {}).reduce((s, v) => s + (v.priceAdjustment ?? 0), 0);
                        const key = itemKey(item);
                        return (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-on-surface-variant">{item.quantity}× {item.name}</span>
                            <span className="font-semibold text-on-surface">{formatCurrency((item.price + varAdj) * item.quantity)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2 — Confirm identity */}
            {checkoutStep === 'confirm_identity' && foundCustomer && (
              <motion.div key="step-confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col items-center justify-center px-5 py-8 gap-6">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-4xl">waving_hand</span>
                </motion.div>
                <div className="text-center">
                  <p className="text-sm text-on-surface-variant">Welcome back!</p>
                  <p className="font-headline font-bold text-on-surface text-2xl mt-1">{foundCustomer.name}</p>
                  {foundCustomer.address && (
                    <p className="text-sm text-on-surface-variant mt-1 flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">location_on</span>{foundCustomer.address}
                    </p>
                  )}
                  <p className="text-xs text-outline-variant mt-2">{phone}</p>
                </div>
                <div className="w-full space-y-3">
                  <button onClick={confirmIdentity}
                    className="w-full py-4 bg-primary text-on-primary rounded-2xl font-headline font-bold text-sm uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">check_circle</span>Yes, that's me
                  </button>
                  <button onClick={notMe}
                    className="w-full py-3 rounded-2xl border border-outline-variant/20 text-sm font-bold text-on-surface-variant hover:bg-surface-container transition-colors">
                    Not me, use different info
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3 — Details + submit */}
            {checkoutStep === 'details' && (
              <motion.div key="step-details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {/* Confirmed phone row */}
                  <div className="flex items-center gap-3 bg-surface-container border border-outline-variant/10 rounded-2xl px-4 py-3">
                    <span className="material-symbols-outlined text-tertiary text-[18px] fill-1">check_circle</span>
                    <span className="text-sm text-on-surface flex-1">{phone}</span>
                    <button onClick={() => setCheckoutStep('phone')} className="text-xs font-bold text-primary hover:opacity-70 transition-opacity">Change</button>
                  </div>
                  {/* Name & address */}
                  <div className="space-y-3">
                    {([
                      { k: 'name',    label: 'Full Name', icon: 'person',      val: name,    set: setName    },
                      { k: 'address', label: 'Address',   icon: 'location_on', val: address, set: setAddress },
                    ] as const).map(f => (
                      <label key={f.k} className={`flex items-center gap-3 bg-surface-container border rounded-2xl px-4 py-3.5 transition-all ${errors[f.k] ? 'border-error/60 bg-error/5' : 'border-outline-variant/20 focus-within:border-primary/60 focus-within:bg-surface-container-high'}`}>
                        <span className={`material-symbols-outlined text-[18px] flex-shrink-0 ${errors[f.k] ? 'text-error' : 'text-outline-variant'}`}>{f.icon}</span>
                        <input
                          placeholder={f.label} value={f.val}
                          onChange={e => { f.set(e.target.value as any); setErrors(p => ({ ...p, [f.k]: '' })); }}
                          className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline-variant focus:outline-none"
                        />
                        {errors[f.k] && <span className="text-[10px] text-error font-bold flex-shrink-0">{errors[f.k]}</span>}
                      </label>
                    ))}
                    <label className="flex items-start gap-3 bg-surface-container border border-outline-variant/20 rounded-2xl px-4 py-3.5 focus-within:border-primary/60 focus-within:bg-surface-container-high transition-all">
                      <span className="material-symbols-outlined text-[18px] text-outline-variant mt-0.5 flex-shrink-0">sticky_note_2</span>
                      <textarea placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} rows={2}
                        className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline-variant focus:outline-none resize-none" />
                    </label>
                  </div>
                  {serverError && <div className="bg-error/10 border border-error/20 rounded-2xl px-4 py-3 text-sm text-error">{serverError}</div>}
                </div>
                <div className="flex-shrink-0 p-4 border-t border-outline-variant/10 bg-surface-container-low/60 backdrop-blur-md">
                  <button onClick={placeOrder} disabled={submitting}
                    className="w-full py-4 bg-primary text-on-primary rounded-2xl font-headline font-bold text-sm uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting
                      ? <><span className="material-symbols-outlined animate-spin">sync</span>Placing…</>
                      : <><span className="material-symbols-outlined">check_circle</span>Place Order · {formatCurrency(subtotal)}</>
                    }
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        )}

        {/* ── PLACED (RECEIPT) ─────────────────────────────────────────────── */}
        {view === 'placed' && placed && (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
              {/* Success badge */}
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-tertiary/15 border-2 border-tertiary/30 flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-4xl text-tertiary fill-1">check_circle</span>
                </motion.div>
                <div className="text-center">
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest">Order confirmed</p>
                  <h3 className="font-headline font-bold text-3xl text-on-surface mt-1">{placed.orderNumber}</h3>
                </div>
              </div>

              {/* Receipt card */}
              <div className="bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10">
                <div className="px-4 py-3 bg-surface-container-high/40 border-b border-outline-variant/10 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-outline-variant">receipt_long</span>
                  <p className="text-[10px] font-bold text-outline uppercase tracking-widest">Receipt</p>
                </div>
                <div className="px-4 py-4 space-y-2.5">
                  {cartSnapshot.map(item => {
                    const varAdj = Object.values(item.selectedVariations ?? {}).reduce((s, v) => s + (v.priceAdjustment ?? 0), 0);
                    const key = itemKey(item);
                    return (
                      <div key={key} className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-on-surface font-medium">{item.quantity}× {item.name}</p>
                          {Object.values(item.selectedVariations ?? {}).length > 0 && (
                            <p className="text-[10px] text-on-surface-variant">{Object.values(item.selectedVariations!).map(v => v.name).join(' · ')}</p>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-on-surface flex-shrink-0">{formatCurrency((item.price + varAdj) * item.quantity)}</span>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-outline-variant/10 flex justify-between font-headline font-bold">
                    <span className="text-on-surface">Total</span>
                    <span className="text-primary text-lg">{formatCurrency(cartSnapshot.reduce((s, i) => s + (i.price + Object.values(i.selectedVariations ?? {}).reduce((a, v) => a + (v.priceAdjustment ?? 0), 0)) * i.quantity, 0))}</span>
                  </div>
                </div>
                <div className="px-4 pb-4 pt-2 border-t border-outline-variant/10 space-y-1 text-xs text-on-surface-variant">
                  <p className="font-semibold text-on-surface">{name} · {phone}</p>
                  <p>{address}</p>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-outline-variant/10 bg-surface-container-low/60 backdrop-blur-md space-y-2">
              <button
                onClick={() => navigate(`/track/${placed.trackingToken}`)}
                className="relative w-full py-3.5 bg-primary text-on-primary rounded-2xl font-headline font-bold text-sm uppercase tracking-widest overflow-hidden shadow-lg shadow-primary/20"
              >
                {/* Auto-fill progress bar */}
                <motion.div
                  className="absolute inset-0 bg-white/15 origin-left"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ duration: 3, ease: 'linear' }}
                />
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin">sync</span>
                  Opening Tracker…
                </span>
              </button>
              <button onClick={() => { clearCart(); reset(); navigate('/'); }} className="w-full py-2.5 text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-wider">
                Back to Menu
              </button>
            </div>
          </>
        )}

        {/* ── TRACKING ─────────────────────────────────────────────────────── */}
        {view === 'tracking' && (() => {
          const TIMELINE = [
            { label: 'Queued',    icon: 'receipt_long'    },
            { label: 'Preparing', icon: 'restaurant'       },
            { label: 'On the Way',icon: 'delivery_dining'  },
            { label: 'Delivered', icon: 'home'             },
          ] as const;

          const stepOf = (s: string): number => ({
            'Queued': 0, 'Preparing': 1, 'Packaging': 1,
            'Out for delivery': 2, 'Done': 3,
          } as Record<string, number>)[s] ?? 0;

          const statusMsg = (s: string): [string, string, string] => ({
            'Queued':           ['Your order is', 'queued', 'and awaiting preparation'],
            'Preparing':        ['The kitchen is', 'preparing', 'your order'],
            'Packaging':        ['Your order is being', 'packed', ''],
            'Out for delivery': ['Your order is', 'on the way', ''],
            'Done':             ['Your order has been', 'delivered', ''],
          } as Record<string,[string,string,string]>)[s] ?? ['Your order is being', 'processed', ''];

          const status = tracking?.status ?? '';
          const isVerifying = status === 'Draft' || status === '' || status === 'Verification';
          const currentStep = isVerifying ? -1 : stepOf(status);
          const [pre, bold, post] = isVerifying ? ['We will call you soon to','verify','your order'] : statusMsg(status);
          const isDone = currentStep === 3;
          const eta = tracking?.estimatedDelivery
            ? new Date(tracking.estimatedDelivery).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '30 – 45 min';

          return (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              <div className="flex-1 flex flex-col items-center px-6 py-10 gap-8 min-h-0 overflow-y-auto custom-scrollbar">

                {/* Thank you header */}
                <div className="text-center">
                  <p className="font-headline font-extrabold text-3xl text-primary">Thank you</p>
                  <p className="text-sm text-on-surface-variant mt-0.5">
                    for ordering at <span className="font-bold text-on-surface">{restaurantName}</span>
                  </p>
                </div>

                {/* Bag */}
                <div className="relative flex-shrink-0">
                  <motion.div
                    animate={!isDone ? { y: [0, -6, 0] } : {}}
                    transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
                    className="w-48 h-48 flex items-center justify-center drop-shadow-2xl"
                  >
                    <img src="/src/assets/order-bag.png" alt="Order bag" className="w-full h-full object-contain" />
                  </motion.div>
                  {isDone && (
                    <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-tertiary rounded-full flex items-center justify-center border-2 border-surface-container-lowest shadow-lg">
                      <span className="material-symbols-outlined text-on-tertiary text-xl fill-1">check</span>
                    </div>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {isVerifying ? (
                    /* ── Waiting for verification ── */
                    <motion.div
                      key="verifying"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="flex flex-col items-center gap-4 text-center"
                    >
                      <motion.div
                        animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                        transition={{ repeat: Infinity, duration: 1.8 }}
                        className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-primary text-3xl">phone_in_talk</span>
                      </motion.div>
                      <div>
                        <p className="font-headline font-bold text-on-surface text-lg">Awaiting Confirmation</p>
                        <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed max-w-[260px]">
                          Our team will call you shortly to verify your order. Please keep your phone nearby.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {[0, 0.3, 0.6].map(delay => (
                          <motion.span key={delay}
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ repeat: Infinity, duration: 1.4, delay }}
                            className="w-2 h-2 rounded-full bg-primary inline-block"
                          />
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    /* ── Active order ── */
                    <motion.div
                      key="active"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="w-full flex flex-col gap-5"
                    >
                      {/* ETA + status */}
                      <div className="text-center">
                        <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Estimated arrival</p>
                        <p className="font-headline font-extrabold text-2xl text-tertiary mt-0.5">{eta}</p>
                      </div>
                      <p className="text-center text-base text-on-surface leading-relaxed">
                        {pre} <span className="font-extrabold text-primary">{bold}</span>{post ? ` ${post}` : ''}
                      </p>

                      {/* Interactive timeline */}
                      <div className="w-full">
                        {/* Icon + bar row */}
                        <div className="flex items-center">
                          {TIMELINE.map((step, i) => {
                            const done = i < currentStep;
                            const active = i === currentStep;
                            return (
                              <React.Fragment key={step.label}>
                                <div className="flex-shrink-0 flex flex-col items-center">
                                  <motion.div
                                    animate={active ? { scale: [1, 1.1, 1] } : {}}
                                    transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                                    className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-500
                                      ${done
                                        ? 'bg-tertiary border-tertiary shadow-lg shadow-tertiary/30'
                                        : active
                                          ? 'border-tertiary bg-tertiary/10 shadow-md shadow-tertiary/20'
                                          : 'border-outline-variant/30 bg-surface-container'
                                      }`}
                                  >
                                    <span className={`material-symbols-outlined text-[19px] transition-all duration-500
                                      ${done ? 'text-on-tertiary fill-1' : active ? 'text-tertiary' : 'text-outline-variant/40'}`}>
                                      {done ? 'check' : step.icon}
                                    </span>
                                  </motion.div>
                                  <span className={`mt-2 text-[8px] font-bold uppercase tracking-wider text-center leading-tight w-14 transition-colors duration-500
                                    ${done ? 'text-tertiary/80' : active ? 'text-tertiary' : 'text-outline-variant/40'}`}>
                                    {step.label}
                                  </span>
                                </div>
                                {i < TIMELINE.length - 1 && (
                                  <div className="flex-1 -mt-5 mx-1.5 h-[3px] rounded-full overflow-hidden bg-outline-variant/20">
                                    <motion.div
                                      initial={{ width: done ? '100%' : '0%' }}
                                      animate={{ width: done ? '100%' : '0%' }}
                                      transition={{ duration: 0.8, ease: 'easeInOut' }}
                                      className="h-full bg-tertiary"
                                    />
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Interactive CTA ── */}
                      <div className="pt-2 min-h-[60px] flex items-center justify-center">
                        <AnimatePresence mode="wait">
                          {/* Confirm Delivery (only if Out for delivery) */}
                          {status === 'Out for delivery' && (
                            <motion.button
                              key="btn-confirm"
                              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                              onClick={async () => {
                                const tToken = placed?.trackingToken || token || ui.placedOrder?.trackingToken;
                                if (!tToken) return;
                                setConfirming(true);
                                try {
                                  await publicApi.confirmDelivery(tToken);
                                  const updated = await publicApi.getOrderTracking(tToken);
                                  setTracking(updated);
                                } catch {} finally { setConfirming(false); }
                              }}
                              disabled={confirming}
                              className="w-full py-3.5 rounded-2xl bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                            >
                              {confirming ? <span className="material-symbols-outlined animate-spin">sync</span> : <span className="material-symbols-outlined">verified</span>}
                              Confirm Delivery
                            </motion.button>
                          )}

                          {/* Leave Review (only if Done) */}
                          {currentStep === 3 && !trackingReviewDone && (
                            <motion.button
                              key="btn-review"
                              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                              onClick={() => setTrackingReviewOpen(true)}
                              className="w-full py-3.5 rounded-2xl bg-tertiary text-on-tertiary font-headline font-bold text-sm uppercase tracking-widest shadow-lg shadow-tertiary/20 flex items-center justify-center gap-2"
                            >
                              <span className="material-symbols-outlined">star</span>
                              Leave a Review
                            </motion.button>
                          )}

                          {/* Thank you message */}
                          {currentStep === 3 && trackingReviewDone && (
                            <motion.div
                              key="msg-thanks"
                              initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                              className="flex flex-col items-center gap-1 py-1"
                            >
                              <div className="flex items-center gap-2 text-tertiary font-bold">
                                <span className="material-symbols-outlined fill-1 text-xl">check_circle</span>
                                <span className="text-sm">Delivered & Reviewed</span>
                              </div>
                              <p className="text-[10px] text-on-surface-variant font-medium">Thank you for your feedback!</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Bottom courier card (hidden while awaiting staff verification) ── */}
              {!isVerifying && <div className="flex-shrink-0 bg-surface-container-low rounded-t-3xl border-t border-outline-variant/10 shadow-[0_-12px_40px_rgba(0,0,0,0.25)]">
                <div className="w-10 h-1 bg-outline-variant/30 rounded-full mx-auto mt-3" />
                <AnimatePresence mode="wait">
                  {currentStep >= 2 ? (
                    <motion.div key="courier-visible"
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                      className="px-5 pb-5 pt-2 space-y-2"
                    >
                      {/* Courier row */}
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {tracking?.courier?.avatar
                            ? <img src={tracking.courier.avatar} alt={tracking.courier.name} className="w-full h-full object-cover" />
                            : <span className="material-symbols-outlined text-primary text-xl">person</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-on-surface text-sm truncate">{tracking?.courier?.name ?? 'Delivery Agent'}</p>
                          <p className="text-xs text-on-surface-variant">Courier</p>
                        </div>
                        <button className="w-9 h-9 rounded-full bg-tertiary/15 border border-tertiary/20 flex items-center justify-center text-tertiary hover:bg-tertiary/25 transition-colors active:scale-95 flex-shrink-0">
                          <span className="material-symbols-outlined text-lg">call</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-on-surface-variant text-center leading-relaxed">
                        If the order takes more time you can call the delivery agent.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="courier-pending"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-start gap-3 px-5 py-4"
                    >
                      <div className="w-9 h-9 rounded-full bg-outline-variant/10 border border-outline-variant/20 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-outline-variant text-lg">delivery_dining</span>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed pt-1">
                        The contact of the delivery agent will be shared with you as soon as your order is <span className="font-semibold text-on-surface">out for delivery</span>.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>}

              {/* ── Inline review sheet ── */}
              <AnimatePresence>
                {trackingReviewOpen && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-end"
                  >
                    <motion.div
                      initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                      className="w-full bg-surface-container-lowest rounded-t-3xl p-6 space-y-4 border-t border-outline-variant/10"
                    >
                      <div className="w-10 h-1 bg-outline-variant/40 rounded-full mx-auto" />
                      <div className="text-center">
                        <h3 className="font-headline font-bold text-on-surface text-lg">How was your order?</h3>
                        <p className="text-xs text-on-surface-variant mt-0.5">{placed?.orderNumber}</p>
                      </div>
                      <div className="flex justify-center gap-3">
                        {[1,2,3,4,5].map(s => (
                          <button key={s} onClick={() => setTrackingReviewStars(s)}
                            className={`material-symbols-outlined text-4xl transition-all ${s <= trackingReviewStars ? 'text-tertiary fill-1 scale-110' : 'text-outline-variant'}`}>star</button>
                        ))}
                      </div>
                      <textarea
                        value={trackingReviewComment} onChange={e => setTrackingReviewComment(e.target.value)}
                        placeholder="Share your experience…" rows={3}
                        className="w-full bg-surface-container border border-outline-variant/20 rounded-2xl px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/60 resize-none transition-all"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setTrackingReviewOpen(false)} className="flex-1 py-3 bg-surface-container text-on-surface-variant rounded-xl text-sm font-bold hover:bg-surface-container-high transition-colors">Cancel</button>
                        <button onClick={submitTrackingReview} className="flex-1 py-3 bg-tertiary text-on-tertiary rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-md shadow-tertiary/20">Submit</button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* ── HISTORY: PHONE ───────────────────────────────────────────────── */}
        {view === 'history_phone' && (
          <div className="flex-1 flex flex-col p-5 gap-5">
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {firebaseActive ? 'Enter your phone number to view your order history.' : 'Enter your phone number to access your orders.'}
            </p>
            <label className="flex items-center gap-3 bg-surface-container border border-outline-variant/20 rounded-2xl px-4 py-3.5 focus-within:border-primary/60 transition-all">
              <span className="material-symbols-outlined text-[18px] text-outline-variant">phone</span>
              <input
                type="tel" placeholder="Phone number"
                value={histPhone} onChange={e => setHistPhone(e.target.value)}
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline-variant focus:outline-none"
              />
            </label>
            {otpError && <p className="text-xs text-error">{otpError}</p>}
            <button
              onClick={requestOtp}
              disabled={otpSending || !histPhone.trim()}
              className={`py-4 w-full rounded-2xl font-headline font-bold text-sm uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 bg-primary text-on-primary hover:opacity-90 shadow-primary/20 disabled:opacity-50`}
            >
              {otpSending 
                ? <span className="material-symbols-outlined animate-spin">sync</span> 
                : firebaseActive 
                  ? <><span className="material-symbols-outlined">sms</span>Send Code</>
                  : <><span className="material-symbols-outlined">person</span>View My Orders</>
              }
            </button>
            {!firebaseActive && <p className="text-[10px] text-center text-on-surface-variant/60 italic">SMS Authentication is disabled. Accessing history without verification.</p>}
          </div>
        )}

        {/* ── HISTORY: OTP ─────────────────────────────────────────────────── */}
        {view === 'history_otp' && (
          <div className="flex-1 flex flex-col p-5 gap-5">
            <p className="text-sm text-on-surface-variant">Code sent to <span className="font-semibold text-on-surface">{histPhone}</span></p>
            <input
              type="text" inputMode="numeric" maxLength={6} placeholder="— — — — — —"
              value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              className="bg-surface-container border border-outline-variant/20 rounded-2xl px-4 py-5 text-center text-3xl font-headline font-bold text-on-surface tracking-[0.6em] focus:outline-none focus:border-primary/60 transition-all"
            />
            {otpError && <p className="text-xs text-error">{otpError}</p>}
            <button
              onClick={verifyOtp}
              disabled={histLoading || otp.length < 6}
              className="py-4 bg-primary text-on-primary rounded-2xl font-headline font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              {histLoading ? <span className="material-symbols-outlined animate-spin">sync</span> : 'Verify'}
            </button>
            <button
              onClick={requestOtp}
              disabled={cooldown > 0 || otpSending}
              className="text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        )}

        {/* ── HISTORY: LIST ────────────────────────────────────────────────── */}
        {view === 'history_list' && (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative">
            {histLoading && (
              <div className="flex items-center justify-center h-32">
                <span className="material-symbols-outlined text-3xl animate-spin text-primary">sync</span>
              </div>
            )}
            {!histLoading && histOrders.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl opacity-30">receipt_long</span>
                <p className="text-sm font-medium">No orders found</p>
              </div>
            )}
            {!histLoading && histOrders.map(order => {
              const isDone = order.status === 'Done';
              const isCancelled = order.status === 'Cancelled';
              const isActive = !isDone && !isCancelled;

              return (
                <div 
                  key={order.id} 
                  className={`bg-surface-container rounded-2xl overflow-hidden border border-outline-variant/10 transition-all ${isActive ? 'cursor-pointer hover:border-primary/30 active:scale-[0.99] shadow-sm hover:shadow-md' : ''}`}
                  onClick={() => {
                    if (isActive && order.trackingToken) {
                      const mappedItems: any[] = order.items.map(i => ({ productId: 'hist', name: i.name, quantity: i.quantity, price: 0 }));
                      setPlaced({ orderId: order.id, orderNumber: order.orderNumber, trackingToken: order.trackingToken! }, mappedItems); 
                      setView('tracking');
                    }
                  }}
                >
                  <div className="px-4 py-3 flex items-start justify-between gap-2 border-b border-outline-variant/10 bg-surface-container-high/40">
                    <div>
                      <p className="font-headline font-bold text-on-surface">{order.orderNumber}</p>
                      <p className="text-[10px] text-on-surface-variant">{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-primary">{formatCurrency(order.total)}</p>
                      <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isDone ? 'bg-tertiary/10 text-tertiary' : 
                        isCancelled ? 'bg-error/10 text-error' : 
                        'bg-primary/10 text-primary animate-pulse'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    <p className="text-xs text-on-surface-variant line-clamp-2">{order.items.map(i => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}</p>
                    
                    <div className="flex items-center justify-between pt-1">
                      {isActive && order.trackingToken ? (
                        <div className="flex items-center gap-1.5 text-primary text-[10px] font-bold uppercase tracking-widest">
                          <span className="material-symbols-outlined text-[16px] animate-pulse">radar</span>
                          Track Live
                        </div>
                      ) : (
                        <div className="w-1" />
                      )}

                      {isDone && !order.review && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setReviewTarget(order); }}
                          className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider bg-tertiary text-on-tertiary rounded-lg hover:opacity-90 transition-opacity shadow-sm shadow-tertiary/20 flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[15px]">rate_review</span>
                          Review
                        </button>
                      )}
                      
                      {order.review && (
                        <div className="flex items-center gap-0.5 text-tertiary py-1">
                          {[...Array(5)].map((_, i) => (
                            <span key={i} className={`material-symbols-outlined text-base ${i < order.review!.stars ? 'fill-1' : ''}`}>star</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="px-5 py-6 mt-4">
              <button 
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-surface-container/50 text-on-surface-variant text-xs font-bold border border-outline-variant/10 hover:bg-error/5 hover:text-error hover:border-error/20 transition-all uppercase tracking-widest"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Logout
              </button>
            </div>

            {/* Review sheet */}
            <AnimatePresence>
              {reviewTarget && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-end"
                >
                  <motion.div
                    initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    className="w-full bg-surface-container-lowest rounded-t-3xl p-6 space-y-4 border-t border-outline-variant/10"
                  >
                    <div className="w-10 h-1 bg-outline-variant/40 rounded-full mx-auto" />
                    <h3 className="font-headline font-bold text-on-surface">Leave a Review</h3>
                    <p className="text-xs text-on-surface-variant">{reviewTarget.orderNumber}</p>
                    <div className="flex justify-center gap-3">
                      {[1,2,3,4,5].map(s => (
                        <button key={s} onClick={() => setReviewStars(s)}
                          className={`material-symbols-outlined text-4xl transition-all ${s <= reviewStars ? 'text-tertiary fill-1 scale-110' : 'text-outline-variant scale-100'}`}>
                          star
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                      placeholder="Share your experience…" rows={3}
                      className="w-full bg-surface-container border border-outline-variant/20 rounded-2xl px-4 py-3 text-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary/60 resize-none transition-all"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setReviewTarget(null)} className="flex-1 py-3 bg-surface-container text-on-surface-variant rounded-xl text-sm font-bold hover:bg-surface-container-high transition-colors">Cancel</button>
                      <button onClick={submitReview} className="flex-1 py-3 bg-tertiary text-on-tertiary rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">Submit</button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.aside>
    </>
  );
}

// ─── Floating action button (mobile) ──────────────────────────────────────────
function FloatingCartButton({ onOpen }: { onOpen: () => void }) {
  const { items, subtotal, itemCount } = usePublicCart();
  const { formatCurrency } = useLocalization();
  if (!itemCount) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 32 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:hidden w-[calc(100%-2rem)] max-w-sm"
    >
      <button
        onClick={onOpen}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-surface-container-high/90 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl hover:bg-surface-container-highest/90 transition-colors active:scale-[0.98]"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined text-secondary text-2xl">shopping_basket</span>
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-on-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
              {itemCount}
            </span>
          </div>
          <span className="font-headline font-bold text-on-surface text-sm">View Order</span>
        </div>
        <span className="font-headline font-extrabold text-lg text-primary">{formatCurrency(subtotal)}</span>
      </button>
    </motion.div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
function PublicMenuPageInner() {
  const { addItem, itemCount } = usePublicCart();
  const branding = getBranding();
  const restaurantName: string = branding.restaurantName || 'Our Restaurant';
  const restaurantLogo: string = branding.logo || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariations, setSelectedVariations] = useState<Record<string, VariationOption>>({});
  const [productRect, setProductRect] = useState<DOMRect | null>(null);

  // Cart: auto-open on desktop when first item added
  const [cartOpen, setCartOpen] = useState(false);
  const prevCount = useRef(0);
  useEffect(() => {
    if (itemCount > prevCount.current && prevCount.current === 0) setCartOpen(true);
    prevCount.current = itemCount;
  }, [itemCount]);

  useEffect(() => {
    publicApi.getPublicMenu()
      .then(data => {
        setProducts(data.flatMap(c => c.products));
        setCategories(['All', ...data.map(c => c.name)]);
      })
      .catch(() => setError('Could not load menu. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory);

  const handleProductClick = (product: Product, e: React.MouseEvent<HTMLDivElement>) => {
    // Check for explicit false; if undefined or true, treat as in stock.
    if (product.inStock === false) return;

    if (product.variations?.length) {
      const rect = e.currentTarget.getBoundingClientRect();
      const init: Record<string, VariationOption> = {};
      product.variations.forEach(g => { 
        if (g.options && g.options.length > 0) {
          init[g.id] = g.options[0]; 
        }
      });
      setProductRect(rect); 
      setSelectedProduct(product); 
      setSelectedVariations(init);
    } else {
      addItem({ 
        productId: product.id, 
        name: product.name, 
        price: product.price, 
        image: product.image, 
        quantity: 1 
      });
    }
  };

  const handleAddWithVariations = () => {
    if (!selectedProduct) return;
    addItem({
      productId: selectedProduct.id, name: selectedProduct.name,
      price: selectedProduct.price, image: selectedProduct.image, quantity: 1,
      selectedVariations: Object.fromEntries(
        Object.entries(selectedVariations).map(([gId, opt]) => [gId, { id: opt.id, name: opt.name, priceAdjustment: opt.priceAdjustment ?? 0 }])
      ),
    });
    setSelectedProduct(null); setSelectedVariations({});
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">

      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 md:px-8 h-16 border-b border-outline-variant/10 bg-surface-container-lowest">
        <div className="flex items-center gap-3">
          {restaurantLogo
            ? <img src={restaurantLogo} alt={restaurantName} className="h-9 w-9 rounded-xl object-cover" />
            : <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center"><span className="material-symbols-outlined text-primary">ramen_dining</span></div>
          }
          <span className="font-headline font-bold text-on-surface text-lg">{restaurantName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-outline hover:text-on-surface hover:bg-surface-container transition-colors uppercase tracking-wider">
            <span className="material-symbols-outlined text-[14px]">lock</span>
            <span className="hidden sm:inline">Staff</span>
          </Link>
          <button
            onClick={() => setCartOpen(o => !o)}
            className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface text-[20px]">shopping_basket</span>
            {itemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-tight">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Category filter */}
      <div className="flex-shrink-0 px-4 md:px-8 py-3 border-b border-outline-variant/10 bg-surface-container-lowest">
        <CategoryFilter categories={categories} activeCategory={activeCategory} onChange={setActiveCategory} />
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-grid-pattern">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">sync</span>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <span className="material-symbols-outlined text-5xl text-error">wifi_off</span>
              <p className="text-sm text-on-surface-variant">{error}</p>
              <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold">Retry</button>
            </div>
          )}
          {!loading && !error && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-28 lg:pb-8">
              {filtered.map(product => (
                <ProductCard key={product.id} product={product} onClick={e => handleProductClick(product, e)} />
              ))}
            </div>
          )}
        </div>

        {/* Desktop cart (shown when open) */}
        <AnimatePresence>
          {cartOpen && (
            <motion.div
              key="desktop-cart"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="hidden lg:block flex-shrink-0 overflow-hidden"
            >
              <PublicCartPanel open={true} setOpen={setCartOpen} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile cart */}
      <div className="lg:hidden">
        <PublicCartPanel open={cartOpen} setOpen={setCartOpen} />
      </div>

      {/* Mobile floating button */}
      <AnimatePresence>
        {!cartOpen && <FloatingCartButton onOpen={() => setCartOpen(true)} />}
      </AnimatePresence>

      {/* Variation modal */}
      <AnimatePresence>
        {selectedProduct && productRect && selectedProduct.variations && (
          <VariationModal
            product={selectedProduct}
            productRect={productRect}
            selectedVariations={selectedVariations}
            onSelectVariation={(gId, opt) => setSelectedVariations(p => ({ ...p, [gId]: opt }))}
            onClose={() => setSelectedProduct(null)}
            onAdd={handleAddWithVariations}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PublicMenuPage() {
  return (
    <LocalizationProvider>
      <PublicMenuPageInner />
    </LocalizationProvider>
  );
}
