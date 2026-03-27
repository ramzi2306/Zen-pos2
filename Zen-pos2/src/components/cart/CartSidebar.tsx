import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem, Order, Customer, CustomerDetail } from '../../data';
import * as api from '../../api';
import { SwipeableCartItem } from './CartItem';
import type { BrandingData } from '../../api/settings';
import { useLocalization } from '../../context/LocalizationContext';

/**
 * CartSidebar — the main checkout panel.
 *
 * Two view modes:
 * - **cart**    Default. Shows items, customer picker, order type selector,
 *               and a "Payer" CTA that switches to receipt mode.
 * - **receipt** Print-preview of the paper receipt with payment numpad,
 *               "Send to Kitchen" and "Save for Later" actions.
 *
 * Notable features:
 * - Customer search with live API dropdown + full client list modal
 * - Per-customer order history modal
 * - Swipeable cart items (drag-to-delete via SwipeableCartItem)
 * - 3D-touch payment numpad and order-note pop-overs
 * - Delivery address input (when order type = delivery)
 * - Print receipt via window.open()
 * - Tax calculation: subtotal × 1.28875 (8.875% tax + 20% gratuity)
 *
 * @prop cart            - Current cart items
 * @prop updateQuantity  - Increment / decrement a line item
 * @prop updateCartItem  - Patch arbitrary fields on a cart item
 * @prop isOpen          - Controls mobile visibility (on desktop always visible)
 * @prop onClose         - Close callback (mobile only)
 * @prop onClearCart     - Empty the whole cart
 * @prop onOrderCreated  - Called with the newly-created Order after kitchen send
 */
