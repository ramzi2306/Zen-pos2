import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator } from 'lucide-react';
import { Order } from '../../data';
import type { Location } from '../../api/locations';
import { useLocalization } from '../../context/LocalizationContext';

// ─── CloseRegisterModal ────────────────────────────────────────────────────────
/**
 * CloseRegisterModal — full-screen end-of-shift reconciliation screen.
 * Lets the cashier count actual cash/card amounts and compare to expected sales.
 *
 * @prop isOpen        - Controls visibility
 * @prop onClose       - Called when the user cancels
 * @prop expectedSales - System-calculated total for the shift
 * @prop onConfirm     - Called on "Close Register" confirm; defaults to onClose
 */
interface CloseRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionOrders: Order[];
  onConfirm?: (reportData: { actualSales: number, expectedSales: number, difference: number, notes: string }) => void;
  cashierName?: string;
  locationName?: string;
}

const CloseRegisterModal = ({ isOpen, onClose, sessionOrders, onConfirm, cashierName = 'Cashier', locationName = 'POS' }: CloseRegisterModalProps) => {
  const { formatCurrency } = useLocalization();
  const [actualAmounts, setActualAmounts] = useState<Record<string, string>>({
    'Cash': '',
    'Credit Card': '',
    'Other': '',
  });
  const [notes, setNotes] = useState('');
  const [activeNumpadMethod, setActiveNumpadMethod] = useState<string | null>(null);
  const [numpadPosition, setNumpadPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  // Relaxed: Sales should include ALL paid orders, even if not yet "Done" or "Served"
  const paidOrders = sessionOrders.filter(o => o.paymentStatus?.toLowerCase() === 'paid');

  const cashOrders   = paidOrders.filter(o => (!o.paymentMethod || o.paymentMethod === 'Cash'));
  const cardOrders   = paidOrders.filter(o => o.paymentMethod === 'Credit Card');
  const otherOrders  = paidOrders.filter(o => o.paymentMethod === 'Other');

  const expectedCash  = cashOrders.reduce((sum, o) => sum + o.total, 0);
  const expectedCard  = cardOrders.reduce((sum, o) => sum + o.total, 0);
  const expectedOther = otherOrders.reduce((sum, o) => sum + o.total, 0);

  const paymentMethods = [
    { name: 'Cash',        ordersCount: cashOrders.length,  total: expectedCash,  refunds: 0 },
    { name: 'Credit Card', ordersCount: cardOrders.length,  total: expectedCard,  refunds: 0 },
    { name: 'Other',       ordersCount: otherOrders.length, total: expectedOther, refunds: 0 },
  ];

  const expectedSales = expectedCash + expectedCard + expectedOther;

  let totalActual = 0;
  (Object.values(actualAmounts) as string[]).forEach(val => {
    totalActual += parseFloat(val) || 0;
  });

  const handleActualChange = (method: string, value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setActualAmounts(prev => ({ ...prev, [method]: value }));
    }
  };

  const handlePrintReport = () => {
    const openedAt = parseInt(sessionStorage.getItem('sessionOpenedAt') || '0');
    const openedLabel = openedAt
      ? new Date(openedAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Unknown';
    const closedLabel = new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const rows = paymentMethods.map(pm => {
      const actual = parseFloat(actualAmounts[pm.name]) || 0;
      const diff = actual - pm.total;
      return `<tr>
        <td>${pm.name}</td><td>${pm.ordersCount}</td>
        <td>${formatCurrency(pm.total)}</td>
        <td>${actual ? formatCurrency(actual) : '—'}</td>
        <td style="color:${diff > 0 ? 'green' : diff < 0 ? 'red' : 'inherit'}">${diff !== 0 ? (diff > 0 ? '+' : '') + formatCurrency(diff) : '—'}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>body{font-family:monospace;padding:24px;color:#000}h2{margin:0 0 4px}p{margin:2px 0;font-size:13px;color:#555}
      table{width:100%;border-collapse:collapse;margin-top:16px}th{text-align:left;padding:6px 8px;border-bottom:2px solid #000;font-size:11px;text-transform:uppercase}
      td{padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px}.total{font-weight:bold;font-size:15px;margin-top:12px;text-align:right}
      .notes{margin-top:12px;font-size:12px;color:#555;border-top:1px dashed #ccc;padding-top:8px}</style>
    </head><body>
      <h2>Register Closure Report</h2>
      <p>Cashier: <strong>${cashierName}</strong></p>
      <p>Location: ${locationName}</p>
      <p>Opened: ${openedLabel}</p>
      <p>Closed: ${closedLabel}</p>
      <table><thead><tr><th>Method</th><th>Orders</th><th>Expected</th><th>Counted</th><th>Difference</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="total">Total in register: ${formatCurrency(totalActual)} / Expected: ${formatCurrency(expectedSales)}</div>
      ${notes ? `<div class="notes">Notes: ${notes}</div>` : ''}
    </body><script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);};<\/script></html>`;
    const win = window.open('', '_blank', 'width=600,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
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
            {(() => {
              const openedAt = parseInt(sessionStorage.getItem('sessionOpenedAt') || '0');
              const openedDate = openedAt ? new Date(openedAt) : null;
              const hoursAgo = openedAt ? Math.floor((Date.now() - openedAt) / 3600000) : null;
              const openedLabel = openedDate
                ? openedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase() + ' AT ' + openedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                : 'Unknown';
              return (
                <div className="flex items-center justify-between border-b border-white/5 px-8 py-2.5 bg-white/[0.01]">
                  <div className="flex items-center gap-12">
                    <div className="flex items-center gap-2">
                      <p className="text-[9px] uppercase font-bold text-white/30 tracking-widest">POS:</p>
                      <p className="text-sm font-bold text-white/60">{locationName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[9px] uppercase font-bold text-white/30 tracking-widest">CASHIER:</p>
                      <p className="text-sm font-bold text-[#d84315]">{cashierName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] uppercase font-bold text-white/30 tracking-widest">OPENED:</p>
                    <p className="text-sm font-bold text-white/60">
                      {openedLabel}
                      {hoursAgo !== null && <span className="text-white/30 ml-2 font-medium">({hoursAgo}h ago)</span>}
                    </p>
                  </div>
                </div>
              );
            })()}

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
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">{formatCurrency(pm.total)}</div>
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">{pm.refunds === 0 ? '—' : formatCurrency(pm.refunds)}</div>
                    <div className="p-6 text-sm font-bold text-white/80 border-r border-white/5 flex items-center justify-center">{formatCurrency(expected)}</div>
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
                      {diff === 0 ? formatCurrency(0) : (diff > 0 ? '+' : '-') + formatCurrency(Math.abs(diff))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Footer */}
            <div className="bg-[#1a1d21] border-b border-white/10 p-3 flex justify-end items-center pr-8">
              <span className="text-xs text-white/40 font-medium">1-{paymentMethods.length} of {paymentMethods.length}</span>
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
                    {formatCurrency(totalActual)}
                  </p>
                  {totalActual !== expectedSales && expectedSales > 0 && (
                    <p className={`text-[9px] font-bold mt-1 uppercase tracking-widest ${totalActual > expectedSales ? 'text-tertiary' : 'text-secondary'}`}>
                      GLOBAL DIFFERENCE: {totalActual > expectedSales ? '+' : '-'}{formatCurrency(Math.abs(totalActual - expectedSales))}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-[#22252a] border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <button onClick={handlePrintReport} className="flex items-center gap-3 text-sm font-bold text-[#d84315] hover:underline uppercase tracking-widest">
                  <span className="material-symbols-outlined text-2xl">print</span>
                  Print Report
                </button>
              </div>
              <div className="flex gap-6">
                <button onClick={onClose} className="px-8 py-4 text-sm font-bold text-white/40 hover:text-white/60 transition-colors uppercase tracking-widest">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (onConfirm) {
                      onConfirm({ actualSales: totalActual, expectedSales, difference: totalActual - expectedSales, notes });
                    } else {
                      onClose();
                    }
                  }}
                  className="px-12 py-4 bg-[#d84315] text-white rounded-lg text-sm font-bold uppercase tracking-widest hover:bg-[#bf360c] transition-all shadow-lg shadow-[#d84315]/20"
                >
                  Close Register
                </button>
              </div>
            </div>

            {/* 3D-Touch Numpad Overlay */}
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
                    animate={{ opacity: 1, y: 0 }}
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

// ─── ProfilePanel ──────────────────────────────────────────────────────────────
/**
 * ProfilePanel — right-side slide-in panel showing the current cashier's info,
 * session stats (orders, sales), and navigation shortcuts.
 *
 * Also houses the CloseRegisterModal trigger for end-of-shift reconciliation.
 *
 * @prop isOpen           - Controls panel visibility
 * @prop onClose          - Called when the backdrop or close button is pressed
 * @prop setCurrentView   - Navigate to a top-level view (e.g. 'pos_settings')
 * @prop setCurrentSetting- Navigate within a settings section
 * @prop isLoggedIn       - Whether an admin is currently logged in
 * @prop currentUser      - Logged-in user object (name, email, role, image)
 * @prop onLogout         - Logout callback
 * @prop hasPermission    - Permission guard helper
 * @prop orders           - All current session orders (used to calculate sales)
 */
export const ProfilePanel = ({
  isOpen,
  onClose,
  setCurrentView,
  setCurrentSetting,
  isLoggedIn,
  currentUser,
  onLogout,
  onCloseRegister,
  onCloseRegisterBlocked,
  hasPermission,
  orders = [],
  locations = [],
  activeLocationId,
  setActiveLocationId,
  restaurantName,
}: {
  isOpen: boolean;
  onClose: () => void;
  setCurrentView: (v: string) => void;
  setCurrentSetting: (s: string) => void;
  isLoggedIn: boolean;
  currentUser: any;
  onLogout: () => void;
  /** Called after the cashier confirms "Close Register" — handles checkout + navigation */
  onCloseRegister?: (reportData: { actualSales: number, expectedSales: number, difference: number, notes: string }) => void;
  /** Called when the cashier tries to close the register but active orders exist */
  onCloseRegisterBlocked?: () => void;
  hasPermission: (p: any) => boolean;
  orders?: Order[];
  locations?: Location[];
  activeLocationId?: string | null;
  setActiveLocationId?: (id: string | null) => void;
  restaurantName?: string;
}) => {
  const { formatCurrency } = useLocalization();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  
  const openedAt = parseInt(sessionStorage.getItem('sessionOpenedAt') || '0');
  // Add a 5-minute grace period (300000ms) to account for client/server clock skew
  const shiftStart = openedAt > 0 ? openedAt - 300000 : 0;

  const sessionOrders = shiftStart > 0 ? orders.filter(o => {
    const t = o.queueStartTime || (o.createdAt ? new Date(o.createdAt).getTime() : 0);
    return t >= shiftStart;
  }) : orders;

  const totalSales = sessionOrders
    .filter(o => o.paymentStatus?.toLowerCase() === 'paid' && o.status !== 'Cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);
  const totalOrders = orders.filter(o => o.status !== 'Cancelled').length;

  const canSwitchLocation = !currentUser?.locationId && locations.length > 0 && !!setActiveLocationId;

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
              <motion.div
                animate={isLocationPickerOpen
                  ? { scale: 1.03, boxShadow: '0 20px 50px rgba(0,0,0,0.5)', zIndex: 10 }
                  : { scale: 1, boxShadow: '0 0px 0px rgba(0,0,0,0)', zIndex: 0 }
                }
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="bg-[#d84315] p-4 flex items-center justify-between relative"
              >
                <button
                  className="flex items-center gap-4 text-left"
                  onClick={() => canSwitchLocation && setIsLocationPickerOpen(v => !v)}
                  style={{ cursor: canSwitchLocation ? 'pointer' : 'default' }}
                >
                  <span className="material-symbols-outlined text-2xl">storefront</span>
                  <div>
                    <p className="text-[10px] uppercase font-bold opacity-80 leading-none mb-1">Point of Sale</p>
                    {(() => {
                      const activeLoc = activeLocationId ? locations.find(l => l.id === activeLocationId) : null;
                      const name = currentUser?.locationName || activeLoc?.name || restaurantName || 'All Locations';
                      const sub = activeLoc?.subtitle || null;
                      return (
                        <>
                          <p className="text-lg font-bold leading-none">{name}</p>
                          {sub && <p className="text-[10px] opacity-70 mt-0.5">{sub}</p>}
                        </>
                      );
                    })()}
                  </div>
                </button>
                {canSwitchLocation && (
                  <button
                    onClick={() => setIsLocationPickerOpen(v => !v)}
                    title="Switch location"
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
                  >
                    <motion.span
                      animate={{ rotate: isLocationPickerOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="material-symbols-outlined"
                    >swap_horiz</motion.span>
                  </button>
                )}

                {/* Location picker dropdown */}
                <AnimatePresence>
                  {isLocationPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ type: 'spring', damping: 22, stiffness: 350 }}
                      className="absolute top-full left-0 right-0 bg-[#c03912] shadow-2xl z-20 overflow-hidden"
                    >
                      <button
                        onClick={() => { setActiveLocationId!(null); setIsLocationPickerOpen(false); }}
                        className={`w-full px-5 py-3.5 flex items-center gap-3 text-left transition-colors ${
                          !activeLocationId ? 'bg-black/20' : 'hover:bg-black/10'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm opacity-70">public</span>
                        <span className="text-sm font-bold">All Locations</span>
                        {!activeLocationId && <span className="material-symbols-outlined text-sm ml-auto">check</span>}
                      </button>
                      {locations.map(loc => (
                        <button
                          key={loc.id}
                          onClick={() => { setActiveLocationId!(loc.id); setIsLocationPickerOpen(false); }}
                          className={`w-full px-5 py-3.5 flex items-center gap-3 text-left transition-colors border-t border-white/10 ${
                            activeLocationId === loc.id ? 'bg-black/20' : 'hover:bg-black/10'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm opacity-70">location_on</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{loc.name}</p>
                            {loc.subtitle && <p className="text-[10px] opacity-60 truncate">{loc.subtitle}</p>}
                          </div>
                          {activeLocationId === loc.id && <span className="material-symbols-outlined text-sm">check</span>}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* User Info */}
              <div className="p-6 bg-[#4a4d4f] flex items-center gap-4" onClick={() => setIsLocationPickerOpen(false)}>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center overflow-hidden border border-white/10 flex-shrink-0">
                  {currentUser?.image ? (
                    <img src={currentUser.image} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-3xl opacity-50">person</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold leading-none mb-1 truncate">{currentUser?.name || 'Guest'}</p>
                  <p className="text-xs opacity-60 truncate">{currentUser?.email || 'No email'}</p>
                  <p className="text-[10px] uppercase font-bold text-secondary mt-1 tracking-widest">{currentUser?.role || 'No Role'}</p>
                </div>
                {hasPermission('view_settings') && (
                  <button
                    onClick={() => { setCurrentView('pos_settings'); setCurrentSetting('profile'); onClose(); }}
                    title="Edit profile"
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/80"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Stats Grid */}
              <div className="grid grid-cols-2 border-t border-white/10">
                <div className="p-6 border-r border-white/10">
                  <p className="text-[10px] uppercase font-bold opacity-40 mb-2">Orders</p>
                  <p className="text-xl font-bold">{totalOrders}</p>
                </div>
                <div className="p-6">
                  <p className="text-[10px] uppercase font-bold opacity-40 mb-2">Open</p>
                  {(() => {
                    const openedAt = parseInt(sessionStorage.getItem('sessionOpenedAt') || '0');
                    if (!openedAt) return <p className="text-sm font-bold opacity-60">—</p>;
                    const h = Math.floor((Date.now() - openedAt) / 3600000);
                    const m = Math.floor(((Date.now() - openedAt) % 3600000) / 60000);
                    return <p className="text-sm font-bold">{h > 0 ? `${h}h ` : ''}{m}m ago</p>;
                  })()}
                </div>
              </div>

              {/* Sales & Close Registry */}
              <div className="p-6 bg-[#4a4d4f] flex items-center justify-between border-t border-white/10">
                <div>
                  <p className="text-[10px] uppercase font-bold opacity-40 mb-2">Sales</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
                </div>
                <button
                  onClick={() => {
                    const activeOrders = sessionOrders.filter(
                      o => !['Done', 'Cancelled', 'Served'].includes(o.status)
                    );
                    if (activeOrders.length > 0) {
                      onClose();
                      onCloseRegisterBlocked?.();
                      return;
                    }
                    setIsCloseModalOpen(true);
                  }}
                  className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-3xl opacity-60">logout</span>
                </button>
              </div>

              {/* Footer Buttons */}
              <div className="p-4 space-y-3 bg-[#3c3f41] border-t border-white/10">
                {hasPermission('view_attendance') && (
                  <button
                    onClick={() => { setCurrentView('attendance'); onClose(); }}
                    className="w-full py-3 bg-[#d84315]/10 hover:bg-[#d84315]/20 text-[#d84315] rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-[#d84315]/20 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">fingerprint</span>
                    Timeclock / Attendance
                  </button>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {hasPermission('view_settings') && (
                    <button
                      onClick={() => { setCurrentView('pos_settings'); onClose(); }}
                      className="py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10"
                    >
                      POS Settings
                    </button>
                  )}
                  {(hasPermission('view_staff') || hasPermission('view_hr')) && (
                    <button
                      onClick={() => { setCurrentView('admin_panel'); onClose(); }}
                      className="py-3 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-white/10"
                    >
                      Administration
                    </button>
                  )}
                </div>
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
        sessionOrders={sessionOrders}
        cashierName={currentUser?.name}
        locationName={(() => {
          if (currentUser?.locationName) return currentUser.locationName;
          const activeLoc = activeLocationId ? locations.find(l => l.id === activeLocationId) : null;
          return activeLoc?.name || restaurantName || 'All Locations';
        })()}
        onConfirm={(reportData) => {
          setIsCloseModalOpen(false);
          onClose();
          if (onCloseRegister) {
            onCloseRegister(reportData);
          } else {
            setCurrentView('attendance');
          }
        }}
      />
    </>
  );
};
