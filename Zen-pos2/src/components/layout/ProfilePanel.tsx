import React, { useState, useMemo, useEffect } from 'react';
import { showError } from '../../utils/toast';
import { motion, AnimatePresence } from 'motion/react';
import { Order, RegisterReport } from '../../data';
import type { Location } from '../../api/locations';
import { useLocalization } from '../../context/LocalizationContext';
import * as api from '../../api';
import { BrandingData } from '../../api/settings';

// ─── CloseRegisterModal ────────────────────────────────────────────────────────
/**
 * CloseRegisterModal — full-screen end-of-shift reconciliation screen.
 * Lets the cashier count actual cash/card amounts and compare to expected sales.
 */
interface CloseRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionOrders: Order[];
  onConfirm?: (reportData: Omit<RegisterReport, 'id'>) => void;
  cashierName?: string;
  locationName?: string;
  openedAt?: number;
  branding?: BrandingData;
  // Summary props from parent
  withdrawnCash: number;
  openingFloat: number;
  withdrawalsHistory: any[];
  fetchSessionSummary: () => Promise<void>;
}

const CloseRegisterModal = ({ 
  isOpen, onClose, sessionOrders, onConfirm, cashierName = 'Cashier', 
  locationName = 'POS', openedAt, branding,
  withdrawnCash, openingFloat, withdrawalsHistory, fetchSessionSummary
}: CloseRegisterModalProps) => {
  const { formatCurrency } = useLocalization();
  const [actualAmounts, setActualAmounts] = useState<Record<string, string>>({
    'Cash': '',
    'Credit Card': '',
    'Other': '',
  });
  const [fondDeCaisse, setFondDeCaisse] = useState('');
  const [notes, setNotes] = useState('');
  const [activeNumpadMethod, setActiveNumpadMethod] = useState<string | null>(null);
  const [numpadPosition, setNumpadPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    if (isOpen) {
      fetchSessionSummary();
    } else {
      // Reset local UI state when closed
      setActualAmounts({ 'Cash': '', 'Credit Card': '', 'Other': '' });
      setFondDeCaisse('');
      setNotes('');
    }
  }, [isOpen, fetchSessionSummary]);

  // Relaxed: Sales should include ALL paid orders, even if not yet "Done" or "Served"
  const paidOrders = sessionOrders.filter(o => o.paymentStatus?.toLowerCase() === 'paid' && o.status !== 'Cancelled');

  const cashOrders   = paidOrders.filter(o => (!o.paymentMethod || o.paymentMethod.toLowerCase() === 'cash'));
  const cardOrders   = paidOrders.filter(o => o.paymentMethod?.toLowerCase() === 'credit card');
  const otherOrders  = paidOrders.filter(o => o.paymentMethod?.toLowerCase() === 'other');

  const expectedCash  = cashOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const expectedCard  = cardOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const expectedOther = otherOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  // Cash expected should subtract withdrawn cash (already removed from register)
  const expectedCashNet = expectedCash - withdrawnCash;



  const paymentMethods = [
    { name: 'Cash',        ordersCount: cashOrders.length,  total: expectedCashNet,  refunds: 0 },
    { name: 'Credit Card', ordersCount: cardOrders.length,  total: expectedCard,     refunds: 0 },
    { name: 'Other',       ordersCount: otherOrders.length, total: expectedOther,    refunds: 0 },
  ];

  const totalSales = expectedCash + expectedCard + expectedOther;
  const salesNet = totalSales - withdrawnCash; // Net sales after withdrawals
  
  const currentFondDeCaisse = parseFloat(fondDeCaisse) || 0;
  const floatDifference = openingFloat - currentFondDeCaisse;
  const expectedSales = salesNet + floatDifference; // Adjusted for float change

  const totalCounted = (parseFloat(actualAmounts['Cash']) || 0) + (parseFloat(actualAmounts['Credit Card']) || 0) + (parseFloat(actualAmounts['Other']) || 0);
  const totalActual = totalCounted - withdrawnCash; // Net actual after withdrawals

  const handleActualChange = (method: string, value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setActualAmounts(prev => ({ ...prev, [method]: value }));
    }
  };

  const handlePrintReport = () => {
    const openedAtVal = openedAt || (() => {
      const v = sessionStorage.getItem('sessionOpenedAt');
      if (!v) return 0;
      const d = new Date(isNaN(Number(v)) ? v : Number(v));
      return isNaN(d.getTime()) ? 0 : d.getTime();
    })();

    import('../../utils/printRegisterReport').then(m => {
      const html = m.buildRegisterReportHtml({
        branding: branding || { restaurantName: 'ZenPOS' } as BrandingData,
        cashierName,
        locationName,
        openedAt: openedAtVal,
        closedAt: Date.now(),
        paymentMethods: paymentMethods.map(pm => ({
          ...pm,
          actual: parseFloat(actualAmounts[pm.name]) || 0,
          difference: (parseFloat(actualAmounts[pm.name]) || 0) - pm.total
        })),
        expectedSales,
        actualSales: totalActual,
        difference: totalActual - expectedSales,
        notes,
        openingFloat,
        fondDeCaisse: currentFondDeCaisse,
        withdrawnCash,
        withdrawals: withdrawalsHistory,
        formatCurrency
      });
      m.firePrint(html);
    });
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
              const openedAt = (() => {
                const v = sessionStorage.getItem('sessionOpenedAt');
                if (!v) return 0;
                const d = new Date(isNaN(Number(v)) ? v : Number(v));
                return isNaN(d.getTime()) ? 0 : d.getTime();
              })();
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
                    <div className="p-6 text-sm font-bold text-white/70 text-left pl-8 bg-white/[0.02] border-r border-white/5 flex items-center">
                      <span>{pm.name}</span>
                    </div>
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">{pm.ordersCount}</div>
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">{formatCurrency(pm.total)}</div>
                    <div className="p-6 text-sm text-white/60 border-r border-white/5 flex items-center justify-center">{pm.refunds === 0 ? '—' : formatCurrency(pm.refunds)}</div>
                    <div className="p-6 text-sm font-bold text-white/80 border-r border-white/5 flex items-center justify-center">{formatCurrency(expected)}</div>
                    <div className="p-4 border-r border-white/5 flex items-center justify-center">
                      <div className={`relative w-full max-w-[180px] transition-all duration-300 ${isActive ? 'z-[110]' : 'z-auto'}`}>
                        <div className="relative group p-1 rounded-2xl transition-all shadow-sm">
                          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-bold text-sm">$</div>
                          <input
                            type="text"
                            value={actualAmounts[pm.name] || ''}
                            onChange={(e) => handleActualChange(pm.name, e.target.value)}
                            onFocus={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setNumpadPosition({ top: rect.top, left: rect.left, width: rect.width });
                              setActiveNumpadMethod(pm.name);
                            }}
                            className="w-full bg-[#1a1d21] border border-white/10 rounded-lg py-2.5 text-center text-sm font-bold text-white focus:outline-none focus:border-[#d84315] transition-all"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>
                    <div className={`p-4 text-xs font-bold flex items-center justify-center ${diff === 0 ? 'text-white/20' : diff > 0 ? 'text-tertiary' : 'text-secondary'}`}>
                      {diff === 0 ? '—' : (diff > 0 ? '+' : '-') + formatCurrency(Math.abs(diff))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-[#22252a] border-b border-white/10 px-8 py-5 flex items-center justify-between">
              <div className="flex items-center gap-12">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#d84315]/10 flex items-center justify-center border border-[#d84315]/20">
                    <span className="material-symbols-outlined text-[#d84315] text-xl">account_balance_wallet</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white/80">Fond de Caisse (Opening)</p>
                    <p className="text-[10px] text-white/40 font-medium">Cash that was in the register at shift start</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-white/60">{formatCurrency(openingFloat)}</p>
                </div>

                <div className="flex items-center gap-4 border-l border-white/5 pl-12 ml-4">
                  <div>
                    <p className="text-sm font-bold text-white/80">Fond de Caisse (Closing)</p>
                    <p className="text-[10px] text-white/40 font-medium">Cash to leave for next shift</p>
                  </div>
                  <div className="relative w-[180px]">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#d84315]/50 font-bold text-lg">$</div>
                    <input
                      type="text"
                      value={fondDeCaisse}
                      onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) setFondDeCaisse(e.target.value); }}
                      placeholder="0.00"
                      className="w-full bg-[#1a1d21] border-2 border-[#d84315]/30 rounded-xl pl-10 pr-4 py-3 text-xl font-bold focus:outline-none focus:border-[#d84315] transition-all text-white placeholder:text-white/10"
                    />
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-[9px] uppercase font-bold text-white/30 tracking-widest mb-0.5">FLOAT ADJUSTMENT</p>
                <p className={`text-sm font-bold ${floatDifference === 0 ? 'text-white/40' : floatDifference > 0 ? 'text-tertiary' : 'text-secondary'}`}>
                  {floatDifference === 0 ? 'No change' : (floatDifference > 0 ? '+' : '-') + formatCurrency(Math.abs(floatDifference))}
                </p>
              </div>
            </div>

            {/* Notes & Total */}
            <div className="grid grid-cols-2 bg-[#1a1d21]">
              <div className="p-4 border-r border-white/10">
                <p className="text-[9px] uppercase font-bold text-white/40 mb-1.5 tracking-widest">CLOSING NOTES / COMMENTS</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about the shift or cash count..."
                  className="w-full h-20 p-3 bg-white/[0.02] border border-white/10 rounded-xl text-sm focus:outline-none transition-all resize-none placeholder:text-white/20 text-white focus:border-[#d84315]"
                />
              </div>
              <div className="p-4 flex flex-col justify-center items-end pr-10">
                <div className="text-right">
                  <div className="flex justify-end items-center gap-3 mb-2">
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-0.5">GROSS SALES</p>
                      <p className="text-sm font-bold text-white/50">{formatCurrency(totalSales)}</p>
                    </div>
                    <div className="text-white/20 font-bold text-lg">−</div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-secondary/70 uppercase tracking-widest mb-0.5">WITHDRAWN</p>
                      <p className="text-sm font-bold text-secondary/70">{formatCurrency(withdrawnCash)}</p>
                    </div>
                    <div className="text-white/20 font-bold text-lg">{floatDifference >= 0 ? '+' : '−'}</div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-0.5">FLOAT DIFF</p>
                      <p className="text-sm font-bold text-white/50">{formatCurrency(Math.abs(floatDifference))}</p>
                    </div>
                    <div className="text-white/20 font-bold text-lg">=</div>
                  </div>
                  <div className="border-t border-white/10 mt-1 pt-2">
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-0.5">TOTAL REGISTER SALES (EXPECTED)</p>
                    <p className="text-2xl font-headline font-extrabold text-white/60">{formatCurrency(expectedSales)}</p>
                  </div>
                  <div className="border-t border-white/10 mt-2 pt-2">
                    <p className="text-[9px] font-bold text-[#d84315] uppercase tracking-widest mb-0.5">TOTAL ACTUAL COUNTED (NET)</p>
                    <div className="flex items-center justify-end gap-2 text-white/40 text-[10px] font-medium mb-1">
                      <span>{formatCurrency(totalCounted)} Counted</span>
                      <span className="text-secondary">- {formatCurrency(withdrawnCash)} Withdrawn</span>
                    </div>
                    <p className="text-3xl font-headline font-extrabold text-white/80">{formatCurrency(totalActual)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-[#22252a] border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <button 
                  onClick={handlePrintReport} 
                  className="flex items-center gap-3 text-sm font-bold text-[#d84315] hover:underline uppercase tracking-widest"
                >
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
                      onConfirm({ 
                        actualSales: totalActual, 
                        expectedSales, 
                        difference: totalActual - expectedSales, 
                        notes,
                        openedAt: openedAt || Date.now(),
                        closedAt: Date.now(),
                        cashierName,
                        countedClosingFloat: parseFloat(fondDeCaisse) || 0,
                        openingFloat: openingFloat,
                        totalCashWithdrawn: withdrawnCash,
                        netCashCollected: totalSales,
                        discrepancy: totalActual - expectedSales,
                      });
                    } else {
                      onClose();
                    }
                  }}
                  className="px-12 py-4 bg-[#d84315] text-white rounded-lg text-sm font-bold uppercase tracking-widest transition-all shadow-lg shadow-[#d84315]/20 hover:bg-[#bf360c]"
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
  branding,
  sessionOpenedAt: sessionOpenedAtProp,
}: {
  isOpen: boolean;
  onClose: () => void;
  setCurrentView: (v: string) => void;
  setCurrentSetting: (s: string) => void;
  isLoggedIn: boolean;
  currentUser: any;
  onLogout: () => void;
  /** Called after the cashier confirms "Close Register" — handles checkout + navigation */
  onCloseRegister?: (reportData: Omit<RegisterReport, 'id'>) => void;
  /** Called when the cashier tries to close the register but active orders exist */
  onCloseRegisterBlocked?: () => void;
  hasPermission: (p: any) => boolean;
  orders?: Order[];
  locations?: Location[];
  activeLocationId?: string | null;
  setActiveLocationId?: (id: string | null) => void;
  branding?: BrandingData;
  sessionOpenedAt?: number | null;
}) => {
  const { formatCurrency } = useLocalization();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  // Register Session Summary State (Shared across modals)
  const [withdrawnCash, setWithdrawnCash] = useState(0);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [withdrawalsHistory, setWithdrawalsHistory] = useState<any[]>([]);

  const fetchSessionSummary = async () => {
    try {
      const summary = await api.register.getSessionFloatSummary();
      if (summary) {
        setWithdrawnCash(summary.total_cash_withdrawn);
        setOpeningFloat(summary.opening_float || 0);
        setWithdrawalsHistory(summary.withdrawals || []);
      }
    } catch (err) {
      console.error('Failed to fetch session summary', err);
    }
  };
  
  const openedAt = (() => {
    if (sessionOpenedAtProp != null) return sessionOpenedAtProp;
    const v = sessionStorage.getItem('sessionOpenedAt');
    if (!v) return new Date().setHours(0, 0, 0, 0);
    const d = new Date(isNaN(Number(v)) ? v : Number(v));
    return isNaN(d.getTime()) ? new Date().setHours(0, 0, 0, 0) : d.getTime();
  })();
  
  // Create a robust shift filter. 
  // If we have a session start time, use it with a very generous 1-hour grace period for clock skew.
  // If no session start is found, default to showing all orders from the current list (which are already filtered for 'today' in App.tsx).
  const sessionOrders = useMemo(() => {
    if (!openedAt) return orders;
    const shiftStart = openedAt - 3600000; // 1 hour grace period
    return orders.filter(o => {
      const t = o.queueStartTime || (o.createdAt ? new Date(o.createdAt.includes(' ') ? o.createdAt.replace(' ', 'T') : o.createdAt).getTime() : 0);
      return !isNaN(t) && t >= shiftStart;
    });
  }, [orders, openedAt]);

  const paidOrders = useMemo(() => 
    sessionOrders.filter(o => o.paymentStatus?.toLowerCase() === 'paid' && o.status !== 'Cancelled'),
    [sessionOrders]
  );

  const totalSales = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
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
                      const name = currentUser?.locationName || activeLoc?.name || branding?.restaurantName || 'All Locations';
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
                    const openedAt = (() => {
                      const v = sessionStorage.getItem('sessionOpenedAt');
                      if (!v) return 0;
                      const d = new Date(isNaN(Number(v)) ? v : Number(v));
                      return isNaN(d.getTime()) ? 0 : d.getTime();
                    })();
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
                {hasPermission('manage_withdrawals') && (
                  <button
                    onClick={() => setIsWithdrawModalOpen(true)}
                    className="w-full py-3 bg-secondary/10 hover:bg-secondary/20 text-secondary rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border border-secondary/20 flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">payments</span>
                    Withdraw Cash (Drop)
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
        sessionOrders={sessionOrders}
        cashierName={currentUser?.name}
        openedAt={openedAt}
        withdrawnCash={withdrawnCash}
        openingFloat={openingFloat}
        withdrawalsHistory={withdrawalsHistory}
        fetchSessionSummary={fetchSessionSummary}
        locationName={(() => {
          if (currentUser?.locationName) return currentUser.locationName;
          const activeLoc = activeLocationId ? locations.find(l => l.id === activeLocationId) : null;
          return activeLoc?.name || branding?.restaurantName || 'All Locations';
        })()}
        branding={branding}
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

      <WithdrawalModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        onRefresh={fetchSessionSummary}
        onConfirm={async (payload) => {
          try {
            await api.register.recordWithdrawal(payload);
            await fetchSessionSummary();
            setIsWithdrawModalOpen(false);
          } catch (err) {
            showError('Failed to record withdrawal. Please try again.');
          }
        }}
      />
    </>
  );
};

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-surface-container-highest rounded-3xl shadow-2xl w-full max-w-[320px] overflow-hidden border border-outline-variant/10 p-6 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto mb-4">
          <span className="material-symbols-outlined text-3xl">warning</span>
        </div>
        <h3 className="text-lg font-headline font-bold text-on-surface mb-2">{title}</h3>
        <p className="text-sm text-on-surface-variant mb-8">{message}</p>
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-surface-container rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-container-high transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 py-3 bg-error text-on-error rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-error/20 hover:opacity-90 transition-all"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
};