export const CartSidebar = ({
  cart,
  updateQuantity,
  updateCartItem,
  isOpen,
  onClose,
  onClearCart,
  onOrderCreated,
  branding,
}: {
  cart: CartItem[];
  updateQuantity: (cartItemId: string, delta: number) => void;
  updateCartItem: (cartItemId: string, updates: Partial<CartItem>) => void;
  isOpen: boolean;
  onClose: () => void;
  onClearCart?: () => void;
  onOrderCreated?: (order: Order) => void;
  branding?: BrandingData;
}) => {
  const { localization, formatCurrency } = useLocalization();

  // ── Subtotal ────────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((sum, item) => {
    const variationsPrice = Object.values(item.selectedVariations || {}).reduce(
      (vSum: number, opt: any) => vSum + (opt.priceAdjustment || 0), 0
    );
    const itemPrice = item.price + variationsPrice - (item.discount || 0);
    return sum + itemPrice * item.quantity;
  }, 0);
  const taxRate = localization.taxEnabled ? localization.taxRate / 100 : 0;
  const taxAmount = subtotal * taxRate;
  const gratuityAmount = subtotal * 0.20;
  const total = subtotal + taxAmount + gratuityAmount;

  // ── State ───────────────────────────────────────────────────────────────────
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryDetails, setDeliveryDetails] = useState({ name: '', phone: '', zone: '', address: '' });
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [viewMode, setViewMode] = useState<'cart' | 'receipt'>('cart');
  const [isClientListModalOpen, setIsClientListModalOpen] = useState(false);
  const [apiClients, setApiClients] = useState<Customer[]>([]);
  const [clientModalSearch, setClientModalSearch] = useState('');
  const [historyCustomer, setHistoryCustomer] = useState<CustomerDetail | null>(null);
  const [newOrderMenuRect, setNewOrderMenuRect] = useState<DOMRect | null>(null);
  const [paymentMenuRect, setPaymentMenuRect] = useState<DOMRect | null>(null);
  const [noteMenuRect, setNoteMenuRect] = useState<DOMRect | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  const [receiptModal, setReceiptModal] = useState<{ orderNumber: string; paidAmount: number } | null>(null);
  const [printReady, setPrintReady] = useState(false);

  const change = parseFloat(amountPaid) > total ? parseFloat(amountPaid) - total : 0;

  const fullReset = () => {
    if (onClearCart) onClearCart();
    setViewMode('cart');
    setOrderNote('');
    setCreatedOrderNumber(null);
    setAmountPaid('');
    setDeliveryDetails({ name: '', phone: '', zone: '', address: '' });
    setOrderType('dine_in');
    setToast(null);
  };

  // Load clients when sidebar opens
  useEffect(() => {
    if (isOpen) api.customers.listCustomers().then(setApiClients).catch(() => {});
  }, [isOpen]);

  const filteredClients = apiClients.filter(
    c => c.phone.includes(customerSearch) || c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  // ── Handlers ────────────────────────────────────────────────────────────────
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
          <div class="receipt">${printContent.innerHTML}</div>
          <script>window.onload = () => { window.print(); window.close(); };<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintReceipt = () => {
    if (!receiptModal) return;
    const storeName = branding?.restaurantName || 'ZEN OMAKASE';
    const address = (branding?.address || '').split('\n').filter(Boolean);
    const phone = branding?.phone || '';
    const email = branding?.email || '';
    const footer = branding?.footerText || 'Thank you for dining with us!';
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const itemRows = cart.map(item => {
      const variations = Object.values(item.selectedVariations || {}) as any[];
      const varAdj = variations.reduce((s: number, o: any) => s + (o.priceAdjustment || 0), 0);
      const lineTotal = ((item.price + varAdj) * item.quantity * (1 - (item.discount || 0) / 100)).toFixed(2);
      const varNames = variations.map((o: any) => o.name).join(', ');
      const sub = [item.quantity > 1 ? `${item.quantity}×` : '', varNames, item.notes ? `— ${item.notes}` : ''].filter(Boolean).join(' ');
      return `<div class="item"><div class="item-row"><span>${item.name}</span><span>${formatCurrency(parseFloat(lineTotal))}</span></div>${sub ? `<div class="item-sub">${sub}</div>` : ''}</div>`;
    }).join('');
    const customerSection = (deliveryDetails.name || deliveryDetails.phone || deliveryDetails.address) ? `
      <hr class="dashed">
      ${deliveryDetails.name ? `<div class="info">Name: ${deliveryDetails.name}</div>` : ''}
      ${deliveryDetails.phone ? `<div class="info">Phone: ${deliveryDetails.phone}</div>` : ''}
      ${deliveryDetails.address ? `<div class="info">Addr: ${deliveryDetails.address}</div>` : ''}` : '';
    const noteSection = orderNote ? `<hr class="dashed"><div class="note">Note: ${orderNote}</div>` : '';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: 100mm auto; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; width: 100mm; }
      .receipt { width: 100mm; padding: 6mm 5mm 8mm; }
      .header { text-align: center; margin-bottom: 8px; }
      .store-name { font-size: 15px; font-weight: bold; margin-bottom: 3px; }
      .store-sub { font-size: 9px; color: #555; margin-bottom: 1px; }
      .meta { display: flex; justify-content: space-between; font-size: 9px; color: #555; text-transform: uppercase; margin: 4px 0; }
      hr.dashed { border: none; border-top: 1px dashed #bbb; margin: 6px 0; }
      .info { font-size: 9px; text-transform: uppercase; margin: 2px 0; }
      .item { margin: 4px 0; }
      .item-row { display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; }
      .item-sub { font-size: 9px; color: #666; padding-left: 4px; }
      .note { font-size: 9px; color: #555; text-transform: uppercase; }
      .total-row { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin: 2px 0; }
      .grand-total { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; border-top: 1px dashed #bbb; padding-top: 5px; margin-top: 4px; }
      .cash-row { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin: 2px 0; }
      .change-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; color: #16a34a; }
      .footer { text-align: center; margin-top: 10px; font-size: 9px; color: #777; font-style: italic; letter-spacing: 0.06em; }
    </style></head><body><div class="receipt">
      <div class="header">
        <div class="store-name">${storeName}</div>
        ${address.map(l => `<div class="store-sub">${l}</div>`).join('')}
        ${phone ? `<div class="store-sub">${phone}</div>` : ''}
        ${email ? `<div class="store-sub">${email}</div>` : ''}
      </div>
      <hr class="dashed">
      <div class="meta"><span>${date}</span><span>${receiptModal.orderNumber}</span></div>
      ${customerSection}
      <hr class="dashed">
      ${itemRows}
      ${noteSection}
      <hr class="dashed">
      <div class="total-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
      ${taxAmount > 0 ? `<div class="total-row"><span>Tax (${localization.taxRate}%)</span><span>${formatCurrency(taxAmount)}</span></div>` : ''}
      <div class="total-row"><span>Gratuity (20%)</span><span>${formatCurrency(gratuityAmount)}</span></div>
      <div class="grand-total"><span>TOTAL</span><span>${formatCurrency(total)}</span></div>
      <div class="cash-row"><span>Cash Paid</span><span>${formatCurrency(receiptModal.paidAmount)}</span></div>
      <div class="change-row"><span>Change</span><span>${formatCurrency(Math.max(0, receiptModal.paidAmount - total))}</span></div>
      <div class="footer">${footer}</div>
    </div><script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);};<\/script></body></html>`;
    const win = window.open('', '_blank', 'width=500,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const handleCreateOrder = async (paymentStatus: 'Unpaid' | 'Paid', orderStatus: 'Queued' | 'Draft' = 'Queued') => {
    if (cart.length === 0) return;
    try {
      const customer = deliveryDetails.name || deliveryDetails.phone
        ? { name: deliveryDetails.name, phone: deliveryDetails.phone || '', address: deliveryDetails.address || undefined }
        : { name: '', phone: '' };
      const newOrder = await api.orders.createOrder(cart, orderType, '', customer, orderNote, paymentStatus, orderStatus);
      setCreatedOrderNumber(newOrder.orderNumber ?? null);
      if (onOrderCreated) onOrderCreated(newOrder);
      if (paymentStatus === 'Paid') {
        setReceiptModal({ orderNumber: newOrder.orderNumber ?? '—', paidAmount: parseFloat(amountPaid) || 0 });
        setPrintReady(false);
        setTimeout(() => setPrintReady(true), 3000);
      } else {
        const label = orderStatus === 'Draft' ? 'Draft saved!' : `${newOrder.orderNumber ?? 'Order'} sent to kitchen!`;
        setToast({ message: label, type: 'success' });
        setTimeout(() => fullReset(), 2000);
      }
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to create order.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleSelectClient = (client: Customer) => {
    setDeliveryDetails({ name: client.name, phone: client.phone, zone: '', address: client.address || '' });
    setCustomerSearch('');
    setShowClientDropdown(false);
  };

  const handleOpenClientList = () => {
    setIsClientListModalOpen(true);
    setClientModalSearch('');
    api.customers.listCustomers().then(setApiClients).catch(console.error);
  };

  const handleViewHistory = async (e: React.MouseEvent, customerId: string) => {
    e.stopPropagation();
    try {
      const detail = await api.customers.getCustomer(customerId);
      setHistoryCustomer(detail);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[55] lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`fixed inset-y-0 right-0 w-96 max-w-[90vw] flex-shrink-0 bg-surface-container/95 backdrop-blur-xl border-l border-outline-variant/20 flex flex-col z-[80] shadow-2xl transition-transform duration-300 lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {viewMode === 'cart' ? (
          <>
            {/* ── Customer / Header ──────────────────────────────────────── */}
            <div className="border-b border-outline-variant/10 relative">
              <div className="p-4 flex justify-between items-center bg-surface-container-lowest">
                {!deliveryDetails.name ? (
                  <div className="flex items-center gap-3 w-full relative">
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={handleOpenClientList}
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

                    {/* Client search dropdown */}
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
                              <div className="text-xs text-on-surface-variant">{client.phone}</div>
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
                    <button
                      onClick={() => setDeliveryDetails({ name: '', phone: '', zone: '', address: '' })}
                      className="text-on-surface-variant hover:text-[#d32f2f] transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#d32f2f]/10"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={onClose}
                  className="lg:hidden ml-2 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            {/* ── Item list ──────────────────────────────────────────────── */}
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

            {/* ── Footer: order type + pay button ────────────────────────── */}
            <div className="p-4 bg-surface-container-low border-t border-outline-variant/20">
              <div className="mb-3">
                <div className="grid grid-cols-3 gap-2">
                  {(['dine_in', 'takeaway', 'delivery'] as const).map((type) => {
                    const labels: Record<string, { icon: string; label: string }> = {
                      dine_in:  { icon: 'restaurant',      label: 'Dine in'  },
                      takeaway: { icon: 'takeout_dining',  label: 'Takeaway' },
                      delivery: { icon: 'local_shipping',  label: 'Delivery' },
                    };
                    return (
                      <button
                        key={type}
                        onClick={() => setOrderType(type)}
                        className={`py-2 px-2 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${
                          orderType === type
                            ? 'bg-primary text-on-primary shadow-md'
                            : 'bg-surface-container border border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{labels[type].icon}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider">{labels[type].label}</span>
                      </button>
                    );
                  })}
                </div>
                {orderType === 'delivery' && (
                  <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <input
                      type="text"
                      placeholder="Adresse de livraison"
                      className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                      value={deliveryDetails.address || ''}
                      onChange={(e) => setDeliveryDetails({ ...deliveryDetails, address: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <button
                onClick={() => { if (cart.length > 0) setViewMode('receipt'); }}
                className="w-full py-3 bg-[#8bc34a] text-white rounded-lg font-headline font-extrabold text-lg hover:bg-[#7cb342] transition-colors shadow-lg flex items-center justify-between px-5"
              >
                <div className="flex flex-col items-start">
                  <span>Payer</span>
                  <span className="text-xs font-medium opacity-90">{cart.length} articles</span>
                </div>
                <span className="text-xl">{formatCurrency(subtotal)}</span>
              </button>
            </div>
          </>
        ) : (
          /* ── Receipt View ──────────────────────────────────────────────────── */
          <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300 bg-[#1a1d21]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#22252a]">
              <div className="flex items-center gap-3">
                <button onClick={() => setViewMode('cart')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-colors">
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h2 className="font-headline font-bold text-sm uppercase tracking-widest text-white">Receipt Preview</h2>
              </div>
              <button onClick={handlePrint} className="flex items-center gap-2 text-[#8bc34a] hover:text-[#7cb342] font-bold text-xs tracking-wider transition-colors">
                <span className="material-symbols-outlined text-[16px]">print</span>
                PRINT
              </button>
            </div>

            {/* Paper receipt */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#1a1d21] flex flex-col items-center">
              <div id="receipt-content" className="w-full max-w-[320px] bg-white text-black pt-8 px-6 pb-6 relative shadow-2xl font-mono">
                <div className="text-center mb-6">
                  <h3 className="font-bold text-xl mb-1">{branding?.restaurantName || 'ZEN OMAKASE'}</h3>
                  {(branding?.address || '').split('\n').filter(Boolean).map((line, i) => (
                    <p key={i} className="text-xs text-gray-500">{line}</p>
                  ))}
                  {branding?.phone && <p className="text-xs text-gray-500">{branding.phone}</p>}
                </div>
                <div className="border-b border-dashed border-gray-300 pb-3 mb-4 flex justify-between text-[10px] text-gray-500 uppercase">
                  <span>Date: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span>Order: {createdOrderNumber ?? '—'}</span>
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
                        <span>{formatCurrency((item.price + Object.values(item.selectedVariations || {}).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0) - (item.discount || 0)) * item.quantity)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.quantity > 1 ? `${item.quantity}x @ ${formatCurrency(item.price + Object.values(item.selectedVariations || {}).reduce((sum: number, opt: any) => sum + (opt.priceAdjustment || 0), 0) - (item.discount || 0))} ` : ''}
                        {item.selectedVariations && Object.values(item.selectedVariations).map((opt: any) => opt.name).join(', ')}
                        {item.notes && ` - ${item.notes}`}
                      </div>
                    </div>
                  ))}
                </div>
                {orderNote && (
                  <div className="border-t border-dashed border-gray-300 pt-3 mb-3 text-[10px] text-gray-600 uppercase tracking-wider">
                    <span className="font-bold">Note:</span> {orderNote}
                  </div>
                )}
                <div className="border-t border-dashed border-gray-300 pt-3 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  {taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>Tax ({localization.taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
                  <div className="flex justify-between text-gray-600"><span>Gratuity (20%)</span><span>{formatCurrency(gratuityAmount)}</span></div>
                  <div className="flex justify-between text-lg font-bold mt-3 pt-3 border-t border-dashed border-gray-300">
                    <span>TOTAL</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
                {/* Jagged receipt edge */}
                <div className="absolute -bottom-2 left-0 w-full h-2" style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='16' height='8' viewBox='0 0 16 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h16L8 8z' fill='%23ffffff'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat-x'
                }} />
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-4 bg-[#22252a] border-t border-white/10 space-y-3">
              <button
                onClick={(e) => setPaymentMenuRect(e.currentTarget.getBoundingClientRect())}
                className="w-full py-3 bg-[#8bc34a] text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#7cb342] transition-colors shadow-md"
              >
                <span className="material-symbols-outlined">payments</span>
                Process Payment
              </button>
              <button
                onClick={() => handleCreateOrder('Unpaid')}
                className="w-full py-3 bg-secondary text-on-secondary rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-secondary/90 transition-colors shadow-md"
              >
                <span className="material-symbols-outlined">restaurant</span>
                Send to Kitchen
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleCreateOrder('Unpaid', 'Draft')}
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

      {/* ── New Order 3D-touch menu ──────────────────────────────────────────── */}
      <AnimatePresence>
        {newOrderMenuRect && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[65] bg-black/20 backdrop-blur-sm" onClick={() => setNewOrderMenuRect(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className="fixed z-[100] bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-2xl overflow-hidden min-w-[200px]"
              style={{ top: newOrderMenuRect.bottom + 8, left: newOrderMenuRect.left - 160 }}
            >
              <div className="flex flex-col py-2">
                <button onClick={() => setNewOrderMenuRect(null)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-left w-full">
                  <span className="material-symbols-outlined text-primary">save</span>
                  <span className="font-medium text-on-surface">Save Draft</span>
                </button>
                <div className="h-px bg-outline-variant/20 my-1" />
                <button
                  onClick={() => { if (onClearCart) onClearCart(); setNewOrderMenuRect(null); }}
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

      {/* ── Payment numpad ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {paymentMenuRect && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-md" onClick={() => setPaymentMenuRect(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-[100] bg-[#1a1d21] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-80 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <div className="p-4 bg-[#22252a] border-b border-white/10 flex justify-between items-center">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Payment</h3>
                <div className="text-[#8bc34a] font-mono font-bold text-lg">{formatCurrency(total)}</div>
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
                  <div className="text-xl text-[#8bc34a] font-mono font-bold">{formatCurrency(change)}</div>
                </div>
                <button
                  onClick={async () => {
                    const paid = parseFloat(amountPaid);
                    if (isNaN(paid) || paid < total) {
                      setToast({ message: `Amount paid (${formatCurrency(paid || 0)}) is less than total due (${formatCurrency(total)})`, type: 'error' });
                      setTimeout(() => setToast(null), 3000);
                      return;
                    }
                    setPaymentMenuRect(null);
                    await handleCreateOrder('Paid');
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

      {/* ── Order note pop-over ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {noteMenuRect && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-md" onClick={() => setNoteMenuRect(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed z-[100] bg-[#1a1d21] border border-white/10 rounded-2xl shadow-2xl overflow-hidden w-80"
              style={{ bottom: window.innerHeight - noteMenuRect.top + 16, right: window.innerWidth - noteMenuRect.right }}
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

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-[100] px-6 py-3 bg-surface-container-highest border border-outline-variant/20 rounded-full shadow-2xl flex items-center gap-3 min-w-[300px]"
          >
            <div className={toast.type === 'success' ? 'text-[#8bc34a]' : 'text-error'}>
              <span className="material-symbols-outlined">{toast.type === 'success' ? 'check_circle' : 'error'}</span>
            </div>
            <span className="text-on-surface font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Client List Modal ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isClientListModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsClientListModalOpen(false)} />
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
              <div className="px-4 pt-4">
                <div className="flex items-center gap-2 bg-surface-container rounded-lg px-3 py-2 border border-outline-variant/20">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
                  <input
                    type="text"
                    placeholder="Search by name or phone…"
                    value={clientModalSearch}
                    onChange={e => setClientModalSearch(e.target.value)}
                    className="flex-1 bg-transparent border-none focus:outline-none text-sm text-on-surface"
                  />
                  {clientModalSearch && (
                    <button onClick={() => setClientModalSearch('')} className="text-on-surface-variant hover:text-on-surface">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-y-auto p-4 flex-1">
                {apiClients.length === 0 ? (
                  <div className="text-center py-8 text-on-surface-variant text-sm">No clients yet.</div>
                ) : (
                  <div className="grid gap-3">
                    {apiClients
                      .filter(c => {
                        const s = clientModalSearch.toLowerCase();
                        return !s || c.name.toLowerCase().includes(s) || c.phone.includes(s);
                      })
                      .map(client => (
                        <div
                          key={client.id}
                          onClick={() => { handleSelectClient(client); setIsClientListModalOpen(false); }}
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
                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <div className="bg-surface-variant/50 px-2 py-1 rounded-lg text-[10px] font-medium text-on-surface-variant flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[12px]">shopping_bag</span>
                              {client.orderCount} orders
                            </div>
                            <button
                              onClick={(e) => handleViewHistory(e, client.id)}
                              className="p-1.5 rounded-lg bg-surface-variant/30 hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors"
                              title="View order history"
                            >
                              <span className="material-symbols-outlined text-[16px]">history</span>
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Customer order history modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {historyCustomer && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setHistoryCustomer(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
                <div>
                  <h3 className="font-headline text-lg font-bold">{historyCustomer.name}</h3>
                  <p className="text-xs text-on-surface-variant">
                    {historyCustomer.phone} · {historyCustomer.orderCount} orders · {formatCurrency(historyCustomer.totalSpent)}
                  </p>
                </div>
                <button onClick={() => setHistoryCustomer(null)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-2">
                {historyCustomer.orders.length === 0 ? (
                  <p className="text-center text-sm text-on-surface-variant py-6">No orders yet.</p>
                ) : historyCustomer.orders.map(o => (
                  <div key={o.id} className="bg-surface-container rounded-xl p-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm">{o.orderNumber}</div>
                      <div className="text-xs text-on-surface-variant">
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'} · {o.itemsCount} items · {o.orderType.replace('_', '-')}
                      </div>
                      {o.review && (
                        <div className="flex items-center gap-0.5 mt-1">
                          {[1, 2, 3, 4, 5].map(s => (
                            <span key={s} className={`material-symbols-outlined text-[12px] ${s <= o.review!.stars ? 'text-yellow-400' : 'text-on-surface-variant/30'}`}>star</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">{formatCurrency(o.total)}</div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${o.status === 'Done' ? 'bg-green-500/10 text-green-400' : o.status === 'Cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-surface-variant text-on-surface-variant'}`}>
                        {o.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delivery Details Modal ───────────────────────────────────────────── */}
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
                <input type="text" value={deliveryDetails.name} onChange={(e) => setDeliveryDetails({ ...deliveryDetails, name: e.target.value })} className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Enter customer name" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Phone Number</label>
                <input type="tel" value={deliveryDetails.phone} onChange={(e) => setDeliveryDetails({ ...deliveryDetails, phone: e.target.value })} className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Enter phone number" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">Delivery Zone</label>
                <select value={deliveryDetails.zone} onChange={(e) => setDeliveryDetails({ ...deliveryDetails, zone: e.target.value })} className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none">
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
              <button onClick={() => setIsDeliveryModalOpen(false)} className="px-5 py-2.5 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
              <button onClick={() => setIsDeliveryModalOpen(false)} className="px-5 py-2.5 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-md">Save Details</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt Modal (after paid checkout) ─────────────────────────────── */}
      <AnimatePresence>
        {receiptModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
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
                  <div className="w-8 h-8 bg-[#8bc34a]/20 rounded-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#8bc34a] text-[18px]">check_circle</span>
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">Payment Confirmed</h3>
                    <p className="text-gray-400 text-[10px] uppercase tracking-wider">{receiptModal.orderNumber}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setReceiptModal(null); setPrintReady(false); fullReset(); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Receipt paper */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center bg-[#1a1d21]">
                <div id="zen-receipt-print" className="w-full max-w-[300px] bg-white text-black pt-6 px-5 pb-6 relative shadow-xl font-mono">
                  <div className="text-center mb-4">
                    <h3 className="font-bold text-lg mb-0.5">{branding?.restaurantName || 'ZEN OMAKASE'}</h3>
                    {(branding?.address || '').split('\n').filter(Boolean).map((line, i) => (
                      <p key={i} className="text-[9px] text-gray-500">{line}</p>
                    ))}
                    {branding?.phone && <p className="text-[9px] text-gray-500">{branding.phone}</p>}
                    {branding?.email && <p className="text-[9px] text-gray-500">{branding.email}</p>}
                  </div>
                  <div className="border-b border-dashed border-gray-300 pb-2 mb-3 flex justify-between text-[9px] text-gray-500 uppercase">
                    <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span>Order: {receiptModal.orderNumber}</span>
                  </div>
                  {(deliveryDetails.name || deliveryDetails.phone || deliveryDetails.address) && (
                    <div className="mb-3 text-[9px] uppercase tracking-wider border-b border-dashed border-gray-200 pb-2">
                      {deliveryDetails.name && <div><span className="font-bold">Name:</span> {deliveryDetails.name}</div>}
                      {deliveryDetails.phone && <div><span className="font-bold">Phone:</span> {deliveryDetails.phone}</div>}
                      {deliveryDetails.address && <div><span className="font-bold">Addr:</span> {deliveryDetails.address}</div>}
                    </div>
                  )}
                  <div className="space-y-2 mb-3">
                    {cart.map(item => (
                      <div key={item.cartItemId} className="text-[11px]">
                        <div className="flex justify-between font-bold">
                          <span>{item.name}</span>
                          <span>{formatCurrency((item.price + Object.values(item.selectedVariations || {}).reduce((s: number, o: any) => s + (o.priceAdjustment || 0), 0) - (item.discount || 0)) * item.quantity)}</span>
                        </div>
                        {(item.quantity > 1 || Object.keys(item.selectedVariations || {}).length > 0 || item.notes) && (
                          <div className="text-[9px] text-gray-500">
                            {item.quantity > 1 && `${item.quantity}× `}
                            {Object.values(item.selectedVariations || {}).map((o: any) => o.name).join(', ')}
                            {item.notes && ` — ${item.notes}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {orderNote && (
                    <div className="border-t border-dashed border-gray-300 pt-2 mb-2 text-[9px] text-gray-600 uppercase">
                      <span className="font-bold">Note:</span> {orderNote}
                    </div>
                  )}
                  <div className="border-t border-dashed border-gray-300 pt-2 space-y-1 text-[11px]">
                    <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                    {taxAmount > 0 && <div className="flex justify-between text-gray-600"><span>Tax ({localization.taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>}
                    <div className="flex justify-between text-gray-600"><span>Gratuity (20%)</span><span>{formatCurrency(gratuityAmount)}</span></div>
                    <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-dashed border-gray-300">
                      <span>TOTAL</span><span>{formatCurrency(total)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600"><span>Cash Paid</span><span>{formatCurrency(receiptModal.paidAmount)}</span></div>
                    <div className="flex justify-between font-bold text-[#16a34a]">
                      <span>Change</span><span>{formatCurrency(Math.max(0, receiptModal.paidAmount - total))}</span>
                    </div>
                  </div>
                  <div className="text-center mt-4 text-[9px] text-gray-400 italic">{branding?.footerText || 'Thank you for dining with us!'}</div>
                </div>
              </div>

              {/* Print button */}
              <div className="p-4 bg-[#22252a] border-t border-white/10">
                <button
                  onClick={printReady ? handlePrintReceipt : undefined}
                  disabled={!printReady}
                  className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    printReady
                      ? 'bg-[#8bc34a] text-white hover:bg-[#7cb342] shadow-lg cursor-pointer'
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
    </>
  );
};