/**
 * WithdrawalModal — for mid-session drawer drops or petty cash
 */
type WithdrawCategory = 'other' | 'salary_advance' | 'purchase';

const WITHDRAW_CATEGORIES: { id: WithdrawCategory; label: string; icon: string; desc: string }[] = [
  { id: 'salary_advance', label: 'Salary Advance', icon: 'badge', desc: 'Advance on earned salary' },
  { id: 'purchase',       label: 'Purchase',       icon: 'shopping_cart', desc: 'Buy ingredient / supply' },
  { id: 'other',          label: 'Other',           icon: 'payments', desc: 'Petty cash / drawer drop' },
];

const WithdrawalModal = ({ isOpen, onClose, onRefresh, onConfirm }: {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onConfirm: (payload: import('../../api/register').WithdrawalPayload) => Promise<void>;
}) => {
  const [category, setCategory] = useState<WithdrawCategory>('other');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<import('../../api/register').WithdrawalItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // salary advance
  const [candidates, setCandidates] = useState<import('../../api/register').AdvanceCandidate[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<import('../../api/register').AdvanceCandidate | null>(null);

  // purchase
  const [ingredients, setIngredients] = useState<import('../../api/register').IngredientOption[]>([]);
  const [selectedIngredient, setSelectedIngredient] = useState<import('../../api/register').IngredientOption | null>(null);
  const [quantity, setQuantity] = useState('');
  const [vendor, setVendor] = useState('');

  const { formatCurrency } = useLocalization();

  const fetchHistory = async () => {
    try {
      const summary = await api.register.getSessionFloatSummary();
      if (summary?.withdrawals) setHistory(summary.withdrawals);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!isOpen) {
      setCategory('other'); setAmount(''); setNotes('');
      setSelectedEmployee(null); setSelectedIngredient(null);
      setQuantity(''); setVendor(''); setHistory([]);
      return;
    }
    fetchHistory();
    api.register.getAdvanceCandidates().then(setCandidates).catch(() => {});
    api.register.getIngredientOptions().then(setIngredients).catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = (() => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return false;
    if (category === 'salary_advance') return !!selectedEmployee;
    if (category === 'purchase') return !!selectedIngredient && parseFloat(quantity) > 0;
    return true;
  })();

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const payload: import('../../api/register').WithdrawalPayload = {
        amount: parseFloat(amount),
        notes: notes || undefined,
        category,
        ...(category === 'salary_advance' && selectedEmployee ? {
          employee_id: selectedEmployee.id,
          employee_name: selectedEmployee.name,
        } : {}),
        ...(category === 'purchase' && selectedIngredient ? {
          ingredient_id: selectedIngredient.id,
          ingredient_name: selectedIngredient.name,
          quantity: parseFloat(quantity),
          unit: selectedIngredient.unit,
          vendor: vendor || undefined,
        } : {}),
      };
      await onConfirm(payload);
      setAmount(''); setNotes(''); setQuantity(''); setVendor('');
      setSelectedEmployee(null); setSelectedIngredient(null);
      await fetchHistory();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteWithdrawal = async (id: string) => {
    try {
      await api.register.deleteWithdrawal(id);
      await fetchHistory();
      await onRefresh();
    } catch (err) {
      showError('Failed to delete withdrawal: ' + ((err as any)?.message || 'Unknown error'));
    }
  };

  const catMeta = WITHDRAW_CATEGORIES.find(c => c.id === category)!;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative bg-surface-container-lowest rounded-3xl shadow-3xl w-full max-w-md overflow-hidden border border-outline-variant/10">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--color-secondary) 12%, transparent)' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-secondary)' }}>{catMeta.icon}</span>
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold text-on-surface">Withdraw Cash</h3>
              <p className="text-[11px] text-on-surface-variant">{catMeta.desc}</p>
            </div>
            <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-sm text-on-surface-variant">close</span>
            </button>
          </div>

          {/* Category pills */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {WITHDRAW_CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-2xl border text-center transition-all"
                style={category === c.id
                  ? { background: 'color-mix(in srgb, var(--color-secondary) 15%, transparent)', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }
                  : { borderColor: 'color-mix(in srgb, var(--color-outline-variant) 40%, transparent)', color: 'var(--color-on-surface-variant)' }}>
                <span className="material-symbols-outlined text-base">{c.icon}</span>
                <span className="text-[9px] font-bold uppercase tracking-wider leading-none">{c.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {/* ── Salary Advance fields ── */}
            {category === 'salary_advance' && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Employee</label>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {candidates.length === 0 && <p className="text-xs text-on-surface-variant text-center py-3">No staff found</p>}
                  {candidates.map(c => (
                    <button key={c.id} onClick={() => setSelectedEmployee(c)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all"
                      style={selectedEmployee?.id === c.id
                        ? { background: 'color-mix(in srgb, var(--color-secondary) 12%, transparent)', borderColor: 'var(--color-secondary)' }
                        : { borderColor: 'color-mix(in srgb, var(--color-outline-variant) 30%, transparent)' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-bold text-on-surface-variant">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-on-surface">{c.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold" style={{ color: 'var(--color-tertiary)' }}>{formatCurrency(c.net_payable)}</p>
                        <p className="text-[9px] text-on-surface-variant">earned</p>
                      </div>
                    </button>
                  ))}
                </div>
                {selectedEmployee && (
                  <div className="mt-2 px-3 py-2 rounded-xl text-xs" style={{ background: 'color-mix(in srgb, var(--color-tertiary) 8%, transparent)' }}>
                    <span className="text-on-surface-variant">Balance: </span>
                    <span className="font-bold" style={{ color: 'var(--color-tertiary)' }}>{formatCurrency(selectedEmployee.net_payable)}</span>
                    <span className="text-on-surface-variant"> earned this period</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Purchase fields ── */}
            {category === 'purchase' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Ingredient</label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                    {ingredients.length === 0 && <p className="text-xs text-on-surface-variant text-center py-3">No ingredients found</p>}
                    {ingredients.map(ing => (
                      <button key={ing.id} onClick={() => setSelectedIngredient(ing)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all"
                        style={selectedIngredient?.id === ing.id
                          ? { background: 'color-mix(in srgb, var(--color-secondary) 12%, transparent)', borderColor: 'var(--color-secondary)' }
                          : { borderColor: 'color-mix(in srgb, var(--color-outline-variant) 30%, transparent)' }}>
                        <span className="text-sm font-medium text-on-surface">{ing.name}</span>
                        <div className="text-right">
                          <p className="text-xs text-on-surface-variant">{ing.in_stock} {ing.unit} in stock</p>
                          {ing.price_per_unit > 0 && <p className="text-[9px] text-on-surface-variant">{formatCurrency(ing.price_per_unit)}/{ing.unit}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Quantity {selectedIngredient && `(${selectedIngredient.unit})`}</label>
                    <input type="number" min="0" step="0.01" value={quantity} onChange={e => {
                      setQuantity(e.target.value);
                      if (selectedIngredient?.price_per_unit && parseFloat(e.target.value) > 0) {
                        setAmount(String(Math.round(parseFloat(e.target.value) * selectedIngredient.price_per_unit * 100) / 100));
                      }
                    }}
                      placeholder="0" className="w-full px-3 py-2.5 bg-surface-container rounded-xl text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary/50" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Vendor</label>
                    <input type="text" value={vendor} onChange={e => setVendor(e.target.value)}
                      placeholder="Optional" className="w-full px-3 py-2.5 bg-surface-container rounded-xl text-sm text-on-surface border border-outline-variant/20 focus:outline-none focus:border-secondary/50 placeholder:text-on-surface-variant/40" />
                  </div>
                </div>
              </>
            )}

            {/* Amount */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">
                {category === 'salary_advance' ? 'Advance Amount' : category === 'purchase' ? 'Total Cost' : 'Amount'}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold text-lg">$</span>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="0.00" autoFocus={category === 'other'}
                  className="w-full pl-10 pr-4 py-4 bg-surface-container rounded-2xl text-2xl font-bold focus:ring-2 outline-none transition-all placeholder:opacity-30"
                  style={{ color: 'var(--color-secondary)' }} />
              </div>
              {category === 'salary_advance' && selectedEmployee && parseFloat(amount) > selectedEmployee.net_payable && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-error, #ef4444)' }}>
                  Exceeds earned balance of {formatCurrency(selectedEmployee.net_payable)}
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Notes {category !== 'other' && <span className="normal-case font-normal">(optional)</span>}</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder={category === 'salary_advance' ? 'Any additional notes…' : category === 'purchase' ? 'Details, invoice #…' : 'Petty cash, drawer drop…'}
                rows={2} className="w-full p-3 bg-surface-container rounded-2xl text-sm focus:ring-2 outline-none transition-all resize-none placeholder:text-on-surface-variant/40" />
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="mt-4 pt-4 border-t border-outline-variant/10">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Session Withdrawals</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-0.5">
                {[...history].reverse().map((h, i) => {
                  const catInfo = WITHDRAW_CATEGORIES.find(c => c.id === h.category);
                  return (
                    <div key={h.id || i} className="flex items-center gap-2 p-2.5 bg-surface-container/40 rounded-xl border border-outline-variant/5 hover:bg-surface-container transition-all">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">{catInfo?.icon ?? 'payments'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-on-surface truncate">{h.reference_label || h.notes || 'Withdrawal'}</p>
                        <p className="text-[9px] text-on-surface-variant capitalize">{catInfo?.label ?? 'Other'}</p>
                      </div>
                      <span className="font-bold text-sm flex-shrink-0" style={{ color: 'var(--color-secondary)' }}>-{formatCurrency(h.amount)}</span>
                      <button onClick={() => setDeletingId(h.id)}
                        className="w-6 h-6 rounded-full bg-error/10 text-error flex items-center justify-center hover:bg-error hover:text-on-error transition-all flex-shrink-0">
                        <span className="material-symbols-outlined text-[13px]">delete</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-5">
            <button onClick={onClose}
              className="flex-1 py-3.5 bg-surface-container-highest text-on-surface-variant rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-surface-container-highest/80 transition-all">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={!canSubmit || isSubmitting}
              className="flex-[2] py-3.5 rounded-2xl font-bold uppercase tracking-widest text-[10px] shadow-lg hover:opacity-90 disabled:opacity-30 transition-all flex items-center justify-center gap-2 text-on-secondary"
              style={{ background: 'var(--color-secondary)' }}>
              {isSubmitting
                ? <span className="material-symbols-outlined animate-spin">sync</span>
                : <><span className="material-symbols-outlined text-sm">check_circle</span>Confirm</>}
            </button>
          </div>
        </div>
      </motion.div>

      <DeleteConfirmModal
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={() => deletingId && handleDeleteWithdrawal(deletingId)}
        title="Delete Withdrawal?"
        message="This will return the amount to the register balance. This action cannot be undone."
      />
    </div>
  );
};
