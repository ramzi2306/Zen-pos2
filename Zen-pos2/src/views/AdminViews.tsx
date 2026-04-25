import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { zenWs } from '../api/websocket';
import { User, PerformanceLog, Role, Permission, Product, VariationGroup, VariationOption, Ingredient, Order, Customer, CustomerDetail, BestsellerItem, LeaderboardEntry, SalesSummary, RegisterReport } from '../data';
import { showError, showSuccess } from '../utils/toast';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Scatter, LineChart, Line, Area, PieChart, Pie, BarChart, CartesianGrid, Legend } from 'recharts';
import QRCode from 'react-qr-code';
import * as api from '../api';
import type { IngredientItem, PurchaseLog, UsageLog } from '../api/inventory';
import type { FinanceReport } from '../api/analytics';
import { DEFAULT_BRANDING } from '../api/settings';
import type { BrandingData } from '../api/settings';
import { getSoundConfig, saveSoundConfig, playSound } from '../utils/sounds';
import type { SoundConfig } from '../utils/sounds';
import { useLocalization, CURRENCY_SYMBOLS } from '../context/LocalizationContext';
import { TimeRangeSlider } from '../components/ui/TimeRangeSlider';
import { AttendanceContributionGraph, type ContributionDayRecord } from '../components/ui/attendance-contribution-graph';
import { printElement } from '../utils/printUtils';

const CurrencySymbol = ({ prefix = '' }: { prefix?: string }) => {
  const { localization } = useLocalization();
  const symbol = CURRENCY_SYMBOLS[localization.currency] ?? localization.currency;
  const isLeft = localization.currencyPosition === 'left';
  return (
    <span className={`absolute ${isLeft ? 'left-6' : 'right-6'} top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest pointer-events-none`}>
      {prefix}{symbol}
    </span>
  );
};

const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
    <div className="relative w-full max-w-sm bg-surface-container rounded-[2rem] border border-outline-variant/20 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
      <div className="p-8 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-error">delete_forever</span>
        </div>
        <div>
          <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight">{title}</h3>
          <p className="text-on-surface-variant text-sm mt-2">{message}</p>
        </div>
        <div className="flex gap-3 w-full mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-surface-container-highest text-on-surface font-bold text-sm hover:bg-surface-variant transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className="flex-1 py-3 rounded-2xl bg-error text-on-error font-bold text-sm hover:opacity-90 transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  </div>
);

const WithdrawalModal = ({ user, dateRange, onClose }: { user: User, dateRange?: { start: string, end: string }, onClose: () => void }) => {
  const { formatCurrency } = useLocalization();
  const [amount, setAmount] = useState('');
  const [staffComment, setStaffComment] = useState('');
  const [privateComment, setPrivateComment] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);
  const [performanceLogs, setPerformanceLogs] = useState<import('../api/payroll').PerformanceLogEntry[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<import('../api/attendance').AttendanceReportSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<import('../api/payroll').WithdrawalLog[]>([]);

  useEffect(() => {
    api.payroll.getPerformanceLogs(user.id).then(setPerformanceLogs).catch(console.error);
    api.payroll.getWithdrawals(user.id).then(setWithdrawals).catch(console.error);
    if (dateRange) {
      api.attendance.getReport(dateRange.start, dateRange.end, user.id)
        .then(r => setAttendanceSummary(r.summaries[0] ?? null))
        .catch(console.error);
    }
  }, [user.id, dateRange]);

  // Real attendance records for this period
  const records = attendanceSummary?.records ?? [];
  const workedRecords = records.filter(r => r.checkIn);
  const workedDays = workedRecords.length;

  const hourlyRate = user.baseSalary / (22 * 8);

  // Compute deductions/bonuses from actual hours (same formula as HR cards)
  let computedLateDeduction = 0;
  let computedEarlyDeduction = 0;
  let computedOvertimeBonus = 0;
  workedRecords.forEach(r => {
    const hours = r.hours || 0;
    const shortfall = 8 - hours;
    if (r.isLate && shortfall > 0) computedLateDeduction += shortfall * hourlyRate;
    if (r.isEarlyDeparture && shortfall > 0) computedEarlyDeduction += shortfall * hourlyRate;
    if (r.isOvertime && hours > 8) computedOvertimeBonus += (hours - 8) * hourlyRate;
  });
  computedLateDeduction = Math.round(computedLateDeduction * 100) / 100;
  computedEarlyDeduction = Math.round(computedEarlyDeduction * 100) / 100;
  computedOvertimeBonus = Math.round(computedOvertimeBonus * 100) / 100;

  const rewardBonus      = Math.round(performanceLogs.filter(l => l.type === 'Reward').reduce((s, l) => s + (parseFloat(l.impact) || 0), 0) * 100) / 100;
  const sanctionDeduction = Math.round(performanceLogs.filter(l => l.type === 'Sanction').reduce((s, l) => s + (parseFloat(l.impact) || 0), 0) * 100) / 100;

  // Pro-rated earned-to-date: baseSalary × (daysWorked / 22) + bonuses - deductions
  const earnedBase = Math.round(user.baseSalary * (workedDays / 22) * 100) / 100;
  const netEarnedToDate = Math.round((earnedBase + rewardBonus + computedOvertimeBonus - sanctionDeduction - computedLateDeduction - computedEarlyDeduction) * 100) / 100;

  // Already withdrawn this month
  const monthPrefix = dateRange?.start.slice(0, 7) ?? '';
  const alreadyWithdrawn = Math.round(withdrawals.filter(w => w.date.startsWith(monthPrefix)).reduce((s, w) => s + w.amount, 0) * 100) / 100;

  const availableToWithdraw = Math.max(0, netEarnedToDate - alreadyWithdrawn);

  const lateIncidents  = workedRecords.filter(r => r.isLate);
  const earlyIncidents = workedRecords.filter(r => r.isEarlyDeparture);
  const otIncidents    = workedRecords.filter(r => r.isOvertime && (r.hours || 0) > 8);

  const fmtTime = (t?: string) => {
    if (!t) return '';
    const p = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
    return p.slice(0, 5);
  };

  const handleNumClick = (num: string) => {
    if (num === '.' && amount.includes('.')) return;
    setAmount(prev => prev + num);
  };

  const handleBackspace = () => setAmount(prev => prev.slice(0, -1));

  const handleProcess = async () => {
    setIsPrinting(true);
    try {
      const log = await api.payroll.processWithdrawal(
        user.id,
        parseFloat(amount),
        staffComment,
        privateComment,
      );
      const newLog = {
        id: log.id,
        amount: log.amount,
        date: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        status: log.status as 'Completed' | 'Pending',
      };
      user.withdrawalLogs.unshift(newLog);
    } catch (err: any) {
      showError('Withdrawal failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsPrinting(false);
      setShowReceipt(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      
      <div className="relative w-full max-w-7xl bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col lg:flex-row max-h-[95vh] animate-in fade-in zoom-in duration-500">
        
        {/* Exit Button */}
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 z-[120] w-12 h-12 rounded-full bg-surface-container-highest/50 flex items-center justify-center text-on-surface hover:bg-surface-container-highest transition-all"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        {showReceipt ? (
          <div className="flex-1 p-10 flex flex-col items-center justify-center bg-surface-container-low animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* 3D Touch Style Receipt Card */}
            <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] text-black font-mono text-[10px] space-y-6 relative overflow-hidden border border-black/5 transform hover:scale-[1.02] transition-transform duration-500">
              {/* Decorative Receipt Edge */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-black/10 flex justify-between px-1">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="w-2 h-2 bg-surface-container-low rounded-full -mt-1" />
                ))}
              </div>

              <div className="text-center border-b-2 border-dashed border-black/20 pb-6 mb-6">
                <h2 className="text-xl font-bold tracking-tighter">PAYROLL DISBURSEMENT</h2>
                <p className="text-[9px] opacity-60 uppercase tracking-widest mt-1">Official Personnel Record • {new Date().toLocaleDateString()}</p>
                <p className="text-[8px] opacity-40 uppercase mt-1">ID: {Math.random().toString(36).substr(2, 12).toUpperCase()}</p>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between border-b border-black/5 pb-2">
                  <span className="opacity-60 uppercase">Personnel:</span>
                  <span className="font-bold uppercase">{user.name}</span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Base (pro-rated {workedDays}/22d):</span><span>{formatCurrency(earnedBase)}</span></div>
                  {rewardBonus > 0 && <div className="flex justify-between font-bold"><span>Rewards:</span><span>+{formatCurrency(rewardBonus)}</span></div>}
                  {computedOvertimeBonus > 0 && <div className="flex justify-between"><span>Overtime:</span><span>+{formatCurrency(computedOvertimeBonus)}</span></div>}
                  {sanctionDeduction > 0 && <div className="flex justify-between"><span>Sanctions:</span><span>-{formatCurrency(sanctionDeduction)}</span></div>}
                  {(computedLateDeduction + computedEarlyDeduction) > 0 && <div className="flex justify-between"><span>Attendance Penalties:</span><span>-{formatCurrency(computedLateDeduction + computedEarlyDeduction)}</span></div>}
                  {alreadyWithdrawn > 0 && <div className="flex justify-between"><span>Previous Withdrawals:</span><span>-{formatCurrency(alreadyWithdrawn)}</span></div>}
                </div>

                {/* Detailed Incident Log */}
                <div className="pt-4 border-t-2 border-dashed border-black/10 space-y-2">
                  <p className="font-bold uppercase text-[9px] mb-2">Incident Log:</p>
                  {lateIncidents.map((r, i) => (
                    <div key={`late-${i}`} className="flex justify-between gap-2">
                      <span className="opacity-60 shrink-0">{r.date}</span>
                      <span className="flex-1 text-right">Late {fmtTime(r.checkIn)}→{fmtTime(r.checkOut)} ({(r.hours||0).toFixed(1)}h)</span>
                    </div>
                  ))}
                  {earlyIncidents.map((r, i) => (
                    <div key={`early-${i}`} className="flex justify-between gap-2">
                      <span className="opacity-60 shrink-0">{r.date}</span>
                      <span className="flex-1 text-right">Early out {fmtTime(r.checkIn)}→{fmtTime(r.checkOut)} ({(r.hours||0).toFixed(1)}h)</span>
                    </div>
                  ))}
                  {otIncidents.map((r, i) => (
                    <div key={`ot-${i}`} className="flex justify-between gap-2">
                      <span className="opacity-60 shrink-0">{r.date}</span>
                      <span className="flex-1 text-right">OT +{((r.hours||0)-8).toFixed(1)}h</span>
                    </div>
                  ))}
                  {performanceLogs.map((log, i) => (
                    <div key={`log-${i}`} className="flex justify-between gap-2">
                      <span className="opacity-60 shrink-0">{log.date}</span>
                      <span className="flex-1 text-right italic">{log.title} ({log.type})</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-xl font-bold border-t-2 border-black pt-4 mt-6">
                  <span>TOTAL DISBURSED:</span>
                  <span>{formatCurrency(parseFloat(amount) || 0)}</span>
                </div>
              </div>

              {staffComment && (
                <div className="bg-black/5 p-4 rounded-xl italic text-[10px] border-l-4 border-black/20">
                  <p className="font-bold not-italic uppercase mb-1 text-[8px] opacity-60">Management Message:</p>
                  "{staffComment}"
                </div>
              )}

              {privateComment && (
                <div className="mt-4 pt-4 border-t border-black/5 text-[8px] opacity-40 italic">
                  <p className="font-bold not-italic uppercase mb-1">Internal Audit Note:</p>
                  {privateComment}
                </div>
              )}

              <div className="text-center pt-10 opacity-40 text-[8px] space-y-1">
                <p className="font-bold uppercase tracking-widest">Digital Signature Verified</p>
                <p>This document serves as a legal record of salary withdrawal.</p>
                <p>© 2026 AI Studio Build Systems</p>
              </div>

              {/* Decorative Receipt Bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/10 flex justify-between px-1">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="w-2 h-2 bg-surface-container-low rounded-full -mb-1" />
                ))}
              </div>
            </div>

            <div className="mt-12 flex gap-6">
              <button 
                onClick={() => printElement('settings-branding-preview', 'Branding Preview')}
                className="px-12 py-5 bg-primary text-on-primary rounded-[1.5rem] text-sm font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(0,0,0,0.2)] flex items-center gap-4"
              >
                <span className="material-symbols-outlined">print</span>
                PRINT RECEIPT
              </button>
              <button 
                onClick={onClose}
                className="px-12 py-5 bg-surface-container-highest text-on-surface rounded-[1.5rem] text-sm font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
              >
                DONE
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Left Side: Details & Breakdown */}
            <div className="flex-1 p-10 overflow-y-auto bg-surface-container-low">
              <div className="flex items-center gap-6 mb-12">
                <div className="w-24 h-24 rounded-3xl bg-surface-container-highest overflow-hidden border-4 border-surface-container shadow-2xl">
                  <img src={user.image} alt={user.name} className="w-full h-full object-cover grayscale" />
                </div>
                <div>
                  <h2 className="text-3xl font-headline font-extrabold text-on-surface mb-1">{user.name}</h2>
                  <p className="text-xs font-bold text-secondary uppercase tracking-[0.3em]">{user.role}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <div className="p-8 bg-surface-container rounded-[2rem] border border-outline-variant/10 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-6">Payroll Breakdown</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-on-surface-variant">Base Salary (full month)</p>
                      <p className="text-sm font-headline font-bold text-on-surface">{formatCurrency(user.baseSalary)}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-on-surface-variant">Days Worked</p>
                      <p className="text-xs font-bold text-on-surface-variant">{workedDays} / 22</p>
                    </div>
                    {rewardBonus > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-on-surface-variant">Rewards</p>
                        <p className="text-sm font-headline font-bold text-tertiary">+{formatCurrency(rewardBonus)}</p>
                      </div>
                    )}
                    {computedOvertimeBonus > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-on-surface-variant">Overtime Bonus</p>
                        <p className="text-sm font-headline font-bold text-tertiary">+{formatCurrency(computedOvertimeBonus)}</p>
                      </div>
                    )}
                    {sanctionDeduction > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-on-surface-variant">Sanctions</p>
                        <p className="text-sm font-headline font-bold text-error">-{formatCurrency(sanctionDeduction)}</p>
                      </div>
                    )}
                    {(computedLateDeduction + computedEarlyDeduction) > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-on-surface-variant">Attendance Penalties</p>
                        <p className="text-sm font-headline font-bold text-error">-{formatCurrency(computedLateDeduction + computedEarlyDeduction)}</p>
                      </div>
                    )}
                    <div className="h-px bg-outline-variant/10 my-1" />
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-on-surface">Earned to Date</p>
                      <p className="text-xl font-headline font-extrabold text-primary">{formatCurrency(netEarnedToDate)}</p>
                    </div>
                    {alreadyWithdrawn > 0 && (
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-on-surface-variant">Already Withdrawn</p>
                        <p className="text-sm font-headline font-bold text-error">-{formatCurrency(alreadyWithdrawn)}</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center bg-primary/10 rounded-xl px-3 py-2">
                      <p className="text-xs font-bold text-primary uppercase tracking-widest">Available to Withdraw</p>
                      <p className="text-lg font-headline font-extrabold text-primary">{formatCurrency(availableToWithdraw)}</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-surface-container rounded-[2rem] border border-outline-variant/10 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-secondary border-b border-outline-variant/10 pb-2 mb-4">Incident Detail Log</h3>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2">
                    {lateIncidents.map((r, i) => {
                      const shortfall = Math.max(0, 8 - (r.hours || 0));
                      const fee = Math.round(shortfall * hourlyRate * 100) / 100;
                      return (
                        <div key={`late-${i}`} className="flex justify-between items-center p-3 bg-error/5 rounded-lg border border-error/10">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-error uppercase">Late — {fmtTime(r.checkIn)}{r.checkOut ? ` → ${fmtTime(r.checkOut)}` : ''}</span>
                            <span className="text-[10px] text-error/70 uppercase">{r.date} · {(r.hours || 0).toFixed(1)}h worked · {shortfall.toFixed(1)}h short</span>
                          </div>
                          <span className="text-xs font-bold text-error shrink-0 ml-2">-{formatCurrency(fee)}</span>
                        </div>
                      );
                    })}
                    {earlyIncidents.map((r, i) => {
                      const shortfall = Math.max(0, 8 - (r.hours || 0));
                      const fee = Math.round(shortfall * hourlyRate * 100) / 100;
                      return (
                        <div key={`early-${i}`} className="flex justify-between items-center p-3 bg-error/5 rounded-lg border border-error/10">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-error uppercase">Early Out — {fmtTime(r.checkIn)}{r.checkOut ? ` → ${fmtTime(r.checkOut)}` : ''}</span>
                            <span className="text-[10px] text-error/70 uppercase">{r.date} · {(r.hours || 0).toFixed(1)}h worked · {shortfall.toFixed(1)}h short</span>
                          </div>
                          <span className="text-xs font-bold text-error shrink-0 ml-2">-{formatCurrency(fee)}</span>
                        </div>
                      );
                    })}
                    {otIncidents.map((r, i) => {
                      const extra = Math.max(0, (r.hours || 0) - 8);
                      const bonus = Math.round(extra * hourlyRate * 100) / 100;
                      return (
                        <div key={`ot-${i}`} className="flex justify-between items-center p-3 bg-tertiary/5 rounded-lg border border-tertiary/10">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-tertiary uppercase">Overtime — {fmtTime(r.checkIn)}{r.checkOut ? ` → ${fmtTime(r.checkOut)}` : ''}</span>
                            <span className="text-[10px] text-tertiary/70 uppercase">{r.date} · {(r.hours || 0).toFixed(1)}h worked · +{extra.toFixed(1)}h OT</span>
                          </div>
                          <span className="text-xs font-bold text-tertiary shrink-0 ml-2">+{formatCurrency(bonus)}</span>
                        </div>
                      );
                    })}
                    {performanceLogs.map((log, i) => (
                      <div key={`log-${i}`} className="flex justify-between items-center p-3 rounded-lg border" style={{ backgroundColor: log.type === 'Reward' ? 'color-mix(in srgb, var(--color-tertiary) 8%, transparent)' : 'color-mix(in srgb, var(--color-error) 8%, transparent)', borderColor: log.type === 'Reward' ? 'color-mix(in srgb, var(--color-tertiary) 20%, transparent)' : 'color-mix(in srgb, var(--color-error) 20%, transparent)' }}>
                        <div className="flex flex-col">
                          <span className={`text-xs font-bold uppercase ${log.type === 'Reward' ? 'text-tertiary' : 'text-error'}`}>{log.type} — {log.title}</span>
                          <span className={`text-[10px] uppercase ${log.type === 'Reward' ? 'text-tertiary/70' : 'text-error/70'}`}>{log.date}</span>
                        </div>
                        <span className={`text-xs font-bold shrink-0 ml-2 ${log.type === 'Reward' ? 'text-tertiary' : 'text-error'}`}>{log.type === 'Reward' ? '+' : '-'}{formatCurrency(parseFloat(log.impact) || 0)}</span>
                      </div>
                    ))}
                    {lateIncidents.length === 0 && earlyIncidents.length === 0 && otIncidents.length === 0 && performanceLogs.length === 0 && (
                      <p className="text-xs text-on-surface-variant/40 italic text-center py-4">{attendanceSummary === null ? 'Loading...' : 'No incidents recorded this period'}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">Staff Audit Note</label>
                  <textarea 
                    value={staffComment}
                    onChange={(e) => setStaffComment(e.target.value)}
                    placeholder="Notes visible to the employee..."
                    className="w-full h-32 bg-surface-container rounded-2xl p-6 text-xs text-on-surface border border-outline-variant/10 focus:border-secondary/50 outline-none transition-all resize-none"
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">Private Audit Note</label>
                  <textarea 
                    value={privateComment}
                    onChange={(e) => setPrivateComment(e.target.value)}
                    placeholder="Confidential management notes..."
                    className="w-full h-32 bg-surface-container-highest/20 rounded-2xl p-6 text-xs text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="mt-12 flex flex-col items-center relative">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4 text-center">Withdrawal Amount</p>
                
                {/* Normal Field */}
                <div 
                  onClick={() => setIsNumpadOpen(true)}
                  className={`bg-surface-container-low rounded-2xl p-6 border transition-all cursor-pointer text-center shadow-inner min-w-[300px] ${
                    isNumpadOpen ? 'opacity-0 pointer-events-none' : 'border-outline-variant/10 hover:border-secondary/50'
                  }`}
                >
                  <span className="text-4xl font-headline font-extrabold text-primary">
                    {formatCurrency(parseFloat(amount) || 0)}
                  </span>
                </div>

                {/* Fixed Overlay for Numpad and Field */}
                <AnimatePresence>
                  {isNumpadOpen && (
                    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center pointer-events-none">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 40 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 40 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="pointer-events-auto flex flex-col items-center"
                      >
                        <div className="bg-surface-container-highest rounded-2xl p-6 border border-secondary ring-4 ring-secondary/20 shadow-2xl min-w-[300px] text-center mb-8">
                          <span className="text-4xl font-headline font-extrabold text-primary">
                            {formatCurrency(parseFloat(amount) || 0)}
                          </span>
                        </div>

                        <div className="w-[280px] bg-surface-container-highest rounded-3xl shadow-2xl border border-outline-variant/20 p-4">
                          <div className="grid grid-cols-3 gap-3">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map(val => (
                              <button
                                key={val}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNumClick(val.toString());
                                }}
                                className="h-14 rounded-xl bg-surface-container flex items-center justify-center text-lg font-headline font-bold text-on-surface hover:bg-surface-container-high active:scale-95 transition-all border border-outline-variant/10"
                              >
                                {val}
                              </button>
                            ))}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBackspace();
                              }}
                              className="h-14 rounded-xl bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high active:scale-95 transition-all border border-outline-variant/10"
                            >
                              <span className="material-symbols-outlined">backspace</span>
                            </button>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsNumpadOpen(false);
                            }}
                            className="w-full mt-3 py-3 bg-secondary text-on-secondary rounded-xl text-[10px] font-bold uppercase tracking-widest"
                          >
                            DONE
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                {parseFloat(amount) > availableToWithdraw && (
                  <p className="text-[10px] font-bold text-error uppercase tracking-widest mt-2 text-center animate-pulse">Exceeds available amount ({formatCurrency(availableToWithdraw)})</p>
                )}

                <div className="mt-12 w-full max-w-md">
                  <button 
                    onClick={handleProcess}
                    disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > availableToWithdraw || isPrinting}
                    className="w-full py-5 bg-primary text-on-primary rounded-2xl text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl flex items-center justify-center gap-3"
                  >
                    {isPrinting ? (
                      <>
                        <span className="material-symbols-outlined animate-spin">sync</span>
                        PROCESSING...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined">check_circle</span>
                        PROCESS WITHDRAWAL
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 3D Touch Numpad Overlay Backdrop */}
            <AnimatePresence>
              {isNumpadOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsNumpadOpen(false)}
                  className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[2px]"
                />
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
};

const DossierModal = ({ user, dateRange, onClose, onSaved, initialIsEditing = false, initialAddingLog }: { user: User, dateRange?: { start: string, end: string }, onClose: () => void, onSaved?: () => void, initialIsEditing?: boolean, initialAddingLog?: 'Reward' | 'Sanction' }) => {
  const { formatCurrency, localization } = useLocalization();
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [editData, setEditData] = useState({ ...user });
  const [isDragging, setIsDragging] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [performanceLogs, setPerformanceLogs] = useState<PerformanceLog[]>([]);
  const [isAddingLog, setIsAddingLog] = useState(!!initialAddingLog);
  const [newLogForm, setNewLogForm] = useState<{ type: 'Reward' | 'Sanction'; title: string; amount: number | '' }>({ type: initialAddingLog || 'Reward', title: '', amount: '' });

  useEffect(() => {
    api.users.listRoles().then(setAvailableRoles).catch(console.error);
  }, []);

  useEffect(() => {
    api.payroll.getPerformanceLogs(user.id).then(logs => {
      setPerformanceLogs(logs.map(l => ({
        id: l.id,
        userId: l.userId,
        type: l.type,
        title: l.title,
        asset: '',
        impact: l.impact,
        date: l.date,
      })));
    }).catch(console.error);
  }, [user.id]);

  const computedRewards = performanceLogs.filter(l => l.type === 'Reward').reduce((sum, l) => sum + (parseFloat(l.impact) || 0), 0);
  const computedSanctions = performanceLogs.filter(l => l.type === 'Sanction').reduce((sum, l) => sum + (parseFloat(l.impact) || 0), 0);
  const totalSalary = user.baseSalary + computedRewards - computedSanctions;

  const handleAddLog = async () => {
    if (!newLogForm.title.trim() || newLogForm.amount === '' || newLogForm.amount <= 0) return;
    const impactStr = String(newLogForm.amount);
    try {
      const log = await api.payroll.createPerformanceLog(user.id, newLogForm.type, newLogForm.title, impactStr);
      setPerformanceLogs(prev => [...prev, { id: log.id, userId: log.userId, type: log.type, title: log.title, asset: '', impact: log.impact, date: log.date }]);
      setNewLogForm({ type: 'Reward', title: '', amount: '' });
      setIsAddingLog(false);
    } catch (err: any) {
      showError('Failed to add log: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleDeleteLog = async (logId: string) => {
    try {
      await api.payroll.deletePerformanceLog(logId);
      setPerformanceLogs(prev => prev.filter(l => l.id !== logId));
    } catch (err: any) {
      showError('Failed to delete log: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleSavePin = async () => {
    if (newPin.length !== 4) return;
    setPinSaving(true);
    try {
      await api.users.updatePin(user.id, newPin);
      user.hasPin = true;
      setNewPin('');
      setPinMessage({ type: 'success', text: 'PIN updated successfully.' });
    } catch {
      setPinMessage({ type: 'error', text: 'Failed to update PIN.' });
    } finally {
      setPinSaving(false);
      setTimeout(() => setPinMessage(null), 3000);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) return;
    setPasswordSaving(true);
    try {
      await api.users.resetPassword(user.id, newPassword);
      setNewPassword('');
      setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch {
      setPasswordMessage({ type: 'error', text: 'Failed to update password.' });
    } finally {
      setPasswordSaving(false);
      setTimeout(() => setPasswordMessage(null), 3000);
    }
  };

  const filteredAttendance = user.monthlyAttendance.filter(a => {
    if (!dateRange) return true;
    const startDay = new Date(dateRange.start).getDate();
    const endDay = new Date(dateRange.end).getDate();
    const dayNum = parseInt(a.day);
    return dayNum >= startDay && dayNum <= endDay;
  });
  
  const handlePrint = () => {
    printElement('dossier-print-area', `Personnel Dossier - ${user.name}`);
  };

  const handleCloseEditing = () => {
    if (initialIsEditing) {
      onClose();
    } else {
      setIsEditing(false);
    }
  };

  const handleSave = async () => {
    try {
      await api.users.updateUser(user.id, {
        name: editData.name,
        phone: editData.phone,
        role_id: editData.roleId,
        base_salary: editData.baseSalary,
        contract_type: editData.contractType,
        contract_date: editData.contractDate,
        contract_expiration: editData.contractExpiration,
        start_date: editData.startDate,
        attendance_group: editData.attendanceGroup,
        image: editData.image,
        personal_documents: editData.personalDocuments,
      });
      Object.assign(user, editData);
      onSaved?.();
    } catch {
      alert("Failed to save personnel details");
      Object.assign(user, editData);
    }
    handleCloseEditing();
  };

  const [uploadingDocs, setUploadingDocs] = useState(false);
  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    setUploadingDocs(true);
    try {
      const newDocs = [];
      for (const file of Array.from(files)) {
        const { url } = await api.settings.uploadFile(file);
        newDocs.push({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: file.type.includes('pdf') ? 'PDF' : 'IMG',
          url: url
        });
      }
      setEditData(prev => ({
        ...prev,
        personalDocuments: [...prev.personalDocuments, ...newDocs]
      }));
    } catch(err) {
      alert("Failed to upload document");
    } finally {
      setUploadingDocs(false);
    }
  };

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { url } = await api.settings.uploadFile(file);
      setEditData(prev => ({ ...prev, image: url }));
    } catch {
      alert('Avatar upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeDoc = (id: string) => {
    setEditData(prev => ({
      ...prev,
      personalDocuments: prev.personalDocuments.filter(d => d.id !== id)
    }));
  };

  if (isEditing) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleCloseEditing} />
        <div className="relative w-full max-w-2xl bg-surface-container rounded-3xl border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-300">
          <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
            <h2 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Edit Personnel Details</h2>
            <button onClick={handleCloseEditing} className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            <div className="flex gap-6 items-center border-b border-outline-variant/10 pb-6 mb-6">
              <div 
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                onDrop={async (e) => {
                  e.preventDefault(); e.stopPropagation(); setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  setUploadingAvatar(true);
                  try {
                    const { url } = await api.settings.uploadFile(file);
                    setEditData(prev => ({ ...prev, image: url }));
                  } catch {
                    alert('Avatar upload failed');
                  } finally {
                    setUploadingAvatar(false);
                  }
                }}
                className={`relative group w-24 h-24 rounded-full bg-surface-container overflow-hidden flex items-center justify-center border-2 border-dashed transition-colors cursor-pointer shrink-0 ${isDragging ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-primary'}`}
              >
                {editData.image ? (
                  <img src={editData.image} alt="Profile" className="w-full h-full object-cover pointer-events-none" />
                ) : (
                  <span className="material-symbols-outlined text-3xl text-on-surface-variant pointer-events-none">person</span>
                )}
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {uploadingAvatar ? (
                    <span className="material-symbols-outlined text-white animate-spin">sync</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-white text-xl">cloud_upload</span>
                      <span className="text-[8px] font-bold uppercase text-white mt-1 text-center leading-tight">Drop or<br />Upload</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
              </div>
              <div>
                <h3 className="text-lg font-headline font-bold text-on-surface">Profile Picture</h3>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Upload a professional photo for the staff ID.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Full Name</label>
                <input 
                  type="text" 
                  value={editData.name} 
                  onChange={e => setEditData({...editData, name: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Email Address</label>
                <input 
                  type="email" 
                  value={editData.email} 
                  onChange={e => setEditData({...editData, email: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Phone Number</label>
                <input 
                  type="text" 
                  value={editData.phone} 
                  onChange={e => setEditData({...editData, phone: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Role</label>
                <select
                  value={availableRoles.length > 0 ? editData.roleId : ''}
                  onChange={e => {
                    const role = availableRoles.find(r => r.id === e.target.value);
                    setEditData({ ...editData, roleId: e.target.value, role: role?.name || editData.role });
                  }}
                  disabled={availableRoles.length === 0}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none disabled:opacity-50"
                >
                  {availableRoles.length === 0
                    ? <option value="">Loading roles…</option>
                    : availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                  }
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Base Salary</label>
                <input 
                  type="number" 
                  value={editData.baseSalary} 
                  onChange={e => setEditData({...editData, baseSalary: Number(e.target.value)})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Start Date</label>
                <input 
                  type="date" 
                  value={editData.startDate} 
                  onChange={e => setEditData({...editData, startDate: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Contract Type</label>
                <select 
                  value={editData.contractType} 
                  onChange={e => setEditData({...editData, contractType: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                >
                  <option value="Full-time Permanent">Full-time Permanent</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contractor">Contractor</option>
                  <option value="Intern">Intern</option>
                  <option value="Fixed-Term">Fixed-Term</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Contract Date</label>
                <input 
                  type="date" 
                  value={editData.contractDate} 
                  onChange={e => setEditData({...editData, contractDate: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Expiration Date</label>
                <input
                  type="date"
                  value={editData.contractExpiration || ''}
                  onChange={e => setEditData({...editData, contractExpiration: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Attendance Station</label>
                <select
                  value={editData.attendanceGroup || ''}
                  onChange={e => setEditData({ ...editData, attendanceGroup: e.target.value })}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                >
                  <option value="">All Tablets</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="cashier">Cashier</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {/* PIN Management Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Kiosk PIN</label>
                {user.hasPin && (
                  <span className="text-[9px] font-bold text-tertiary uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary inline-block" />PIN Active
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder={user.hasPin ? '••••  (enter new PIN to reset)' : '1234'}
                  className="flex-1 bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all font-mono tracking-widest"
                />
                <button
                  onClick={handleSavePin}
                  disabled={newPin.length !== 4 || pinSaving}
                  className="px-5 py-3 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {pinSaving ? 'Saving…' : user.hasPin ? 'Reset PIN' : 'Set PIN'}
                </button>
              </div>
              {pinMessage && (
                <p className={`text-[10px] font-bold uppercase tracking-widest ${pinMessage.type === 'success' ? 'text-tertiary' : 'text-error'}`}>
                  {pinMessage.text}
                </p>
              )}
            </div>

            {/* Password Reset Section */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Reset Password</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password (min. 6 characters)"
                    className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 pr-11 text-sm text-on-surface focus:border-primary outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                <button
                  onClick={handleResetPassword}
                  disabled={newPassword.length < 6 || passwordSaving}
                  className="px-5 py-3 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                >
                  {passwordSaving ? 'Saving…' : 'Set Password'}
                </button>
              </div>
              {passwordMessage && (
                <p className={`text-[10px] font-bold uppercase tracking-widest ${passwordMessage.type === 'success' ? 'text-tertiary' : 'text-error'}`}>
                  {passwordMessage.text}
                </p>
              )}
            </div>

            {/* Documents Section */}
            <div className="space-y-4">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Personal Documents</label>
              
              {/* Drop Zone */}
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all
                  ${isDragging ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-primary/50 hover:bg-surface-container-highest'}
                `}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  multiple 
                  accept="image/*,.pdf"
                  onChange={(e) => handleFiles(e.target.files)}
                  disabled={uploadingDocs}
                />
                <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-primary">
                  {uploadingDocs ? (
                    <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-3xl">upload_file</span>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-on-surface uppercase tracking-tight">
                    {uploadingDocs ? 'Uploading...' : 'Click or Drag & Drop'}
                  </p>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                    IMG or PDF (Max 10MB)
                  </p>
                </div>
              </div>

              {/* Document List */}
              <div className="grid grid-cols-1 gap-2">
                {editData.personalDocuments.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-surface-container-highest rounded-xl border border-outline-variant/10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">
                          {doc.type === 'PDF' ? 'picture_as_pdf' : 'image'}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate max-w-[200px]">{doc.name}</p>
                        <p className="text-[8px] text-on-surface-variant uppercase tracking-widest">{doc.type}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => removeDoc(doc.id)}
                      className="w-8 h-8 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition-all flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 bg-surface-container-low border-t border-outline-variant/10 flex justify-end gap-4">
            <button onClick={() => setIsEditing(false)} className="px-6 py-3 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all">
              Cancel
            </button>
            <button onClick={handleSave} className="px-6 py-3 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      {/* Printable Area - Hidden from UI, visible during print */}
      <div id="dossier-print-area" className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-[200] print:p-12 print:text-black">
        <div className="max-w-[210mm] mx-auto bg-white min-h-[297mm]">
          {/* Print Header */}
          <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-8">
            <div className="flex gap-8">
              <div className="w-32 h-32 border-2 border-black overflow-hidden">
                <img src={user.image} alt={user.name} className="w-full h-full object-cover grayscale" />
              </div>
              <div>
                <h1 className="text-4xl font-bold uppercase mb-2">{user.name}</h1>
                <p className="text-xl font-bold text-gray-700 uppercase mb-4">{user.role}</p>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <p><strong>ID:</strong> {user.id.toUpperCase()}</p>
                  <p><strong>Joined:</strong> {user.startDate}</p>
                  <p><strong>Contract:</strong> {user.contractType}</p>
                  <p><strong>Signed:</strong> {user.contractDate}</p>
                  {user.contractExpiration && <p><strong>Expires:</strong> {user.contractExpiration}</p>}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold uppercase">Personnel Dossier</p>
              <p className="text-sm text-gray-500">Generated: {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12">
            {/* Print Left Column */}
            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-bold uppercase border-b border-black mb-4">Contract Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Type</span><span className="font-bold">{user.contractType}</span></div>
                  <div className="flex justify-between"><span>Date Signed</span><span className="font-bold">{user.contractDate}</span></div>
                  {user.contractExpiration && <div className="flex justify-between"><span>Expiration</span><span className="font-bold">{user.contractExpiration}</span></div>}
                  <div className="flex justify-between"><span>Base Salary</span><span className="font-bold">{formatCurrency(user.baseSalary)}</span></div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold uppercase border-b border-black mb-4">Weekly Schedule</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div key={day} className="flex justify-between p-1 border-b border-gray-100">
                      <span className="font-bold">{day}</span>
                      <span>{user.shifts[day] || 'Off'}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold uppercase border-b border-black mb-4">Performance Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="border border-black p-2">
                    <p className="text-[10px] uppercase font-bold">Attendance</p>
                    <p className="text-xl font-bold">{user.attendanceScore}%</p>
                  </div>
                  <div className="border border-black p-2">
                    <p className="text-[10px] uppercase font-bold">Rewards</p>
                    <p className="text-xl font-bold">+{formatCurrency(computedRewards)}</p>
                  </div>
                  <div className="border border-black p-2">
                    <p className="text-[10px] uppercase font-bold">Sanctions</p>
                    <p className="text-xl font-bold">-{formatCurrency(computedSanctions)}</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Print Right Column */}
            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-bold uppercase border-b border-black mb-4">Performance Log</h3>
                <div className="space-y-3">
                  {performanceLogs.slice(0, 5).map(log => (
                    <div key={log.id} className="text-xs border-b border-gray-100 pb-2">
                      <div className="flex justify-between font-bold mb-1">
                        <span>{log.title}</span>
                        <span>{log.date}</span>
                      </div>
                      <p className="text-gray-600 italic">{log.type} • {log.impact}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold uppercase border-b border-black mb-4">Withdrawal History</h3>
                <div className="space-y-2">
                  {user.withdrawalLogs.slice(0, 5).map(log => (
                    <div key={log.id} className="text-xs flex justify-between p-1 border-b border-gray-100">
                      <span>{log.date}</span>
                      <span className="font-bold">{formatCurrency(log.amount)}</span>
                      <span>{log.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {/* Print Footer */}
          <div className="mt-auto pt-12 text-center text-[10px] text-gray-400 uppercase tracking-widest">
            Confidential Personnel Document • {user.name} • {user.id}
          </div>
        </div>
      </div>

      <div className="relative w-full max-w-5xl bg-surface-container rounded-3xl border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-surface-container-high border border-outline-variant/30 overflow-hidden shadow-xl">
              <img src={user.image} alt={user.name} className="w-full h-full object-cover grayscale" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">{user.name}</h2>
                <span className="px-3 py-1 bg-secondary/10 text-secondary text-[10px] font-bold uppercase tracking-widest rounded-full border border-secondary/20">
                  {user.role}
                </span>
              </div>
              <p className="text-on-surface-variant text-xs font-medium uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">calendar_today</span>
                Joined {user.startDate} • ID: {user.id.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handlePrint}
              className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all"
              title="Print Dossier"
            >
              <span className="material-symbols-outlined">print</span>
            </button>
            <button 
              onClick={() => setIsEditing(true)}
              className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all"
              title="Edit Details"
            >
              <span className="material-symbols-outlined">edit</span>
            </button>
            <button 
              onClick={onClose}
              className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Schedule & Documents */}
            <div className="space-y-8">
              {/* Contract Info */}
              <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">contract</span>
                  Contract Details
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Type</span>
                    <span className="text-xs font-extrabold text-on-surface uppercase">{user.contractType}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Signed</span>
                    <span className="text-xs font-extrabold text-on-surface">{user.contractDate}</span>
                  </div>
                  {user.contractExpiration && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Expires</span>
                      <span className="text-xs font-extrabold text-error">{user.contractExpiration}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-outline-variant/5">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Base Salary</span>
                    <span className="text-xs font-extrabold text-on-surface">{formatCurrency(user.baseSalary)}</span>
                  </div>
                </div>
              </div>

              {/* Weekly Schedule */}
              <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  Weekly Shift Schedule
                </h3>
                <div className="space-y-3">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div key={day} className="flex justify-between items-center p-2 rounded-lg hover:bg-surface-container-high transition-colors">
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{day}</span>
                      {user.shifts[day] ? (
                        <span className="text-xs font-extrabold text-on-surface">{user.shifts[day]}</span>
                      ) : (
                        <span className="text-[10px] font-bold text-on-surface-variant/30 italic uppercase tracking-widest">Off</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Personal Documents */}
              <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/10">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-secondary mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">description</span>
                  Personal Documents
                </h3>
                <div className="space-y-3">
                  {user.personalDocuments.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-surface-container rounded-xl border border-outline-variant/5 group hover:border-secondary/30 transition-all cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-sm">
                            {doc.type === 'PDF' ? 'picture_as_pdf' : 'image'}
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate max-w-[120px]">{doc.name}</p>
                          <p className="text-[8px] text-on-surface-variant uppercase tracking-widest">{doc.type}</p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">download</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Middle Column: Performance & Logs */}
            <div className="lg:col-span-2 space-y-8">
              {/* Performance Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/10 text-center">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Attendance</p>
                  <p className={`text-3xl font-headline font-extrabold ${user.attendanceScore > 90 ? 'text-tertiary' : 'text-secondary'}`}>{user.attendanceScore}%</p>
                </div>
                <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/10 text-center">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Rewards</p>
                  <p className="text-3xl font-headline font-extrabold text-tertiary">+{formatCurrency(computedRewards)}</p>
                </div>
                <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/10 text-center">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Sanctions</p>
                  <p className="text-3xl font-headline font-extrabold text-error">-{formatCurrency(computedSanctions)}</p>
                </div>
              </div>

              {/* Performance Trend Chart */}
              <div className="flex justify-center w-full mb-8">
              </div>

              {/* Performance Logs */}
              <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
                <div className="p-5 border-b border-outline-variant/10 bg-surface-container-low/50 flex justify-between items-center">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Performance & Conduct Log</h3>
                  <button onClick={() => setIsAddingLog(true)} className="flex items-center gap-1 px-3 py-1.5 bg-secondary/10 text-secondary rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-secondary/20 transition-colors">
                    <span className="material-symbols-outlined text-sm">add</span>Add Entry
                  </button>
                </div>
                <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
                  {performanceLogs.map(log => (
                    <div key={log.id} className="p-4 bg-surface-container rounded-xl border border-outline-variant/5 flex items-center gap-4 group">
                      <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${log.type === 'Reward' ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'}`}>
                        <span className="material-symbols-outlined text-xl">
                          {log.type === 'Reward' ? 'workspace_premium' : 'report_problem'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider truncate">{log.title}</h4>
                          <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-widest shrink-0 ml-2">{log.date}</span>
                        </div>
                        <p className="text-[9px] text-on-surface-variant uppercase tracking-widest">
                          {log.type === 'Reward' ? '+' : '-'}{formatCurrency(parseFloat(log.impact) || 0)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteLog(log.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-lg bg-error/10 text-error flex items-center justify-center hover:bg-error/20 shrink-0"
                        title="Remove entry"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ))}
                  {/* Also show attendance events */}
                  {filteredAttendance.filter(d => d.rewardNote || d.sanctionNote).map((d, i) => (
                    <div key={`att-${i}`} className="p-4 bg-surface-container rounded-xl border border-outline-variant/5 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded flex items-center justify-center ${d.rewardNote ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'}`}>
                        <span className="material-symbols-outlined text-xl">
                          {d.rewardNote ? 'verified' : 'event_busy'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">{d.rewardNote || d.sanctionNote}</h4>
                          <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-widest">Day {d.day}</span>
                        </div>
                        <p className="text-[9px] text-on-surface-variant uppercase tracking-widest">Attendance Event • {d.hours}h Shift</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Withdrawal Logs */}
              <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
                <div className="p-5 border-b border-outline-variant/10 bg-surface-container-low/50 flex justify-between items-center">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Salary Withdrawal History</h3>
                  <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total: {formatCurrency(totalSalary)}</span>
                </div>
                <div className="p-4 space-y-3">
                  {user.withdrawalLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-secondary/10 flex items-center justify-center text-secondary">
                          <span className="material-symbols-outlined">payments</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-on-surface uppercase tracking-wider">{formatCurrency(log.amount)}</p>
                          <p className="text-[8px] text-on-surface-variant uppercase tracking-widest">{log.date} • {log.id}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest ${log.status === 'Completed' ? 'bg-tertiary/10 text-tertiary' : 'bg-secondary/10 text-secondary'}`}>
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-surface-container-low border-t border-outline-variant/10 flex justify-end gap-4">
          <button 
            onClick={handlePrint}
            className="px-6 py-3 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">print</span>
            Print Dossier
          </button>
          <button 
            onClick={() => setIsEditing(true)}
            className="px-6 py-3 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            Edit Personnel Details
          </button>
        </div>
      </div>

      {/* Add Performance Log Modal */}
      <AnimatePresence>
        {isAddingLog && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddingLog(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-md bg-surface-container rounded-3xl border border-outline-variant/20 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-outline-variant/10 bg-surface-container-low">
                <h2 className="text-2xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Add Performance Entry</h2>
              </div>
              <div className="p-8 space-y-5">
                <div className="flex gap-3">
                  {(['Reward', 'Sanction'] as const).map(t => (
                    <button key={t} onClick={() => setNewLogForm(f => ({ ...f, type: t }))} className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${newLogForm.type === t ? (t === 'Reward' ? 'bg-tertiary text-on-tertiary' : 'bg-error text-on-error') : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'}`}>{t}</button>
                  ))}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">Title</label>
                  <input type="text" value={newLogForm.title} onChange={e => setNewLogForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Excellent service quality" className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-5 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">
                    Amount ({newLogForm.type === 'Reward' ? 'bonus' : 'deduction'})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant pointer-events-none bg-surface-container-highest px-1 rounded">
                      {CURRENCY_SYMBOLS[localization.currency] || localization.currency}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newLogForm.amount}
                      onChange={e => setNewLogForm(f => ({ ...f, amount: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value)) }))}
                      placeholder="0.00"
                      className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl pl-14 pr-5 py-3 text-on-surface text-lg font-bold focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                  </div>
                  {newLogForm.amount !== '' && newLogForm.amount > 0 && (
                    <p className={`text-xs font-semibold ml-2 ${newLogForm.type === 'Reward' ? 'text-tertiary' : 'text-error'}`}>
                      {newLogForm.type === 'Reward' ? '+' : '-'}{formatCurrency(Number(newLogForm.amount))} will be added to {newLogForm.type === 'Reward' ? 'rewards' : 'sanctions'}
                    </p>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setIsAddingLog(false)}
                    className="flex-1 py-3 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddLog}
                    disabled={!newLogForm.title.trim() || newLogForm.amount === '' || Number(newLogForm.amount) <= 0}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 ${newLogForm.type === 'Reward' ? 'bg-tertiary text-on-tertiary hover:opacity-90' : 'bg-error text-on-error hover:opacity-90'}`}
                  >
                    Save {newLogForm.type}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const OnboardPersonnelModal = ({ onClose, onCreated }: { onClose: () => void, onCreated?: () => void }) => {
  const { formatCurrency } = useLocalization();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    pin: '',
    phone: '',
    baseSalary: 3000,
    startDate: new Date().toISOString().split('T')[0],
    contractType: 'Full-time Permanent',
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [locationsList, setLocationsList] = useState<import('../api/locations').Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.users.listRoles().then(r => {
      setRoles(r);
      if (r.length > 0) setSelectedRoleId(r[0].id);
    }).catch(console.error);
    api.locations.listLocations().then(locs => {
      setLocationsList(locs);
      if (locs.length > 0) setSelectedLocationId(locs[0].id);
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.email || !formData.password || !selectedRoleId) {
      setError('Name, email, password and role are required.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await api.users.createUser({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        pin: formData.pin || undefined,
        phone: formData.phone,
        role_id: selectedRoleId,
        location_id: selectedLocationId || undefined,
        base_salary: formData.baseSalary,
        contract_type: formData.contractType,
        start_date: formData.startDate,
      });
      if (onCreated) onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-500">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Onboard Personnel</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Initialize new personnel asset record</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-10 space-y-12">
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Full Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. John Doe"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Email Address</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                placeholder="john@example.com"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Phone Number</label>
              <input 
                type="text" 
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                placeholder="+81 00 0000 0000"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Initial Role</label>
              <select
                value={selectedRoleId}
                onChange={e => setSelectedRoleId(e.target.value)}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
              >
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            {locationsList.length > 0 && (
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Assigned Location</label>
                <select
                  value={selectedLocationId}
                  onChange={e => setSelectedLocationId(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
                >
                  <option value="">— No location —</option>
                  {locationsList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <p className="text-[10px] text-on-surface-variant">Staff only see orders, attendance, and inventory for their assigned location.</p>
              </div>
            )}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Base Salary (Monthly)</label>
              <input 
                type="number" 
                value={formData.baseSalary}
                onChange={e => setFormData({...formData, baseSalary: Number(e.target.value)})}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Start Date</label>
              <input 
                type="date" 
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Contract Type</label>
              <select 
                value={formData.contractType}
                onChange={e => setFormData({...formData, contractType: e.target.value})}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
              >
                <option value="Full-time Permanent">Full-time Permanent</option>
                <option value="Part-time">Part-time</option>
                <option value="Contractor">Contractor</option>
                <option value="Intern">Intern</option>
                <option value="Fixed-Term">Fixed-Term</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Password</label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                placeholder="••••••••"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">PIN (4 digits)</label>
              <input
                type="text"
                maxLength={4}
                value={formData.pin}
                onChange={e => setFormData({...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                placeholder="1234"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all font-mono tracking-widest"
              />
            </div>
          </div>

          {/* Contract Preview Card */}
          <div className="bg-surface-container-low p-8 rounded-[2.5rem] border border-outline-variant/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6">
              <span className="material-symbols-outlined text-on-surface-variant/10 text-7xl">verified_user</span>
            </div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">description</span>
              Contract Preview
            </h3>
            <div className="space-y-4 relative z-10">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                This contract establishes a <span className="text-on-surface font-bold">{formData.contractType}</span> relationship between the organization and <span className="text-on-surface font-bold">{formData.name || '[Full Name]'}</span>. 
                The employee will serve as <span className="text-on-surface font-bold">{roles.find(r => r.id === selectedRoleId)?.name || '[Role]'}</span> with a starting base salary of <span className="text-on-surface font-bold">{formatCurrency(formData.baseSalary)}</span> per month.
              </p>
              <div className="flex gap-10 pt-4">
                <div>
                  <p className="text-[8px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Effective Date</p>
                  <p className="text-xs font-bold text-on-surface">{formData.startDate}</p>
                </div>
                <div>
                  <p className="text-[8px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Status</p>
                  <p className="text-xs font-bold text-tertiary uppercase tracking-widest">Pending Activation</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex justify-end gap-6">
          <button onClick={onClose} className="px-10 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-surface-variant transition-all">
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={!formData.name || !formData.email}
            className="px-10 py-4 bg-primary text-on-primary rounded-2xl text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-30 transition-all shadow-xl"
          >
            Complete Onboarding
          </button>
        </div>
      </div>
    </div>
  );
};

const EditScheduleModal = ({ onClose, users }: { onClose: () => void, users: User[] }) => {
  /** Get Monday of the current week as YYYY-MM-DD */
  const currentMonday = () => {
    const now = new Date();
    const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() + diff);
    return mon.toISOString().slice(0, 10);
  };

  const [weekOf, setWeekOf] = useState(currentMonday);
  const [schedule, setSchedule] = useState(users.map(u => ({
    id: u.id,
    name: u.name,
    image: u.image,
    role: u.role,
    shifts: { ...u.shifts },
  })));
  const [saving, setSaving] = useState(false);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /** Parse "HH:MM-HH:MM" into { checkIn, checkOut }. */
  const parseShift = (val: string) => {
    if (!val || !val.includes('-')) return { checkIn: '', checkOut: '' };
    const [ci, co] = val.split('-');
    return { checkIn: ci?.trim() ?? '', checkOut: co?.trim() ?? '' };
  };

  const setShift = (userId: string, day: string, newShift: string) => {
    setSchedule(prev => prev.map(u => 
      u.id === userId ? { ...u, shifts: { ...u.shifts, [day]: newShift } } : u
    ));
  };

  const formatTime = (val: number) => {
    const h = Math.floor(val).toString().padStart(2, '0');
    const m = Math.round((val % 1) * 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const parseTime = (time: string) => {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return Math.round((h + (m / 60)) * 2) / 2; // round to nearest half hour
  };

  const clearDay = (userId: string, day: string) => {
    setSchedule(prev => prev.map(u =>
      u.id === userId ? { ...u, shifts: { ...u.shifts, [day]: '' } } : u
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        schedule.map(s => api.users.updateUser(s.id, { shifts: s.shifts }))
      );
      onClose();
    } catch (err) {
      showError('Failed to save schedule: ' + ((err as any)?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-7xl bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-500">

        {/* Header */}
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low gap-8">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Global Schedule</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">
              Expected check-in and check-out · used to compute late arrivals, early departures & overtime
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <label className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">EFFECTIVE WEEK OF</label>
              <input
                type="date"
                value={weekOf}
                onChange={e => setWeekOf(e.target.value)}
                className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-xs text-on-surface focus:border-secondary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
            </div>
            <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all flex-shrink-0">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="px-8 py-3 bg-surface-container-lowest border-b border-outline-variant/10 flex items-center gap-6 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-tertiary inline-block"/>Check-in time → late if exceeded by &gt;5 min</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-secondary inline-block"/>Check-out time → early departure if left &gt;5 min early · overtime if &gt;30 min late</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-outline-variant inline-block"/>Leave both empty = day off</span>
        </div>

        {/* Schedule table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-surface-container-low shadow-sm">
              <tr>
                <th className="px-8 py-5 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-outline-variant/10 min-w-[200px]">Personnel</th>
                {days.map(day => (
                  <th key={day} className="px-3 py-5 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-outline-variant/10 text-center min-w-[160px]">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {schedule.map(user => (
                <tr key={user.id} className="hover:bg-surface-container-high/30 transition-colors group">
                  <td className="px-8 py-5 border-r border-outline-variant/5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-surface-container-high overflow-hidden border border-outline-variant/20 flex-shrink-0">
                        <img src={user.image} alt="" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-on-surface uppercase tracking-wider leading-tight">{user.name}</p>
                        <p className="text-[8px] text-on-surface-variant uppercase tracking-widest mt-0.5">{user.role}</p>
                      </div>
                    </div>
                  </td>
                  {days.map(day => {
                    const { checkIn, checkOut } = parseShift(user.shifts[day] || '');
                    const isOff = !checkIn && !checkOut;
                    return (
                      <td key={day} className="px-3 py-4">
                        {isOff ? (
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[9px] font-bold text-on-surface-variant/30 uppercase tracking-widest">OFF</span>
                            <button
                              onClick={() => setShift(user.id, day, '09:00-17:00')}
                              className="text-[8px] font-bold text-secondary/60 hover:text-secondary uppercase tracking-widest transition-colors"
                            >+ Add shift</button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5 w-full max-w-[120px] mx-auto relative pt-4">
                            <div className="flex items-center justify-between px-1 absolute top-0 w-full text-[9px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">
                              <span>{checkIn}</span>
                              <span>{checkOut}</span>
                            </div>
                            <TimeRangeSlider 
                              min={0} max={24} step={0.5}
                              value={[parseTime(checkIn) || 9, parseTime(checkOut) || 17]} 
                              onChange={(val) => setShift(user.id, day, `${formatTime(val[0])}-${formatTime(val[1])}`)}
                            />
                            <div className="flex items-center justify-center mt-1">
                              <button
                                onClick={() => clearDay(user.id, day)}
                                className="text-[8px] font-bold text-on-surface-variant/50 hover:text-error uppercase tracking-widest transition-colors text-center"
                              >Clear</button>
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex justify-between items-center gap-6">
          <p className="text-[9px] text-on-surface-variant uppercase tracking-widest font-bold">
            Shift times are stored per staff member and used by the attendance system to auto-flag late arrivals and overtime.
          </p>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-8 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-surface-variant transition-all">
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-10 py-4 bg-primary text-on-primary rounded-2xl text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all shadow-xl"
            >
              {saving ? 'Saving…' : 'Publish Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Switch = ({ enabled, onChange }: { enabled: boolean, onChange: (val: boolean) => void }) => (
  <button
    onClick={() => onChange(!enabled)}
    className={`${
      enabled ? 'bg-secondary' : 'bg-surface-container-highest'
    } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
  >
    <span
      className={`${
        enabled ? 'translate-x-6' : 'translate-x-1'
      } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
    />
  </button>
);

const RoleManagementView = () => {
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    api.users.listRoles().then(setRoles).catch(console.error);
  }, []);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  const allPermissions: { id: Permission; label: string; description: string; group: string }[] = [
    // POS Operations
    { id: 'view_menu',               group: 'POS Operations',       label: 'View Menu',               description: 'Access the POS screen, browse items, and add to cart.' },
    { id: 'view_orders',             group: 'POS Operations',       label: 'View Orders',             description: 'Monitor and manage active and past orders.' },
    { id: 'apply_discounts',         group: 'POS Operations',       label: 'Apply Discounts',         description: 'Apply manual price discounts or overrides to order items.' },
    { id: 'cancel_completed_order',  group: 'POS Operations',       label: 'Cancel Completed Order',  description: 'Cancel an order that has already been marked as Done.' },
    // Administration
    { id: 'view_settings',           group: 'Administration',       label: 'View Settings',           description: 'Access POS branding, hardware, and general configuration.' },
    { id: 'manage_roles',            group: 'Administration',       label: 'Manage Roles',            description: 'Create, edit, and assign roles and their permission sets.' },
    { id: 'manage_locations',        group: 'Administration',       label: 'Manage Locations',        description: 'Create, edit, and configure physical business locations.' },
    // Products & Inventory
    { id: 'manage_menu',             group: 'Products & Inventory', label: 'Manage Menu',             description: 'Create, edit, and delete menu items and categories.' },
    { id: 'view_inventory',          group: 'Products & Inventory', label: 'View Inventory',          description: 'View stock levels, ingredient list, and usage logs.' },
    { id: 'manage_inventory',        group: 'Products & Inventory', label: 'Manage Inventory',        description: 'Add/edit ingredients, log purchases, and adjust stock.' },
    // Staff & HR
    { id: 'view_staff',              group: 'Staff & HR',           label: 'View Staff',              description: 'View the personnel registry and staff profiles.' },
    { id: 'manage_staff',            group: 'Staff & HR',           label: 'Manage Staff',            description: 'Create, edit, and deactivate staff member accounts.' },
    { id: 'view_hr',                 group: 'Staff & HR',           label: 'View HR',                 description: 'Access HR reports, performance logs, and payroll overview.' },
    { id: 'manage_payroll',          group: 'Staff & HR',           label: 'Manage Payroll',          description: 'Process payroll cycles and adjust salary information.' },
    { id: 'manage_withdrawals',      group: 'Staff & HR',           label: 'Manage Withdrawals',      description: 'Approve, record, and delete mid-session cash withdrawals.' },
    { id: 'view_attendance',         group: 'Staff & HR',           label: 'View Attendance',         description: 'Access staff attendance records and clock-in/out logs.' },
    // Reports
    { id: 'view_reports',            group: 'Reports',              label: 'View Reports',            description: 'Access sales analytics, revenue dashboards, and export data.' },
  ];

  const handleTogglePermission = (roleId: string, permission: Permission) => {
    setRoles(prev => prev.map(role => {
      if (role.id === roleId) {
        const hasPermission = role.permissions.includes(permission);
        const nextPermissions = hasPermission
          ? role.permissions.filter(p => p !== permission)
          : [...role.permissions, permission];
        return { ...role, permissions: nextPermissions as Permission[] };
      }
      return role;
    }));
  };

  const handleToggleAttendanceExclude = (roleId: string, val: boolean) => {
    setRoles(prev => prev.map(role => {
      if (role.id === roleId) return { ...role, excludeFromAttendance: val };
      return role;
    }));
  };

  const handleToggleOrderPrep = (roleId: string, val: boolean) => {
    setRoles(prev => prev.map(role => {
      if (role.id === roleId) return { ...role, inOrderPrep: val };
      return role;
    }));
  };

  const handleSaveRoleConfig = async (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;
    try {
      await api.users.updateRole(roleId, {
        permissions: role.permissions,
        exclude_from_attendance: role.excludeFromAttendance,
        in_order_prep: role.inOrderPrep,
      });
      const btn = document.getElementById('save-role-btn');
      if (btn) {
          btn.textContent = 'SAVED';
          btn.classList.add('bg-green-600', 'text-white');
          setTimeout(() => {
              btn.textContent = 'SAVE CONFIGURATION';
              btn.classList.remove('bg-green-600', 'text-white');
          }, 2000);
      }
    } catch (err: any) {
      showError('Failed to update role: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const created = await api.users.createRole(newRoleName);
      setRoles(prev => [...prev, created]);
      setNewRoleName('');
      setIsAddingRole(false);
      setSelectedRole(created);
    } catch (err: any) {
      showError('Failed to create role: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      await api.users.deleteRole(roleId);
      setRoles(prev => prev.filter(r => r.id !== roleId));
      setSelectedRole(null);
    } catch (err: any) {
      showError('Failed to delete role: ' + (err?.message || 'Unknown error'));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-10">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">ADMINISTRATION › ACCESS CONTROL</p>
          <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface">ROLE ARCHITECTURE</h1>
          <p className="text-on-surface-variant text-sm mt-2">Define and orchestrate the permission matrix for all personnel archetypes.</p>
        </div>
        <button 
          onClick={() => setIsAddingRole(true)}
          className="px-6 py-3 bg-secondary text-on-secondary rounded text-[10px] font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add_moderator</span>
          CREATE NEW ROLE
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Roles List */}
        <div className="lg:col-span-1 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">Personnel Archetypes</p>
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden shadow-sm">
            {roles.map(role => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`w-full p-6 flex items-center justify-between transition-all border-b border-outline-variant/5 last:border-0 ${
                  selectedRole?.id === role.id ? 'bg-surface-container-high border-l-4 border-secondary' : 'hover:bg-surface-container-low'
                }`}
              >
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-bold uppercase tracking-wider ${selectedRole?.id === role.id ? 'text-secondary' : 'text-on-surface'}`}>
                      {role.name}
                    </p>
                    {role.isSystem && (
                      <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        SYSTEM
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-on-surface-variant uppercase tracking-widest mt-1">
                    {role.permissions.length} PERMISSIONS ACTIVE
                  </p>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant/40">chevron_right</span>
              </button>
            ))}
          </div>
        </div>

        {/* Permissions Matrix */}
        <div className="lg:col-span-2">
          {selectedRole ? (
            <div className="bg-surface-container rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden animate-in slide-in-from-right-8 duration-500">
              <div className="p-8 border-b border-outline-variant/10 bg-surface-container-low flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-headline font-extrabold text-on-surface uppercase tracking-tight">{selectedRole.name}</h3>
                    {selectedRole.isSystem && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                        SYSTEM ROLE
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">
                    {selectedRole.isSystem ? 'Read-only · Cannot be modified or deleted' : 'Permission Matrix Configuration'}
                  </p>
                </div>
                {!selectedRole.isSystem && (
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">ID: {selectedRole.id}</span>
                    <button
                      onClick={() => handleSaveRoleConfig(selectedRole.id)}
                      id="save-role-btn"
                      className="px-4 py-2 bg-on-surface text-surface rounded text-[10px] font-bold uppercase tracking-widest hover:bg-on-surface-variant transition-colors"
                    >
                      SAVE CONFIGURATION
                    </button>
                  </div>
                )}
              </div>

              <div className={`p-8 space-y-8 ${selectedRole.isSystem ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                {Array.from(new Set(allPermissions.map(p => p.group))).map(group => (
                  <div key={group}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-on-surface-variant mb-4 flex items-center gap-2">
                      <span className="block w-6 h-px bg-outline-variant/40" />
                      {group}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {allPermissions.filter(p => p.group === group).map(perm => {
                        const isActive = roles.find(r => r.id === selectedRole.id)?.permissions.includes(perm.id);
                        return (
                          <button
                            key={perm.id}
                            onClick={() => !selectedRole.isSystem && handleTogglePermission(selectedRole.id, perm.id)}
                            className={`p-5 rounded-2xl border-2 transition-all text-left flex items-start gap-4 group ${
                              isActive
                                ? 'border-secondary bg-secondary/5'
                                : 'border-outline-variant/10 bg-surface-container-lowest hover:border-outline-variant/30'
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              isActive ? 'bg-secondary text-on-secondary' : 'bg-surface-container-highest text-on-surface-variant group-hover:text-on-surface'
                            }`}>
                              <span className="material-symbols-outlined text-lg">
                                {isActive ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                            </div>
                            <div>
                              <p className={`text-sm font-bold uppercase tracking-wider mb-1 ${isActive ? 'text-secondary' : 'text-on-surface'}`}>
                                {perm.label}
                              </p>
                              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                                {perm.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Exclusion Toggle Section */}
              <div className={`mx-8 p-6 bg-surface-container-highest/20 rounded-2xl border border-outline-variant/10 ${selectedRole.isSystem ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
                      <span className="material-symbols-outlined">person_off</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-on-surface">Exclude from Attendance</p>
                      <p className="text-[10px] text-on-surface-variant">Hide personnel with this role from the kiosk clock-in screen.</p>
                    </div>
                  </div>
                  <Switch
                    enabled={roles.find(r => r.id === selectedRole.id)?.excludeFromAttendance || false}
                    onChange={(val) => !selectedRole.isSystem && handleToggleAttendanceExclude(selectedRole.id, val)}
                  />
                </div>
              </div>

              {/* Order Preparation Toggle Section */}
              <div className={`mx-8 p-6 bg-surface-container-highest/20 rounded-2xl border border-outline-variant/10 ${selectedRole.isSystem ? 'opacity-50 pointer-events-none select-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
                      <span className="material-symbols-outlined">cooking</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wider text-on-surface">Order Preparation</p>
                      <p className="text-[10px] text-on-surface-variant">Show personnel with this role in the cook/assistant assignment menus.</p>
                    </div>
                  </div>
                  <Switch
                    enabled={roles.find(r => r.id === selectedRole.id)?.inOrderPrep ?? true}
                    onChange={(val) => !selectedRole.isSystem && handleToggleOrderPrep(selectedRole.id, val)}
                  />
                </div>
              </div>

              <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex justify-between items-center">
                <p className="text-[10px] text-on-surface-variant italic">
                  {selectedRole.isSystem
                    ? '* System roles are managed by the platform and cannot be modified.'
                    : '* Changes are applied in real-time to all personnel assigned to this archetype.'}
                </p>
                {!selectedRole.isSystem && (
                  <div className="flex gap-4">
                    <button onClick={() => handleDeleteRole(selectedRole.id)} className="px-6 py-3 bg-error/10 text-error rounded text-[10px] font-bold uppercase tracking-widest hover:bg-error/20 transition-colors">
                      DELETE ROLE
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] bg-surface-container rounded-2xl border border-outline-variant/10 border-dashed flex flex-col items-center justify-center text-center p-12">
              <div className="w-20 h-20 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant/40 mb-6">
                <span className="material-symbols-outlined text-4xl">admin_panel_settings</span>
              </div>
              <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight mb-2">Select an Archetype</h3>
              <p className="text-on-surface-variant text-sm max-w-xs">
                Select a role from the left to view and modify its operational permission matrix.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Role Modal */}
      <AnimatePresence>
        {isAddingRole && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingRole(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-surface-container rounded-3xl border border-outline-variant/20 shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-outline-variant/10 bg-surface-container-low">
                <h2 className="text-2xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Create Archetype</h2>
                <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Define a new personnel role</p>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">Archetype Name</label>
                  <input 
                    type="text" 
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value)}
                    placeholder="e.g. Floor Manager"
                    className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-6 py-4 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold"
                    autoFocus
                  />
                </div>
                <div className="bg-secondary/5 p-6 rounded-2xl border border-secondary/10">
                  <p className="text-[10px] text-secondary font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">info</span>
                    System Note
                  </p>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed">
                    New roles are created with zero permissions by default. You will need to configure the permission matrix after creation.
                  </p>
                </div>
              </div>
              <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex justify-end gap-4">
                <button 
                  onClick={() => setIsAddingRole(false)}
                  className="px-6 py-3 bg-surface-container-highest text-on-surface rounded text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleAddRole}
                  disabled={!newRoleName.trim()}
                  className="px-6 py-3 bg-secondary text-on-secondary rounded text-[10px] font-bold uppercase tracking-widest hover:bg-[#ffc4b8] disabled:opacity-30 transition-colors"
                >
                  CREATE ROLE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AddUsageModal = ({ onClose, ingredients, onSuccess }: { onClose: () => void, ingredients: IngredientItem[], onSuccess?: () => void }) => {
  const [selectedIngredient, setSelectedIngredient] = useState(ingredients[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Service');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!selectedIngredient || !amount) return;
    setIsLoading(true);
    try {
      await api.inventory.logUsage({ ingredient_id: selectedIngredient, quantity: parseFloat(amount), unit: ingredients.find(i => i.id === selectedIngredient)?.unit || '', reason });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) { setError(err.message || 'Failed.'); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Add Usage</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Deduct stock from active inventory</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingredient</label>
            <select 
              value={selectedIngredient}
              onChange={e => setSelectedIngredient(e.target.value)}
              className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
            >
              {ingredients.map(ing => (
                <option key={ing.id} value={ing.id}>{ing.name} ({ing.inStock}{ing.unit} avail.)</option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Amount to Deduct</label>
            <div className="relative">
              <input 
                type="number" 
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {ingredients.find(i => i.id === selectedIngredient)?.unit}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Reason for Deduction</label>
            <div className="grid grid-cols-2 gap-4">
              {['Service', 'Waste', 'Staff Meal', 'Spoilage'].map(r => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    reason === r 
                      ? 'bg-secondary/10 border-secondary/50 text-secondary' 
                      : 'bg-surface-container-highest border-outline-variant/10 text-on-surface-variant hover:border-secondary/30'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest">{r}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 py-4 bg-secondary text-on-secondary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-secondary/20"
          >
            {isLoading ? 'Saving...' : 'Confirm Usage'}
          </button>
        </div>
      </div>
    </div>
  );
};

const LogPurchaseModal = ({ onClose, ingredients, onSuccess }: { onClose: () => void, ingredients: IngredientItem[], onSuccess?: () => void }) => {
  const { localization } = useLocalization();
  const [selectedIngredient, setSelectedIngredient] = useState(ingredients[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLog = async () => {
    if (!selectedIngredient || !amount || !vendor) return;
    setIsLoading(true);
    try {
      await api.inventory.logPurchase({ ingredient_id: selectedIngredient, vendor, quantity: parseFloat(amount), unit: ingredients.find(i => i.id === selectedIngredient)?.unit || '', total_cost: parseFloat(cost) || 0 });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) { setError(err.message || 'Failed.'); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Log Purchase</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Record new stock acquisition</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Vendor Name</label>
            <input 
              type="text" 
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              placeholder="e.g. Tsukiji Market Express"
              className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingredient</label>
            <select 
              value={selectedIngredient}
              onChange={e => setSelectedIngredient(e.target.value)}
              className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
            >
              {ingredients.map(ing => (
                <option key={ing.id} value={ing.id}>{ing.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Quantity</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {ingredients.find(i => i.id === selectedIngredient)?.unit}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Cost</label>
              <div className="relative">
                <CurrencySymbol />
                <input 
                  type="number" 
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  placeholder="0.00"
                  className={`w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl py-4 text-sm text-on-surface focus:border-primary outline-none transition-all ${localization.currencyPosition === 'left' ? (localization.currency.length > 2 ? 'pl-16 pr-6' : 'pl-12 pr-6') : (localization.currency.length > 2 ? 'pr-16 pl-6' : 'pr-12 pl-6')}`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleLog}
            disabled={isLoading}
            className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
          >
            {isLoading ? 'Saving...' : 'Log Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CreateIngredientModal = ({ onClose, onCreated, ingredient }: { onClose: () => void, onCreated?: () => void, ingredient?: IngredientItem }) => {
  const { localization } = useLocalization();
  const [name, setName] = useState(ingredient?.name || '');
  const [sku, setSku] = useState(ingredient?.sku || '');
  const [category, setCategory] = useState(ingredient?.category?.join(', ') || '');
  const [unit, setUnit] = useState(ingredient?.unit || 'kg');
  const [price, setPrice] = useState(ingredient?.pricePerUnit?.toString() || '');
  const [capacity, setCapacity] = useState(ingredient?.capacity?.toString() || '');
  const [inStock, setInStock] = useState(ingredient?.inStock?.toString() || '0');
  const [minStock, setMinStock] = useState(ingredient?.minStock?.toString() || '0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name || !sku || !unit || !capacity) { setError('Name, SKU, unit, capacity required.'); return; }
    setIsLoading(true);
    try {
      if (ingredient) {
        await api.inventory.updateIngredient(ingredient.id, { name, sku, category: category ? category.split(',').map(s => s.trim().toUpperCase()) : undefined, unit, capacity: parseFloat(capacity), price_per_unit: parseFloat(price) || 0, in_stock: parseFloat(inStock) || 0, min_stock: parseFloat(minStock) || 0 });
      } else {
        await api.inventory.createIngredient({ name, sku, category: category ? category.split(',').map(s => s.trim().toUpperCase()) : [], unit, capacity: parseFloat(capacity), price_per_unit: parseFloat(price) || 0, in_stock: parseFloat(inStock) || 0, min_stock: parseFloat(minStock) || 0 });
      }
      if (onCreated) onCreated();
      onClose();
    } catch (err: any) { setError(err.message || 'Failed.'); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">{ingredient ? 'Edit Ingredient' : 'New Ingredient'}</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">{ingredient ? 'Modify ingredient data' : 'Initialize master data for a new stock item'}</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Ingredient Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Uni (Sea Urchin)"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">SKU / ID</label>
              <input 
                type="text" 
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="e.g. SF-UNI-01"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Category</label>
              <input 
                type="text" 
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. SEAFOOD"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Storage Unit</label>
              <select 
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
              >
                <option value="kg">Kilograms (kg)</option>
                <option value="g">Grams (g)</option>
                <option value="l">Liters (l)</option>
                <option value="ml">Milliliters (ml)</option>
                <option value="pcs">Pieces (pcs)</option>
                <option value="box">Boxes (box)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Avg. Unit Price</label>
              <div className="relative">
                <CurrencySymbol />
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  className={`w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl py-4 text-sm text-on-surface focus:border-primary outline-none transition-all ${localization.currencyPosition === 'left' ? (localization.currency.length > 2 ? 'pl-16 pr-6' : 'pl-12 pr-6') : (localization.currency.length > 2 ? 'pr-16 pl-6' : 'pr-12 pl-6')}`}
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Storage Capacity</label>
              <div className="relative">
                <input
                  type="number"
                  value={capacity}
                  onChange={e => setCapacity(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{unit}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Current Stock</label>
              <div className="relative">
                <input
                  type="number"
                  value={inStock}
                  onChange={e => setInStock(e.target.value)}
                  placeholder="0"
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{unit}</span>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Low Stock Alert At</label>
              <div className="relative">
                <input
                  type="number"
                  value={minStock}
                  onChange={e => setMinStock(e.target.value)}
                  placeholder="0"
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{unit}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading}
            className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
          >
            {isLoading ? 'Saving...' : ingredient ? 'Save Changes' : 'Create Ingredient'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const InventoryView = () => {
  const { formatCurrency } = useLocalization();
  const [isAddUsageOpen, setIsAddUsageOpen] = useState(false);
  const [isLogPurchaseOpen, setIsLogPurchaseOpen] = useState(false);
  const [isCreateIngredientOpen, setIsCreateIngredientOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientItem | null>(null);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [deliveries, setDeliveries] = useState<PurchaseLog[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'Healthy' | 'Low' | 'Critical'>('all');

  const loadData = useCallback(() => {
    api.inventory.listIngredients().then(setIngredients).catch(console.error);
    api.inventory.listPurchases().then(setDeliveries).catch(console.error);
    api.inventory.listUsage().then(setUsageLogs).catch(console.error);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    return zenWs.onEvent(e => {
      if (e.type === 'ingredient_update') loadData();
    });
  }, [loadData]);

  const handleDeleteIngredient = async (id: string) => {
    try {
      await api.inventory.deleteIngredient(id);
      loadData();
    } catch(err) { showError('Failed to delete ingredient: ' + ((err as any)?.message || 'Unknown error')); }
  };

  const totalValue = ingredients.reduce((acc, item) => acc + (item.inStock * item.pricePerUnit), 0);
  const lowStockCount = ingredients.filter(item => item.stockLevel === 'Critical' || item.stockLevel === 'Low').length;

  const monthlySpend = deliveries.reduce((acc, d) => {
    const dDate = new Date(d.date);
    const now = new Date();
    if (dDate.getMonth() === now.getMonth() && dDate.getFullYear() === now.getFullYear()) {
      return acc + d.totalCost;
    }
    return acc;
  }, 0);

  // Real health data computed from actual ingredients
  const total = ingredients.length || 1;
  const healthyCount = ingredients.filter(i => i.stockLevel === 'Healthy').length;
  const lowCount = ingredients.filter(i => i.stockLevel === 'Low').length;
  const criticalCount = ingredients.filter(i => i.stockLevel === 'Critical').length;
  const healthScore = total > 1 ? Math.round((healthyCount / ingredients.length) * 100) : 100;
  const healthData = [
    { name: 'Healthy', value: Math.round((healthyCount / total) * 100), color: 'var(--color-tertiary)' },
    { name: 'Low Stock', value: Math.round((lowCount / total) * 100), color: 'var(--color-secondary)' },
    { name: 'Critical', value: Math.round((criticalCount / total) * 100), color: 'var(--color-error)' },
  ];

  const filteredIngredients = ingredients.filter(item => {
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.sku.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStock = stockFilter === 'all' || item.stockLevel === stockFilter;
    return matchesSearch && matchesStock;
  });

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-grid-pattern">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Purchases & Inventory</h1>
            <p className="text-on-surface-variant text-sm">Manage stocks and track consumption with architectural precision.</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setIsCreateIngredientOpen(true)}
              className="px-6 py-3 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">inventory_2</span>
              NEW INGREDIENT
            </button>
            <button 
              onClick={() => setIsAddUsageOpen(true)}
              className="px-6 py-3 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">add_circle</span>
              ADD USAGE
            </button>
            <button 
              onClick={() => setIsLogPurchaseOpen(true)}
              className="px-6 py-3 bg-secondary text-on-secondary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-secondary/20"
            >
              <span className="material-symbols-outlined text-sm">local_shipping</span>
              LOG PURCHASE
            </button>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-surface-container p-8 rounded-2xl border border-outline-variant/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Total Value</p>
            <p className="text-3xl font-headline font-extrabold text-on-surface mb-2">{formatCurrency(totalValue)}</p>
            <p className="text-[10px] font-bold text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">inventory_2</span>
              Across {ingredients.length} ingredients
            </p>
          </div>

          <div className="bg-surface-container p-8 rounded-2xl border border-secondary/30 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-secondary">
              <span className="material-symbols-outlined text-4xl">warning</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Action Required</p>
            <p className="text-5xl font-headline font-extrabold text-secondary mb-2">{lowStockCount.toString().padStart(2, '0')}</p>
            <p className="text-[10px] font-bold text-on-surface-variant">Low Stock Alerts</p>
          </div>

          <div className="bg-surface-container p-8 rounded-2xl border border-outline-variant/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-tertiary">
              <span className="material-symbols-outlined text-4xl">restaurant</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Active Items</p>
            <p className="text-3xl font-headline font-extrabold text-on-surface mb-2">{ingredients.filter(i => i.isActive).length}</p>
            <p className="text-[10px] font-bold text-on-surface-variant">Used in daily production</p>
          </div>

          <div className="bg-surface-container p-8 rounded-2xl border border-outline-variant/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-primary">
              <span className="material-symbols-outlined text-4xl">payments</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Monthly Spending</p>
            <p className="text-3xl font-headline font-extrabold text-on-surface mb-2">{formatCurrency(monthlySpend)}</p>
            <p className="text-[10px] font-bold text-on-surface-variant">Current month purchases</p>
          </div>
        </div>


        {/* Manifest Section */}
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 overflow-hidden mb-10">
          <div className="p-8 border-b border-outline-variant/10 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/50">
            <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Ingredient Manifest</h3>
            <div className="flex flex-wrap gap-3 items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name or SKU…"
                className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all w-48"
              />
              {(['all', 'Healthy', 'Low', 'Critical'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStockFilter(f)}
                  className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${stockFilter === f ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                >{f === 'all' ? 'All' : f}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low/30">
                  <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Ingredient</th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">SKU</th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Category</th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">In Stock / Capacity</th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Stock Level</th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-right">Unit Price</th>
                  <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {filteredIngredients.length === 0 && (
                  <tr><td colSpan={7} className="px-8 py-12 text-center text-on-surface-variant text-sm">No ingredients match the current filter.</td></tr>
                )}
                {filteredIngredients.map((item, idx) => (
                  <tr key={idx} className="hover:bg-surface-container-high/50 transition-colors group">
                    <td className="px-8 py-6">
                      <p className="font-bold text-on-surface">{item.name}</p>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">{item.sku}</p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-wrap gap-2">
                        {item.category.map((cat, cIdx) => (
                          <span key={cIdx} className="text-[8px] font-bold uppercase tracking-widest px-2 py-1 bg-surface-container-highest text-on-surface-variant rounded-md">
                            {cat}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-on-surface">{item.inStock} {item.unit} /</p>
                      <p className="text-[10px] text-on-surface-variant">{item.capacity} {item.unit}</p>
                      {item.minStock > 0 && item.inStock <= item.minStock && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[8px] font-bold uppercase tracking-widest text-secondary bg-secondary/10 px-2 py-0.5 rounded-full">
                          <span className="material-symbols-outlined text-[10px]">warning</span>
                          Low Stock
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-6 min-w-[200px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-on-surface-variant">{item.levelPct}%</span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${
                          item.stockLevel === 'Critical' ? 'text-secondary' :
                          item.stockLevel === 'Low' ? 'text-orange-400' : 'text-on-surface-variant'
                        }`}>{item.stockLevel}</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${
                            item.stockLevel === 'Critical' ? 'bg-secondary' :
                            item.stockLevel === 'Low' ? 'bg-orange-400' : 'bg-on-surface-variant'
                          }`}
                          style={{ width: `${item.levelPct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-sm font-bold text-on-surface">{formatCurrency(item.pricePerUnit)}/{item.unit}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setEditingIngredient(item)}
                          className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all hover:text-secondary"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <button 
                          onClick={() => setConfirmDelete({ id: item.id, name: item.name })}
                          className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center text-error hover:bg-error/20 transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-6 bg-surface-container-low/30 border-t border-outline-variant/10 flex items-center justify-between">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Showing {filteredIngredients.length} of {ingredients.length} items
            </p>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Deliveries + Usage Logs */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-surface-container rounded-3xl border border-outline-variant/10 p-8">
              <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight mb-6">Recent Deliveries</h3>
              {deliveries.length === 0 && <p className="text-sm text-on-surface-variant">No purchase logs yet.</p>}
              <div className="space-y-3">
                {deliveries.slice(0, 8).map((delivery, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/5 hover:border-secondary/20 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-tertiary/10 text-tertiary flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-sm">local_shipping</span>
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-sm">{delivery.ingredientName || '—'}</p>
                        <p className="text-[10px] text-on-surface-variant">{delivery.vendor} · {delivery.date} · +{delivery.quantity} {delivery.unit}</p>
                      </div>
                    </div>
                    <p className="text-sm font-headline font-extrabold text-tertiary">+{formatCurrency(delivery.totalCost)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface-container rounded-3xl border border-outline-variant/10 p-8">
              <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight mb-6">Recent Usage</h3>
              {usageLogs.length === 0 && <p className="text-sm text-on-surface-variant">No usage logs yet. Stock is decremented automatically when orders are marked Done.</p>}
              <div className="space-y-3">
                {usageLogs.slice(0, 8).map((log, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/5 hover:border-error/20 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-error/10 text-error flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-sm">remove_circle</span>
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-sm">{log.ingredientName || '—'}</p>
                        <p className="text-[10px] text-on-surface-variant">{log.reason} · {log.date}</p>
                      </div>
                    </div>
                    <p className="text-sm font-headline font-extrabold text-error">−{log.quantity} {log.unit}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Inventory Health Score */}
          <div className="bg-surface-container rounded-3xl border border-outline-variant/10 p-8 flex flex-col items-center text-center">
            <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight mb-8">Inventory Health Score</h3>
            <div className="relative w-48 h-48 mb-8">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={healthData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {healthData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-4xl font-headline font-extrabold text-on-surface">{healthScore}</p>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${healthScore >= 80 ? 'text-tertiary' : healthScore >= 50 ? 'text-secondary' : 'text-error'}`}>
                  {healthScore >= 80 ? 'OPTIMAL' : healthScore >= 50 ? 'WARNING' : 'CRITICAL'}
                </p>
              </div>
            </div>
            <div className="w-full space-y-3">
              {healthData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{item.name}</span>
                  </div>
                  <span className="text-[10px] font-bold text-on-surface">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {isAddUsageOpen && <AddUsageModal ingredients={ingredients} onClose={() => setIsAddUsageOpen(false)} onSuccess={loadData} />}

        {isLogPurchaseOpen && <LogPurchaseModal ingredients={ingredients} onClose={() => setIsLogPurchaseOpen(false)} onSuccess={loadData} />}

        {isCreateIngredientOpen && <CreateIngredientModal onClose={() => setIsCreateIngredientOpen(false)} onCreated={loadData} />}
        {editingIngredient && <CreateIngredientModal ingredient={editingIngredient} onClose={() => setEditingIngredient(null)} onCreated={loadData} />}
        {confirmDelete && (
          <ConfirmModal
            title="Delete Ingredient"
            message={`Are you sure you want to delete "${confirmDelete.name}"? This action cannot be undone.`}
            onConfirm={() => handleDeleteIngredient(confirmDelete.id)}
            onClose={() => setConfirmDelete(null)}
          />
        )}
      </div>
    </div>
  );
};

const CategoryModal = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState('');
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmCatDelete, setConfirmCatDelete] = useState<{ id: string; name: string } | null>(null);

  const loadCategories = () => {
    api.products.listCategories().then(setCategories).catch(console.error);
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await api.products.createCategory(name.trim());
      setName('');
      loadCategories();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.products.deleteCategory(id);
      loadCategories();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500 max-h-[85vh]">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low shrink-0">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Categories</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Manage product categories</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto flex-1">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="New category name..."
              className="flex-1 bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
            />
            <button 
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="px-6 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          <div className="space-y-2 mt-4 border-t border-outline-variant/10 pt-4">
            {categories.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-surface-container-highest/30 border border-outline-variant/10 rounded-xl p-3">
                <span className="text-sm font-bold text-on-surface ml-3">{c.name}</span>
                <button 
                  onClick={() => setConfirmCatDelete({ id: c.id, name: c.name })}
                  className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-all flex items-center justify-center shrink-0"
                  title="Delete Category"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-center py-4 text-[10px] text-on-surface-variant uppercase tracking-widest italic my-4">No categories created yet</p>
            )}
          </div>
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex gap-4 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-4 bg-surface-container-highest text-on-surface rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
          >
            Done
          </button>
        </div>
        {confirmCatDelete && (
          <ConfirmModal
            title="Delete Category"
            message={`Are you sure you want to delete "${confirmCatDelete.name}"?`}
            onConfirm={() => handleDelete(confirmCatDelete.id)}
            onClose={() => setConfirmCatDelete(null)}
          />
        )}
      </div>
    </div>
  );
};

const ProductModal = ({ product, onClose, onSaved }: { product?: Product, onClose: () => void, onSaved?: (saved: Product) => void }) => {
  const { localization } = useLocalization();
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(product?.price?.toString() || '');
  const [category, setCategory] = useState(product?.category || '');
  const [image, setImage] = useState(product?.image || '');
  const [variations, setVariations] = useState<any[]>(product?.variations || []);
    const [supplements, setSupplements] = useState<any[]>(product?.supplements || []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(product?.ingredients || []);
  const [apiCategories, setApiCategories] = useState<string[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<{id: string; name: string; unit: string}[]>([]);
  const [inStock, setInStock] = useState(product?.inStock !== false);
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    api.products.listCategories().then(cats => setApiCategories(cats.map(c => c.name))).catch(console.error);
    api.inventory.listIngredients().then(ings => setAvailableIngredients(ings.map(i => ({ id: i.id, name: i.name, unit: i.unit })))).catch(console.error);
  }, []);

  const [imageUploadError, setImageUploadError] = useState('');
  const [formError, setFormError] = useState('');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    setImageUploadError('');
    try {
      const { url } = await api.settings.uploadFile(file);
      setImage(url);
    } catch (err: any) {
      setImageUploadError(err?.message || 'Upload failed — check BunnyNet settings or try again.');
    } finally {
      setImageUploading(false);
    }
  };

  const addVariationGroup = () => {
    setVariations([...variations, { id: crypto.randomUUID(), name: '', options: [] }]);
  };

  const updateGroupName = (index: number, name: string) => {
    const newVars = [...variations];
    newVars[index].name = name;
    setVariations(newVars);
  };

  const removeGroup = (index: number) => {
    setVariations(variations.filter((_, i) => i !== index));
  };

  const addOption = (groupIndex: number) => {
    const newVars = [...variations];
    newVars[groupIndex].options.push({ id: crypto.randomUUID(), name: '', price: 0 });
    setVariations(newVars);
  };

  const updateOptionName = (groupIndex: number, optionIndex: number, name: string) => {
    const newVars = [...variations];
    newVars[groupIndex].options[optionIndex].name = name;
    setVariations(newVars);
  };

  const updateOptionPrice = (groupIndex: number, optionIndex: number, price: string) => {
    const newVars = [...variations];
    newVars[groupIndex].options[optionIndex].price = parseFloat(price) || 0;
    setVariations(newVars);
  };

  const addSupplementGroup = () => {
    setSupplements([...supplements, { id: crypto.randomUUID(), name: '', options: [] }]);
  };

  const updateSupplementGroupName = (index: number, name: string) => {
    const newSupps = [...supplements];
    newSupps[index].name = name;
    setSupplements(newSupps);
  };

  const removeSupplementGroup = (index: number) => {
    setSupplements(supplements.filter((_, i) => i !== index));
  };

  const addSupplementOption = (groupIndex: number) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options.push({ id: crypto.randomUUID(), name: '', priceAdjustment: 0 });
    setSupplements(newSupps);
  };

  const updateSupplementOptionName = (groupIndex: number, optionIndex: number, name: string) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options[optionIndex].name = name;
    setSupplements(newSupps);
  };

  const updateSupplementOptionPrice = (groupIndex: number, optionIndex: number, price: string) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options[optionIndex].priceAdjustment = parseFloat(price) || 0;
    setSupplements(newSupps);
  };

  const removeSupplementOption = (groupIndex: number, optionIndex: number) => {
    const newSupps = [...supplements];
    newSupps[groupIndex].options = newSupps[groupIndex].options.filter((_, i) => i !== optionIndex);
    setSupplements(newSupps);
  };


  const removeOption = (groupIndex: number, optionIndex: number) => {
    const newVars = [...variations];
    newVars[groupIndex].options = newVars[groupIndex].options.filter((_, i) => i !== optionIndex);
    setVariations(newVars);
  };

  const selectIngredient = (index: number, ingredientId: string) => {
    const found = availableIngredients.find(i => i.id === ingredientId);
    if (!found) return;
    const newIngs = [...ingredients];
    newIngs[index] = { ...newIngs[index], id: found.id, name: found.name, unit: found.unit };
    setIngredients(newIngs);
  };

  const selectOptionIngredient = (groupIndex: number, optionIndex: number, ingIndex: number, ingredientId: string) => {
    const found = availableIngredients.find(i => i.id === ingredientId);
    if (!found) return;
    const newVars = [...variations];
    const opt = newVars[groupIndex].options[optionIndex];
    if (opt.ingredients) {
      opt.ingredients[ingIndex] = { ...opt.ingredients[ingIndex], id: found.id, name: found.name, unit: found.unit };
    }
    setVariations(newVars);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { id: '', name: '', amount: 0, unit: 'g' }]);
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: any) => {
    const newIngs = [...ingredients];
    newIngs[index] = { ...newIngs[index], [field]: value };
    setIngredients(newIngs);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const addOptionIngredient = (groupIndex: number, optionIndex: number) => {
    const newVars = [...variations];
    const option = newVars[groupIndex].options[optionIndex];
    if (!option.ingredients) option.ingredients = [];
    option.ingredients.push({ id: '', name: '', amount: 0, unit: 'g' });
    setVariations(newVars);
  };

  const updateOptionIngredient = (groupIndex: number, optionIndex: number, ingIndex: number, field: keyof Ingredient, value: any) => {
    const newVars = [...variations];
    const option = newVars[groupIndex].options[optionIndex];
    if (option.ingredients) {
      option.ingredients[ingIndex] = { ...option.ingredients[ingIndex], [field]: value };
    }
    setVariations(newVars);
  };

  const removeOptionIngredient = (groupIndex: number, optionIndex: number, ingIndex: number) => {
    const newVars = [...variations];
    const option = newVars[groupIndex].options[optionIndex];
    if (option.ingredients) {
      option.ingredients = option.ingredients.filter((_, i) => i !== ingIndex);
    }
    setVariations(newVars);
  };

  const handleSave = async () => {
    setFormError('');
    if (!name.trim()) { setFormError('Product name is required.'); return; }
    if (!category) { setFormError('Please select a category.'); return; }
    const parsedPrice = parseFloat(price);
    const hasVariations = variations.length > 0 && variations.some((vg: any) => vg.options.length > 0);
    if (!hasVariations && (isNaN(parsedPrice) || parsedPrice < 0)) { setFormError('Please enter a valid price.'); return; }

    // Skip base64 images — they are legacy DB values and will fail the backend validator.
    // Omitting the field in PATCH leaves the existing DB value unchanged.
    const safeImage = image && !image.startsWith('data:') ? image : (image === '' ? '' : undefined);
    const mapIng = (ing: any) => ({ id: ing.id, name: ing.name, amount: ing.amount || 0, unit: ing.unit || 'g', waste_percent: ing.wastePercent ?? ing.waste_percent ?? null });

    // Auto-calculate base price from variations if present
    let finalPrice = parsedPrice || 0;
    if (hasVariations) {
      const allPrices = variations.flatMap((vg: any) => vg.options.map((o: any) => o.price || 0)).filter((p: number) => p > 0);
      if (allPrices.length > 0) {
        finalPrice = Math.min(...allPrices);
      }
    }

    const payload = {
      name: name.trim(), description, price: finalPrice, category, image: safeImage,
      in_stock: inStock,
      ingredients: ingredients.filter(i => i.id).map(mapIng),
      variations: variations.map(vg => ({ id: vg.id, name: vg.name, options: vg.options.map((o: any) => ({ id: o.id, name: o.name, price: o.price || 0, ingredients: (o.ingredients || []).map(mapIng) })) })),
      supplements: supplements.map(sg => ({ id: sg.id, name: sg.name, options: sg.options.map((o: any) => ({ id: o.id, name: o.name, price_adjustment: o.priceAdjustment ?? o.price_adjustment ?? 0, ingredients: (o.ingredients || []).map(mapIng) })) })),
    };
    try {
      const saved = product
        ? await api.products.updateProduct(product.id, payload)
        : await api.products.createProduct(payload);
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || 'Failed to save product. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500 max-h-[90vh]">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low shrink-0">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">{product ? 'Edit Product' : 'New Product'}</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">{product ? 'Update product details' : 'Add a new item to the menu'}</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto">
          {/* Image Upload */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Product Image</label>
            <div className="relative h-48 border-2 border-dashed border-outline-variant/30 rounded-2xl flex flex-col items-center justify-center text-center hover:bg-surface-container-highest/50 transition-colors cursor-pointer overflow-hidden group">
              {imageUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
                  <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">Uploading…</p>
                </div>
              ) : image ? (
                <>
                  <img src={image} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                  <div className="relative z-10 bg-black/60 p-3 rounded-xl backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center">
                    <span className="material-symbols-outlined text-white mb-1">image</span>
                    <p className="text-[10px] text-white font-bold uppercase tracking-widest">Change Image</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">cloud_upload</span>
                  <p className="text-sm font-bold text-on-surface">Drag & drop an image here</p>
                  <p className="text-xs text-on-surface-variant mt-1">or click to browse</p>
                </>
              )}
              <input type="file" accept="image/*" disabled={imageUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 disabled:cursor-not-allowed" onChange={handleImageUpload} />
            </div>
            {imageUploadError && (
              <p className="text-xs text-red-400 font-medium mt-1">{imageUploadError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Product Name</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Spicy Tuna Roll"
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
              >
                <option value="">Select a category…</option>
                {apiCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {(() => {
            const hasVariations = variations.length > 0 && variations.some((vg: any) => vg.options.length > 0);
            const allPrices = variations.flatMap((vg: any) => vg.options.map((o: any) => o.price || 0)).filter((p: number) => p > 0);
            const minPrice = allPrices.length ? Math.min(...allPrices) : null;
            const maxPrice = allPrices.length ? Math.max(...allPrices) : null;
            const sym = localization.currency || '';
            const left = localization.currencyPosition === 'left';
            const priceRangeLabel = minPrice !== null
              ? minPrice === maxPrice
                ? left ? `${sym} ${minPrice}` : `${minPrice} ${sym}`
                : left ? `${sym} ${minPrice} – ${sym} ${maxPrice}` : `${minPrice} – ${maxPrice} ${sym}`
              : null;
            return (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                    {hasVariations ? 'Price Range' : 'Base Price'}
                  </label>
                  {hasVariations ? (
                    <div className="w-full bg-surface-container-highest border border-outline-variant/10 rounded-2xl px-6 py-4 text-sm text-on-surface-variant flex items-center gap-2 opacity-60">
                      <span className="material-symbols-outlined text-[16px]">lock</span>
                      {priceRangeLabel ?? 'Set prices on each variation option'}
                    </div>
                  ) : (
                    <div className="relative">
                      <CurrencySymbol />
                      <input
                        type="number"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        placeholder="0.00"
                        className={`w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl py-4 text-sm text-on-surface focus:border-primary outline-none transition-all ${localization.currencyPosition === 'left' ? (localization.currency.length > 2 ? 'pl-16 pr-6' : 'pl-12 pr-6') : (localization.currency.length > 2 ? 'pr-16 pl-6' : 'pr-12 pl-6')}`}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* In-Stock Toggle */}
          <div className="flex items-center justify-between bg-surface-container-highest/30 border border-outline-variant/20 rounded-2xl px-6 py-4">
            <div>
              <p className="text-sm font-bold text-on-surface">Available in Stock</p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5">Uncheck to mark as unavailable on the menu</p>
            </div>
            <div 
              onClick={() => setInStock(v => !v)}
              className={`relative w-11 h-6 rounded-full cursor-pointer transition-all duration-300 ring-4 ring-transparent ${inStock ? 'bg-secondary' : 'bg-surface-container-highest border border-outline-variant/30'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-300 shadow-md ${inStock ? 'translate-x-6 bg-white' : 'translate-x-1 bg-on-surface-variant/40'}`} />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Product description..."
              className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all h-24 resize-none"
            />
          </div>

          {/* Base Ingredients */}
          <div className="space-y-4 pt-4 border-t border-outline-variant/10">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-on-surface">Base Ingredients</h3>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Ingredients included in the base product</p>
              </div>
              <button 
                type="button" 
                onClick={addIngredient}
                className="px-4 py-2 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Ingredient
              </button>
            </div>

            <div className="space-y-3">
              {ingredients.map((ing, iIndex) => (
                <div key={iIndex} className="flex gap-3 items-center">
                  <select
                    value={ing.id}
                    onChange={e => selectIngredient(iIndex, e.target.value)}
                    className="flex-1 bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
                  >
                    <option value="">Select ingredient…</option>
                    {availableIngredients.map(ai => (
                      <option key={ai.id} value={ai.id}>{ai.name}</option>
                    ))}
                  </select>
                  <div className="relative w-24 shrink-0">
                    <input 
                      type="number" 
                      value={ing.amount || ''} 
                      onChange={e => updateIngredient(iIndex, 'amount', parseFloat(e.target.value) || 0)} 
                      placeholder="Amount" 
                      className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all" 
                    />
                  </div>
                  <select 
                    value={ing.unit} 
                    onChange={e => updateIngredient(iIndex, 'unit', e.target.value)} 
                    className="w-20 bg-surface-container-highest border border-outline-variant/20 rounded-xl px-2 py-2 text-xs text-on-surface focus:border-primary outline-none transition-all"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="pcs">pcs</option>
                  </select>
                  <div className="relative w-24 shrink-0">
                    <input 
                      type="number" 
                      value={ing.wastePercent || ''} 
                      onChange={e => updateIngredient(iIndex, 'wastePercent', parseFloat(e.target.value) || 0)} 
                      placeholder="Waste %" 
                      className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all" 
                    />
                  </div>
                  <button 
                    onClick={() => removeIngredient(iIndex)}
                    className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-all flex items-center justify-center shrink-0"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
              {ingredients.length === 0 && (
                <p className="text-center py-4 text-[10px] text-on-surface-variant uppercase tracking-widest italic opacity-50">No base ingredients added</p>
              )}
            </div>
          </div>

          {/* Variations System */}
          <div className="space-y-4 pt-4 border-t border-outline-variant/10">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-on-surface">Variations</h3>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Add sizes, add-ons, or options</p>
              </div>
              <button 
                type="button" 
                onClick={addVariationGroup}
                className="px-4 py-2 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Group
              </button>
            </div>

            <div className="space-y-4">
              {variations.map((group, gIndex) => (
                <div key={group.id} className="bg-surface-container-highest/30 border border-outline-variant/20 rounded-2xl p-6 space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Group Name</label>
                      <input 
                        value={group.name} 
                        onChange={e => updateGroupName(gIndex, e.target.value)} 
                        placeholder="e.g. Size, Spice Level" 
                        className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all" 
                      />
                    </div>
                    <button 
                      onClick={() => removeGroup(gIndex)}
                      className="mt-6 w-10 h-10 rounded-xl bg-error/10 text-error flex items-center justify-center hover:bg-error/20 transition-all shrink-0"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>

                  <div className="space-y-3 pl-4 border-l-2 border-outline-variant/20">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block">Options</label>
                    {group.options.map((opt, oIndex) => (
                      <React.Fragment key={opt.id}>
                        <div className="flex gap-3 items-center">
                        <input 
                          value={opt.name} 
                          onChange={e => updateOptionName(gIndex, oIndex, e.target.value)} 
                          placeholder="Option Name (e.g. Large)" 
                          className="flex-1 bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all" 
                        />
                        <div className="relative w-32 shrink-0">
                          <CurrencySymbol />
                          <input 
                            type="number" 
                            value={opt.price || ''} 
                            onChange={e => updateOptionPrice(gIndex, oIndex, e.target.value)} 
                            placeholder="0.00" 
                            className={`w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all ${localization.currencyPosition === 'left' ? 'pl-8' : 'pr-8'}`} 
                          />
                        </div>
                        <button 
                          onClick={() => removeOption(gIndex, oIndex)}
                          className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-all flex items-center justify-center shrink-0"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>

                      {/* Option Ingredients */}
                      <div className="ml-4 space-y-2 mb-4">
                        <div className="flex justify-between items-center">
                          <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Option Ingredients</p>
                          <button 
                            type="button" 
                            onClick={() => addOptionIngredient(gIndex, oIndex)}
                            className="text-[9px] text-primary font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[12px]">add</span> Add Ingredient
                          </button>
                        </div>
                        {opt.ingredients?.map((ing: any, ingIndex: number) => (
                          <div key={ingIndex} className="flex gap-2 items-center">
                            <select
                              value={ing.id}
                              onChange={e => selectOptionIngredient(gIndex, oIndex, ingIndex, e.target.value)}
                              className="flex-1 bg-surface-container-highest/50 border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:border-primary outline-none transition-all"
                            >
                              <option value="">Select ingredient…</option>
                              {availableIngredients.map(ai => (
                                <option key={ai.id} value={ai.id}>{ai.name}</option>
                              ))}
                            </select>
                            <input 
                              type="number" 
                              value={ing.amount || ''} 
                              onChange={e => updateOptionIngredient(gIndex, oIndex, ingIndex, 'amount', parseFloat(e.target.value) || 0)} 
                              placeholder="Amt" 
                              className="w-16 bg-surface-container-highest/50 border border-outline-variant/10 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:border-primary outline-none transition-all" 
                            />
                            <select 
                              value={ing.unit} 
                              onChange={e => updateOptionIngredient(gIndex, oIndex, ingIndex, 'unit', e.target.value)} 
                              className="w-16 bg-surface-container-highest/50 border border-outline-variant/10 rounded-lg px-1 py-1.5 text-[10px] text-on-surface focus:border-primary outline-none transition-all"
                            >
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="l">l</option>
                              <option value="pcs">pcs</option>
                            </select>
                            <input 
                              type="number" 
                              value={ing.wastePercent || ''} 
                              onChange={e => updateOptionIngredient(gIndex, oIndex, ingIndex, 'wastePercent', parseFloat(e.target.value) || 0)} 
                              placeholder="W%" 
                              className="w-12 bg-surface-container-highest/50 border border-outline-variant/10 rounded-lg px-2 py-1.5 text-xs text-on-surface focus:border-primary outline-none transition-all" 
                            />
                            <button 
                              onClick={() => removeOptionIngredient(gIndex, oIndex, ingIndex)}
                              className="w-6 h-6 rounded-md text-on-surface-variant hover:text-error transition-all flex items-center justify-center shrink-0"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </React.Fragment>
                    ))}
                    <button 
                      onClick={() => addOption(gIndex)} 
                      className="text-[10px] text-primary uppercase font-bold tracking-widest hover:underline flex items-center gap-1 mt-2"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span> Add Option
                    </button>
                  </div>
                </div>
              ))}
              
              {variations.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-outline-variant/20 rounded-2xl">
                  <p className="text-sm text-on-surface-variant">No variations added yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Supplements System */}
          <div className="space-y-4 pt-4 border-t border-outline-variant/10">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-on-surface">Supplements</h3>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Extra items with additive pricing (e.g. Extra Egg +{CURRENCY_SYMBOLS[localization.currency] || localization.currency}1.50)</p>
              </div>
              <button 
                type="button" 
                onClick={addSupplementGroup}
                className="px-4 py-2 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Group
              </button>
            </div>

            <div className="space-y-4">
              {supplements.map((group, gIndex) => (
                <div key={group.id} className="bg-surface-container-highest/30 border border-outline-variant/20 rounded-2xl p-6 space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Group Name</label>
                      <input 
                        value={group.name} 
                        onChange={e => updateSupplementGroupName(gIndex, e.target.value)} 
                        placeholder="e.g. Extra Ingredients, Extras" 
                        className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all" 
                      />
                    </div>
                    <button 
                      onClick={() => removeSupplementGroup(gIndex)}
                      className="mt-6 w-10 h-10 rounded-xl bg-error/10 text-error flex items-center justify-center hover:bg-error/20 transition-all shrink-0"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>

                  <div className="space-y-3 pl-4 border-l-2 border-outline-variant/20">
                    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block">Options</label>
                    {group.options.map((opt, oIndex) => (
                      <div key={opt.id} className="flex gap-3 items-center">
                        <input 
                          value={opt.name} 
                          onChange={e => updateSupplementOptionName(gIndex, oIndex, e.target.value)} 
                          placeholder="Supplement Name (e.g. Extra Egg)" 
                          className="flex-1 bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all" 
                        />
                        <div className="relative w-32 shrink-0">
                          <CurrencySymbol prefix="+" />
                          <input 
                            type="number" 
                            value={opt.priceAdjustment || ''} 
                            onChange={e => updateSupplementOptionPrice(gIndex, oIndex, e.target.value)} 
                            placeholder="0.00" 
                            className={`w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all ${localization.currencyPosition === 'left' ? 'pl-10' : 'pr-10'}`} 
                          />
                        </div>
                        <button 
                          onClick={() => removeSupplementOption(gIndex, oIndex)}
                          className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-all flex items-center justify-center shrink-0"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => addSupplementOption(gIndex)} 
                      className="text-[10px] text-primary uppercase font-bold tracking-widest hover:underline flex items-center gap-1 mt-2"
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span> Add Option
                    </button>
                  </div>
                </div>
              ))}
              
              {supplements.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-outline-variant/20 rounded-2xl">
                  <p className="text-sm text-on-surface-variant">No supplements added yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 pb-2 bg-surface-container-low border-t border-outline-variant/10 shrink-0">
          {formError && (
            <p className="text-xs text-red-400 font-medium pt-4 text-center">{formError}</p>
          )}
        </div>
        <div className="px-8 pb-8 bg-surface-container-low flex gap-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={imageUploading}
            className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
          >
            {imageUploading ? 'Uploading image…' : product ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ProductManagementView = () => {
  const { formatCurrency } = useLocalization();
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [confirmProductDelete, setConfirmProductDelete] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const toggleProductSelect = (id: string) => {
    const next = new Set(selectedProductIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedProductIds(next);
  };
  const toggleSelectAllProducts = () => {
    if (selectedProductIds.size === products.length && products.length > 0) setSelectedProductIds(new Set());
    else setSelectedProductIds(new Set(products.map(p => p.id)));
  };
  const deleteSelectedProducts = async () => {
    const ids = Array.from(selectedProductIds);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api.products.deleteProduct(id);
        setProducts(prev => prev.filter(p => p.id !== id));
      } catch (err: any) {
        failed.push(id);
      }
    }
    setSelectedProductIds(new Set(failed));
    if (failed.length > 0) {
      alert(`Failed to delete ${failed.length} product(s). Check console for details.`);
    }
  };

  // Suppress WS-triggered reloads for 2s after a local save to avoid a redundant
  // round-trip that would overwrite the already-correct optimistic state.
  const skipWsReloadUntil = useRef(0);

  const loadProducts = useCallback(() => {
    Promise.all([
      api.products.listProducts(),
      api.products.listProductImages(),
    ]).then(([prods, images]) => {
      const map: Record<string, string> = {};
      images.forEach(i => { if (i.image) map[i.id] = i.image; });
      setProducts(prods.map(p => ({ ...p, image: map[p.id] ?? p.image })));
    }).catch(console.error);
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    return zenWs.onEvent(e => {
      if (e.type === 'product_update' && Date.now() > skipWsReloadUntil.current) loadProducts();
    });
  }, [loadProducts]);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Product Management</h1>
          <p className="text-on-surface-variant text-sm">Manage your menu items and categories.</p>
        </div>
        <div className="flex gap-4">
          {selectedProductIds.size > 0 && (
            <button
              onClick={() => setConfirmProductDelete(true)}
              className="px-6 py-3 bg-error/10 text-error rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-error/20 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              DELETE ({selectedProductIds.size})
            </button>
          )}
          <button 
            onClick={() => setIsAddCategoryOpen(true)}
            className="px-6 py-3 bg-surface-container-highest text-on-surface rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">category</span>
            ADD CATEGORY
          </button>
          <button 
            onClick={() => setIsAddProductOpen(true)}
            className="px-6 py-3 bg-secondary text-on-secondary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-secondary/20"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            ADD PRODUCT
          </button>
        </div>
      </div>

      <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-container-low/30">
              <th className="px-6 py-6 w-12 text-center">
                <input type="checkbox" checked={products.length > 0 && selectedProductIds.size === products.length} onChange={toggleSelectAllProducts} className="rounded text-secondary w-4 h-4 cursor-pointer" />
              </th>
              <th className="px-4 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-left">Product</th>
              <th className="px-4 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-left">Category</th>
              <th className="px-4 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-right">Price</th>
              <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-surface-container-high/50 transition-colors">
                <td className="px-6 py-6 text-center">
                  <input type="checkbox" checked={selectedProductIds.has(product.id)} onChange={() => toggleProductSelect(product.id)} className="rounded text-secondary w-4 h-4 cursor-pointer" />
                </td>
                <td className="px-4 py-6">
                  <div className="flex items-center gap-4">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-12 h-12 rounded-lg object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement | null)?.classList.remove('hidden'); }}
                      />
                    ) : null}
                    <div className={`w-12 h-12 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0 ${product.image ? 'hidden' : ''}`}>
                      <span className="material-symbols-outlined text-on-surface-variant text-sm">image</span>
                    </div>
                    <p className="font-bold text-on-surface">{product.name}</p>
                  </div>
                </td>
                <td className="px-4 py-6">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-surface-container-highest text-on-surface-variant rounded-md">
                    {product.category}
                  </span>
                </td>
                <td className="px-4 py-6 text-right font-bold text-on-surface">
                  {(() => {
                    const allPrices = (product.variations ?? [])
                      .flatMap(vg => vg.options.map(o => o.price ?? 0))
                      .filter(p => p > 0);
                    if (!allPrices.length) return formatCurrency(product.price);
                    const min = Math.min(...allPrices);
                    const max = Math.max(...allPrices);
                    return min === max ? formatCurrency(min) : `${formatCurrency(min)} – ${formatCurrency(max)}`;
                  })()}
                </td>
                <td className="px-8 py-6 text-right">
                  <button 
                    onClick={() => setEditingProduct(product)}
                    className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all ml-auto"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAddCategoryOpen && (
        <CategoryModal onClose={() => setIsAddCategoryOpen(false)} />
      )}

      {(isAddProductOpen || editingProduct) && (
        <ProductModal
          product={editingProduct || undefined}
          onClose={() => {
            setIsAddProductOpen(false);
            setEditingProduct(null);
          }}
          onSaved={(saved) => {
            // Block WS-triggered reload for 2s to avoid overwriting optimistic state.
            skipWsReloadUntil.current = Date.now() + 2000;
            // Apply the response (which was re-fetched from DB) immediately.
            setProducts(prev => {
              const exists = prev.find(p => p.id === saved.id);
              return exists
                ? prev.map(p => p.id === saved.id ? saved : p)
                : [saved, ...prev];
            });
            // Background re-fetch of images after 2.5s to verify DB state
            // (handles any edge case where the guard window hid a concurrent change).
            setTimeout(() => {
              api.products.listProductImages().then(images => {
                const map: Record<string, string> = {};
                images.forEach(i => { if (i.image) map[i.id] = i.image; });
                setProducts(prev => prev.map(p => map[p.id] ? { ...p, image: map[p.id] } : p));
              }).catch(() => {});
            }, 2500);
          }}
        />
      )}

      {confirmProductDelete && (
        <ConfirmModal
          title={`Delete ${selectedProductIds.size} Product${selectedProductIds.size > 1 ? 's' : ''}`}
          message={`This will permanently remove ${selectedProductIds.size} product${selectedProductIds.size > 1 ? 's' : ''} from the menu. This action cannot be undone.`}
          onConfirm={deleteSelectedProducts}
          onClose={() => setConfirmProductDelete(false)}
        />
      )}
    </div>
  );
};

// ── Finance Dashboard ─────────────────────────────────────────────────────────
const EXPENSE_COLORS = ['#ef4444', '#f97316', '#a855f7'];
const METHOD_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'];

const FinanceDashboard = () => {
  const { formatCurrency } = useLocalization();
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [openTable, setOpenTable] = useState<'purchases' | 'salaries' | 'advances' | null>(null);

  const [dateFilter, setDateFilter] = useState<{ type: string; start: string; end: string }>(() => {
    const now = new Date();
    return {
      type: 'this_month',
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
    };
  });

  const periods = [
    { id: 'this_week',   label: 'This Week' },
    { id: 'this_month',  label: 'This Month' },
    { id: 'last_month',  label: 'Last Month' },
    { id: 'last_90',     label: 'Last 90 Days' },
    { id: 'this_year',   label: 'This Year' },
    { id: 'custom',      label: 'Custom' },
  ];

  const applyPeriod = (type: string) => {
    const now = new Date();
    let start = '';
    let end = now.toISOString().split('T')[0];
    if (type === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
    } else if (type === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (type === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    } else if (type === 'last_90') {
      start = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
    } else if (type === 'this_year') {
      start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    } else {
      return;
    }
    setDateFilter({ type, start, end });
  };

  useEffect(() => {
    if (dateFilter.type === 'custom' && (!dateFilter.start || !dateFilter.end)) return;
    setLoading(true);
    api.analytics.getFinanceReport(dateFilter.start, dateFilter.end)
      .then(setReport)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateFilter.start, dateFilter.end]);

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${day}/${m}`;
  };

  const expensePieData = report ? [
    { name: 'Purchases', value: report.expenses.purchases_total },
    { name: 'Salaries', value: report.expenses.salaries_total },
    { name: 'Cash Advances', value: report.expenses.cash_advances_total },
  ].filter(d => d.value > 0) : [];

  const profitColor = (report?.profit ?? 0) >= 0 ? 'text-tertiary' : 'text-error';
  const profitBg = (report?.profit ?? 0) >= 0 ? 'bg-tertiary/10' : 'bg-error/10';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Period picker */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {periods.map(p => (
            <button
              key={p.id}
              onClick={() => { if (p.id !== 'custom') applyPeriod(p.id); setDateFilter(prev => ({ ...prev, type: p.id })); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors ${
                dateFilter.type === p.id
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {dateFilter.type === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter.start}
              onChange={e => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
              className="bg-surface-container rounded-xl px-3 py-2 text-xs border border-outline-variant/20 text-on-surface"
            />
            <span className="text-on-surface-variant text-xs">→</span>
            <input
              type="date"
              value={dateFilter.end}
              onChange={e => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
              className="bg-surface-container rounded-xl px-3 py-2 text-xs border border-outline-variant/20 text-on-surface"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <span className="material-symbols-outlined animate-spin text-primary text-4xl">sync</span>
        </div>
      ) : report && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Total Income</p>
              <p className="text-2xl font-extrabold text-tertiary font-headline">{formatCurrency(report.income_total)}</p>
              <p className="text-[10px] text-on-surface-variant mt-1">{report.income_order_count} paid orders</p>
            </div>
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Total Expenses</p>
              <p className="text-2xl font-extrabold text-error font-headline">{formatCurrency(report.expenses.total)}</p>
              <p className="text-[10px] text-on-surface-variant mt-1">
                Purchases + HR + Advances
              </p>
            </div>
            <div className={`rounded-2xl p-5 border border-outline-variant/10 ${profitBg}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Net Profit</p>
              <p className={`text-2xl font-extrabold font-headline ${profitColor}`}>{formatCurrency(report.profit)}</p>
              <p className="text-[10px] text-on-surface-variant mt-1">Income − Expenses</p>
            </div>
            <div className={`rounded-2xl p-5 border border-outline-variant/10 ${profitBg}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Profit Margin</p>
              <p className={`text-2xl font-extrabold font-headline ${profitColor}`}>{report.profit_margin}%</p>
              <p className="text-[10px] text-on-surface-variant mt-1">
                {report.profit >= 0 ? 'Profitable' : 'Operating at a loss'}
              </p>
            </div>
          </div>

          {/* Expense sub-totals */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Purchases', value: report.expenses.purchases_total, icon: 'shopping_cart', color: 'text-error' },
              { label: 'Salaries', value: report.expenses.salaries_total, icon: 'badge', color: 'text-orange-400' },
              { label: 'Cash Advances', value: report.expenses.cash_advances_total, icon: 'payments', color: 'text-purple-400' },
            ].map(e => (
              <div key={e.label} className="bg-surface-container rounded-2xl p-4 border border-outline-variant/10 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center">
                  <span className={`material-symbols-outlined ${e.color}`}>{e.icon}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{e.label}</p>
                  <p className={`text-lg font-extrabold font-headline ${e.color}`}>{formatCurrency(e.value)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Main chart */}
          {report.income_by_day.length > 0 && (
            <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Income vs Expenses</p>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={report.income_by_day}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={55} tickFormatter={v => formatCurrency(v)} />
                  <Tooltip
                    formatter={(v: number, name: string) => [formatCurrency(v), name]}
                    contentStyle={{ background: 'var(--color-surface-container-high)', border: 'none', borderRadius: '12px', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.85} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.85} />
                  <Line dataKey="profit" name="Profit" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pie charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Income by payment method */}
            {report.income_by_payment_method.length > 0 && (
              <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Income by Payment Method</p>
                <div className="flex items-center gap-6">
                  <PieChart width={160} height={160}>
                    <Pie data={report.income_by_payment_method} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {report.income_by_payment_method.map((_, i) => (
                        <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="flex flex-col gap-2">
                    {report.income_by_payment_method.map((m, i) => (
                      <div key={m.method} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: METHOD_COLORS[i % METHOD_COLORS.length] }} />
                        <span className="text-xs text-on-surface-variant">{m.method}</span>
                        <span className="text-xs font-bold text-on-surface ml-auto">{formatCurrency(m.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Expense breakdown */}
            {expensePieData.length > 0 && (
              <div className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10">
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">Expense Breakdown</p>
                <div className="flex items-center gap-6">
                  <PieChart width={160} height={160}>
                    <Pie data={expensePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                      {expensePieData.map((_, i) => (
                        <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                  <div className="flex flex-col gap-2">
                    {expensePieData.map((e, i) => (
                      <div key={e.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
                        <span className="text-xs text-on-surface-variant">{e.name}</span>
                        <span className="text-xs font-bold text-on-surface ml-auto">{formatCurrency(e.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Detail tables */}
          {[
            {
              key: 'purchases' as const,
              label: 'Purchases',
              icon: 'shopping_cart',
              count: report.expenses.purchases.length,
              total: report.expenses.purchases_total,
              color: 'text-error',
              rows: report.expenses.purchases.map(p => ({
                cols: [p.date, p.ingredient, p.vendor || '—', `${p.quantity} ${p.unit}`, formatCurrency(p.cost)],
              })),
              headers: ['Date', 'Ingredient', 'Vendor', 'Qty', 'Cost'],
            },
            {
              key: 'salaries' as const,
              label: 'Salary Payments',
              icon: 'badge',
              count: report.expenses.salaries.length,
              total: report.expenses.salaries_total,
              color: 'text-orange-400',
              rows: report.expenses.salaries.map(s => ({
                cols: [s.date, s.user_name, formatCurrency(s.base_salary), formatCurrency(s.net_amount)],
              })),
              headers: ['Date', 'Employee', 'Base Salary', 'Net Paid'],
            },
            {
              key: 'advances' as const,
              label: 'Cash Advances',
              icon: 'payments',
              count: report.expenses.cash_advances.length,
              total: report.expenses.cash_advances_total,
              color: 'text-purple-400',
              rows: report.expenses.cash_advances.map(a => ({
                cols: [a.date, a.user_name, formatCurrency(a.amount), a.status],
              })),
              headers: ['Date', 'Employee', 'Amount', 'Status'],
            },
          ].map(table => (
            <div key={table.key} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
              <button
                onClick={() => setOpenTable(openTable === table.key ? null : table.key)}
                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-surface-container-high transition-colors"
              >
                <span className={`material-symbols-outlined ${table.color}`}>{table.icon}</span>
                <span className="text-sm font-bold text-on-surface">{table.label}</span>
                <span className="text-xs text-on-surface-variant ml-1">({table.count} records)</span>
                <span className={`ml-auto text-sm font-extrabold font-headline ${table.color}`}>{formatCurrency(table.total)}</span>
                <span className="material-symbols-outlined text-on-surface-variant ml-2">
                  {openTable === table.key ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {openTable === table.key && table.rows.length > 0 && (
                <div className="border-t border-outline-variant/10 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-container-high">
                        {table.headers.map(h => (
                          <th key={h} className="px-4 py-3 text-left font-bold uppercase tracking-widest text-on-surface-variant">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, i) => (
                        <tr key={i} className="border-t border-outline-variant/10 hover:bg-surface-container-high/50">
                          {row.cols.map((col, j) => (
                            <td key={j} className="px-4 py-3 text-on-surface">{col}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {openTable === table.key && table.rows.length === 0 && (
                <p className="px-6 py-4 text-xs text-on-surface-variant border-t border-outline-variant/10">No records for this period.</p>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// ── Sales View ────────────────────────────────────────────────────────────────
const SalesView = () => {
  const { formatCurrency } = useLocalization();
  const [orders, setOrders] = useState<Order[]>([]);
  const [bestsellers, setBestsellers] = useState<BestsellerItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [registerReports, setRegisterReports] = useState<RegisterReport[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; income: number; order_count: number; avg_prep_time_minutes: number }[]>([]);
  
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [bestsellersLoading, setBestsellersLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(true);

  const [dateFilter, setDateFilter] = useState<{ type: string; start: string; end: string }>(() => {
    const now = new Date();
    return {
      type: 'this_month',
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
      end: now.toISOString().split('T')[0]
    };
  });

  const getPeriodDates = (type: string) => {
    const now = new Date();
    let start = '';
    let end = now.toISOString().split('T')[0];

    if (type === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (type === 'last_month') {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      start = firstOfLastMonth.toISOString().split('T')[0];
      end = lastOfLastMonth.toISOString().split('T')[0];
    } else if (type === 'past_90') {
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      start = ninetyDaysAgo.toISOString().split('T')[0];
    }
    return { start, end };
  };

  const fetchData = useCallback(async () => {
    setSummaryLoading(true);
    setDailyLoading(true);
    setLeaderboardLoading(true);
    setBestsellersLoading(true);
    setReportsLoading(true);
    setOrdersLoading(true);
    
    // Smoothly transition from splash to skeletons immediately
    setLoading(false);

    const usersPromise = api.users.listUsers().then(u => { setUsers(u); return u; });
    const ordersPromise = api.orders.listOrders(undefined, undefined, undefined, dateFilter.start, dateFilter.end, 100);
    
    api.analytics.getBestsellers(5).then(setBestsellers).catch(console.error).finally(() => setBestsellersLoading(false));
    api.analytics.getLeaderboard().then(setLeaderboard).catch(console.error).finally(() => setLeaderboardLoading(false));
    api.analytics.getSalesSummary().then(setSummary).catch(console.error).finally(() => setSummaryLoading(false));
    api.analytics.getDailySales(dateFilter.start, dateFilter.end).then(setDailyData).catch(console.error).finally(() => setDailyLoading(false));
    api.register.listRegisterReports(undefined, 50).then(raw => setRegisterReports(raw.sort((a, b) => b.closedAt - a.closedAt))).catch(console.error).finally(() => setReportsLoading(false));

    try {
      const [u, o] = await Promise.all([usersPromise, ordersPromise]);
      setOrders(o);
    } catch (err) {
      console.error(err);
    } finally {
      setOrdersLoading(false);
    }
  }, [dateFilter.start, dateFilter.end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (iso?: string | number) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const prepTime = (o: Order) => {
    if (!o.startTime) return '—';
    const ms = Math.max(0, Date.now() - o.startTime);
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const statusColors: Record<string, string> = {
    Done: 'bg-green-500/10 text-green-400',
    Cancelled: 'bg-red-500/10 text-red-400',
    Preparing: 'bg-blue-500/10 text-blue-400',
    Queued: 'bg-yellow-500/10 text-yellow-400',
    Served: 'bg-purple-500/10 text-purple-400',
    Draft: 'bg-surface-variant text-on-surface-variant',
    Scheduled: 'bg-orange-500/10 text-orange-400',
    Packaging: 'bg-cyan-500/10 text-cyan-400',
    'Out for delivery': 'bg-indigo-500/10 text-indigo-400',
  };

  const filtered = orders.filter(o => {
    const matchStatus = !statusFilter || o.status === statusFilter;
    const s = search.toLowerCase();
    const matchSearch = !s || o.id.toLowerCase().includes(s) || (o.customer?.name || '').toLowerCase().includes(s);
    return matchStatus && matchSearch;
  });

  const chartData = useMemo(() => {
    // Deduplicate by date to prevent UI glitches if backend returns duplicate keys
    const unique = Array.from(new Map(dailyData.map(d => [d.date, d])).values());
    
    return unique.map(d => ({
      ...d,
      dateLabel: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      fullDate: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    }));
  }, [dailyData]);

  // Compute KPI values from dailyData so they respond to the date filter
  const filteredKPIs = useMemo(() => {
    const totalRevenue = dailyData.reduce((s, d) => s + d.income, 0);
    const totalOrders = dailyData.reduce((s, d) => s + d.order_count, 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    return { totalRevenue, totalOrders, avgOrderValue };
  }, [dailyData]);

  // Remove the jumpy full-screen splash. Let the skeletons handle the loading state immediately.
  // if (loading) return <LoadingScreen />; 

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2 pt-2">Analytics</h1>
            <p className="text-on-surface-variant text-sm font-medium opacity-70">Synchronized intelligence and performance orchestration.</p>
          </div>
          
          <div className="flex flex-col items-end gap-3 translate-y-1">
            <div className="flex bg-surface-container-high rounded-2xl p-1.5 border border-outline-variant/10 shadow-sm">
              {[
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'past_90', label: '90 Past Days' },
                { id: 'custom', label: 'Custom' }
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    if (s.id === 'custom') {
                      setDateFilter(prev => ({ ...prev, type: 'custom' }));
                    } else {
                      const range = getPeriodDates(s.id);
                      setDateFilter({ type: s.id, ...range });
                    }
                  }}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${dateFilter.type === s.id ? 'bg-primary text-on-primary shadow-lg scale-[1.02]' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            
            <AnimatePresence>
              {dateFilter.type === 'custom' && (
                <motion.div 
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-2 border border-outline-variant/20">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">From</span>
                    <input 
                      type="date" 
                      value={dateFilter.start} 
                      onChange={e => setDateFilter({...dateFilter, start: e.target.value})}
                      className="bg-transparent text-xs text-on-surface font-bold outline-none focus:text-primary transition-colors"
                    />
                  </div>
                  <div className="w-2 h-px bg-outline-variant/50" />
                  <div className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-2 border border-outline-variant/20">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">To</span>
                    <input 
                      type="date" 
                      value={dateFilter.end} 
                      onChange={e => setDateFilter({...dateFilter, end: e.target.value})}
                      className="bg-transparent text-xs text-on-surface font-bold outline-none focus:text-primary transition-colors"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Period Revenue', value: formatCurrency(filteredKPIs.totalRevenue), icon: <span className="material-symbols-outlined text-[18px]">trending_up</span>, loading: dailyLoading },
            { label: 'Period Orders', value: filteredKPIs.totalOrders.toLocaleString(), icon: <span className="material-symbols-outlined text-[18px]">tag</span>, loading: dailyLoading },
            { label: 'Avg Order Value', value: formatCurrency(filteredKPIs.avgOrderValue), icon: <span className="material-symbols-outlined text-[18px]">shopping_bag</span>, loading: dailyLoading },
            { label: 'All-Time Revenue', value: formatCurrency(summary?.totalRevenue || 0), icon: <span className="material-symbols-outlined text-[18px]">calendar_month</span>, loading: summaryLoading },
            { label: 'Avg Rating', value: summary ? `${summary.reviewsAvgRating.toFixed(1)} ★ (${summary.reviewsCount})` : '—', icon: <span className="material-symbols-outlined text-[18px]">star</span>, loading: summaryLoading },
          ].map((stat, i) => (
            <div key={i} className="bg-surface border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 bg-primary/10 rounded-xl text-primary group-hover:scale-110 transition-transform">
                  {stat.icon}
                </div>
              </div>
              {stat.loading ? (
                <div className="space-y-3">
                  <div className="h-3 w-20 bg-white/10 animate-pulse rounded-full opacity-50" />
                  <div className="h-8 w-32 bg-white/20 animate-pulse rounded-xl" />
                </div>
              ) : (
                <>
                  <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">{stat.label}</p>
                  <p className="text-3xl font-headline font-black text-on-surface mt-1">{stat.value}</p>
                </>
              )}
              <div className="absolute top-0 right-0 p-8 text-primary/5 pointer-events-none group-hover:scale-150 transition-transform">
                <span className="material-symbols-outlined text-[120px]">{ (stat.icon as any).props.children }</span>
              </div>
            </div>
          ))}
        </div>

        {/* Daily Performance Chart */}
        <div className="bg-surface border border-white/5 rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-tertiary/10 rounded-xl text-tertiary">
                <span className="material-symbols-outlined text-[20px]">bar_chart</span>
              </div>
              <div>
                <h3 className="text-lg font-headline font-black text-on-surface">Daily Revenue</h3>
                <p className="text-xs text-on-surface-variant">Income distribution over the period</p>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full flex items-center justify-center">
            {dailyLoading ? (
              <div className="w-full h-full flex items-end gap-2 px-4">
                {[...Array(12)].map((_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 bg-white/5 animate-pulse rounded-t-lg" 
                    style={{ height: `${Math.random() * 60 + 20}%`, animationDelay: `${i * 0.1}s` }} 
                  />
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="white" opacity={0.05} />
                  <XAxis 
                    dataKey="dateLabel" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'white', fontSize: 10, fontWeight: 600, opacity: 0.5 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'white', fontSize: 10, fontWeight: 600, opacity: 0.5 }}
                    tickFormatter={(val) => formatCurrency(val).split('.')[0]}
                  />
                  <Tooltip 
                    cursor={{ fill: 'white', opacity: 0.05 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-black/80 backdrop-blur-2xl border border-white/10 rounded-[1.5rem] p-6 shadow-2xl overflow-hidden min-w-[200px]">
                            <div className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4 border-b border-white/5 pb-2">{data.fullDate}</div>
                            <div className="space-y-3">
                              <div className="flex justify-between items-center bg-white/5 p-2 rounded-xl">
                                <span className="text-[10px] font-bold text-white/60 uppercase">Revenue</span>
                                <span className="text-sm font-headline font-extrabold text-white">{formatCurrency(data.income)}</span>
                              </div>
                              <div className="flex justify-between items-center px-2">
                                <span className="text-[10px] font-bold text-white/60 uppercase">Volume</span>
                                <span className="text-sm font-bold text-white">{data.order_count} Orders</span>
                              </div>
                              <div className="flex justify-between items-center px-2">
                                <span className="text-[10px] font-bold text-white/60 uppercase">Efficiency</span>
                                <span className="text-sm font-bold text-white">{data.avg_prep_time_minutes}m avg prep</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="income" radius={[4, 4, 0, 0]} fill="white" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-surface-container rounded-xl overflow-hidden">
            <div className="p-4 border-b border-outline-variant/10 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
              <h3 className="font-headline font-bold text-on-surface">All Orders</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 bg-surface-container-high rounded-lg px-3 py-1.5 border border-outline-variant/20">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">search</span>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="bg-transparent text-sm focus:outline-none w-28" />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-surface-container-high border border-outline-variant/20 rounded-lg px-2 py-1.5 text-sm focus:outline-none">
                  <option value="">All statuses</option>
                  {['Done','Cancelled','Preparing','Queued','Served','Scheduled','Packaging','Out for delivery','Draft'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-container-high">
                  <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                    <th className="text-left px-4 py-3">Order</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-right px-4 py-3">Total</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Prep</th>
                    <th className="text-center px-4 py-3">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ordersLoading ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i} className="animate-pulse opacity-50">
                        <td className="px-4 py-4"><div className="h-3 w-10 bg-white/10 rounded-full" /></td>
                        <td className="px-4 py-4"><div className="h-3 w-28 bg-white/10 rounded-full" /></td>
                        <td className="px-4 py-4"><div className="h-3 w-12 bg-white/10 rounded-full" /></td>
                        <td className="px-4 py-4"><div className="h-3 w-20 bg-white/10 rounded-full" /></td>
                        <td className="px-4 py-4"><div className="h-3 w-14 bg-white/10 rounded-full" /></td>
                        <td className="px-4 py-4"><div className="h-6 w-16 bg-white/10 rounded-full" /></td>
                        <td className="px-4 py-4"><div className="h-3 w-12 bg-white/10 rounded-full" /></td>
                        <td className="px-4 py-4"><div className="h-3 w-12 bg-white/10 rounded-full" /></td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-on-surface-variant">No orders found.</td></tr>
                  ) : filtered.map(o => (
                    <tr key={o.id} className="border-t border-outline-variant/10 hover:bg-surface-container-high/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{o.id.slice(-6).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{formatDate(o.createdAt)}</td>
                      <td className="px-4 py-3"><span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">{o.orderType.replaceAll('_','-')}</span></td>
                      <td className="px-4 py-3 text-sm">{o.customer?.name || <span className="text-on-surface-variant/50">—</span>}</td>
                      <td className="px-4 py-3 text-right font-bold text-sm">{formatCurrency(o.total)}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColors[o.status] || ''}`}>{o.status}</span></td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">{prepTime(o)}</td>
                      <td className="px-4 py-3 text-center">
                        {o.review ? (
                          <div className="flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                            <div className="flex items-center gap-0.5">
                              {[1,2,3,4,5].map(s => <span key={s} className={`material-symbols-outlined text-[10px] ${s <= o.review!.stars ? 'text-tertiary fill-1' : 'text-on-surface-variant/20 fill-0'}`}>star</span>)}
                            </div>
                            {o.review.comment && <div className="text-[8px] text-on-surface-variant italic truncate max-w-[80px]" title={o.review.comment}>"{o.review.comment}"</div>}
                          </div>
                        ) : <span className="text-on-surface-variant/30">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-surface-container rounded-xl p-5">
              <h3 className="font-headline font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">local_fire_department</span>
                Best Sellers — This Month
              </h3>
              {bestsellersLoading ? (
                <div className="space-y-4 py-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-6 h-6 rounded-full bg-white/5" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 bg-white/10 rounded" />
                        <div className="h-2 w-12 bg-white/5 rounded" />
                      </div>
                      <div className="h-4 w-12 bg-white/10 rounded" />
                    </div>
                  ))}
                </div>
              ) : bestsellers.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-4">No sales data yet.</p>
              ) : (
                <div className="space-y-3">
                  {bestsellers.map((item, i) => (
                    <div key={item.productName} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-400 text-black' : i === 1 ? 'bg-gray-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-surface-variant text-on-surface-variant'}`}>{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{item.productName}</div>
                        <div className="text-xs text-on-surface-variant">{item.totalQuantity} sold</div>
                      </div>
                      <div className="text-sm font-bold text-secondary">{formatCurrency(item.totalRevenue)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface-container rounded-xl p-5">
              <h3 className="font-headline font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">emoji_events</span>
                Kitchen Leaderboard — This Month
              </h3>
              {leaderboardLoading ? (
                <div className="space-y-4 py-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-6 h-6 rounded-full bg-white/5" />
                      <div className="w-8 h-8 rounded-full bg-white/10" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 bg-white/10 rounded" />
                        <div className="h-2 w-16 bg-white/5 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : leaderboard.length === 0 ? (
                <p className="text-sm text-on-surface-variant text-center py-4">No completed orders yet.</p>
              ) : (
                <div className="space-y-3">
                  {leaderboard.map((entry) => (
                    <div key={entry.userId} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${entry.rank === 1 ? 'bg-yellow-400 text-black' : entry.rank === 2 ? 'bg-gray-400 text-black' : entry.rank === 3 ? 'bg-amber-700 text-white' : 'bg-surface-variant text-on-surface-variant'}`}>{entry.rank}</span>
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {entry.avatar ? <img src={entry.avatar} alt="" className="w-full h-full rounded-full object-cover" /> : entry.name[0]}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{entry.name}</div>
                        <div className="text-xs text-on-surface-variant">{entry.ordersCompleted} orders completed</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 bg-surface-container rounded-xl overflow-hidden">
          <div className="p-4 border-b border-outline-variant/10">
            <h3 className="font-headline font-bold text-on-surface">Register Reports (Closures)</h3>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-container-high">
                <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                  <th className="text-left px-4 py-3">Closure Date</th>
                  <th className="text-left px-4 py-3">Cashier</th>
                  <th className="text-right px-4 py-3">Expected Sales</th>
                  <th className="text-right px-4 py-3">Collected</th>
                  <th className="text-right px-4 py-3">Delta</th>
                  <th className="text-left px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {reportsLoading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3"><div className="h-4 w-24 bg-white/5 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-24 bg-white/5 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-12 bg-white/5 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-12 bg-white/5 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-12 bg-white/5 rounded" /></td>
                      <td className="px-4 py-3"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                    </tr>
                  ))
                ) : registerReports.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-on-surface-variant">No register closures logged yet.</td></tr>
                ) : registerReports.map(r => (
                  <tr key={r.id} className="border-t border-outline-variant/10 hover:bg-surface-container-high/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{formatDate(r.closedAt)}</td>
                    <td className="px-4 py-3 font-semibold">{r.cashierName}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(r.expectedSales)}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(r.actualSales)}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={r.difference > 0 ? 'text-tertiary' : r.difference < 0 ? 'text-secondary' : 'text-on-surface-variant'}>
                        {r.difference > 0 ? '+' : ''}{formatCurrency(r.difference)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant max-w-[200px] truncate">{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Customers View ────────────────────────────────────────────────────────────
const CustomersView = () => {
  const { formatCurrency } = useLocalization();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [confirmCustomerDelete, setConfirmCustomerDelete] = useState(false);

  const toggleCustomerSelect = (id: string) => {
    const next = new Set(selectedCustomerIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedCustomerIds(next);
  };
  const toggleSelectAllCustomers = () => {
    if (selectedCustomerIds.size === customers.length && customers.length > 0) setSelectedCustomerIds(new Set());
    else setSelectedCustomerIds(new Set(customers.map(c => c.id)));
  };
  const deleteSelectedCustomers = async () => {
    try {
      for (const id of Array.from(selectedCustomerIds)) {
        await api.customers.deleteCustomer(id);
      }
      setSelectedCustomerIds(new Set());
      loadCustomers(search || undefined);
    } catch(err) { showError('Failed to delete customers: ' + ((err as any)?.message || 'Unknown error')); }
  };

  const loadCustomers = useCallback((q?: string) => {
    setLoading(true);
    api.customers.listCustomers(q).then(setCustomers).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  useEffect(() => {
    return zenWs.onEvent(e => {
      if (e.type === 'customer_update' || e.type === 'order_update') loadCustomers();
    });
  }, [loadCustomers]);

  const handleSearch = (v: string) => {
    setSearch(v);
    loadCustomers(v || undefined);
  };

  const openDetail = async (c: Customer) => {
    setLoadingDetail(true);
    try {
      const detail = await api.customers.getCustomer(c.id);
      setSelected(detail);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

  const sortedCustomers = useMemo(() => {
    const sortable = [...customers];
    sortable.sort((a, b) => {
      const aVal = a[sortConfig.key] ?? '';
      const bVal = b[sortConfig.key] ?? '';
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortable;
  }, [customers, sortConfig]);

  const requestSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof Customer) => {
    if (sortConfig.key !== key) return 'unfold_more';
    return sortConfig.direction === 'asc' ? 'expand_less' : 'expand_more';
  };

  const formatDate = (iso?: string) => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 relative">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Customers</h1>
        <p className="text-on-surface-variant text-sm mb-6">All registered customers and their purchase history.</p>

        {/* Search bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 flex items-center gap-3 bg-surface-container rounded-xl px-4 py-3 border border-outline-variant/20">
            <span className="material-symbols-outlined text-on-surface-variant">search</span>
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="flex-1 bg-transparent border-none focus:outline-none text-sm text-on-surface"
            />
            {search && <button onClick={() => handleSearch('')} className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">close</span></button>}
          </div>
          <div className="flex items-center gap-2 bg-surface-container rounded-xl px-3 py-1.5 border border-outline-variant/20">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">Sort by:</span>
            <select 
              value={`${sortConfig.key}-${sortConfig.direction}`} 
              onChange={e => {
                const [key, dir] = e.target.value.split('-');
                setSortConfig({ key: key as keyof Customer, direction: dir as 'asc' | 'desc' });
              }}
              className="bg-transparent text-sm focus:outline-none text-on-surface cursor-pointer py-1.5"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="orderCount-desc">Most Orders</option>
              <option value="totalSpent-desc">Highest Spend</option>
              <option value="lastOrderDate-desc">Most Recent</option>
            </select>
          </div>
          {selectedCustomerIds.size > 0 && (
            <button
              onClick={() => setConfirmCustomerDelete(true)}
              className="px-6 py-3 bg-error/10 text-error rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-error/20 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              DELETE ({selectedCustomerIds.size})
            </button>
          )}
        </div>

        {loading ? (
          <div className="bg-surface-container rounded-xl overflow-hidden border border-white/5">
            <div className="bg-surface-container-high h-12 w-full animate-pulse border-b border-white/5" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0 opacity-50">
                <div className="w-4 h-4 bg-white/10 rounded animate-pulse" />
                <div className="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-white/10 rounded animate-pulse" />
                  <div className="h-2 w-24 bg-white/5 rounded animate-pulse" />
                </div>
                <div className="w-12 h-4 bg-white/10 rounded animate-pulse" />
                <div className="w-16 h-4 bg-white/10 rounded animate-pulse" />
                <div className="w-20 h-4 bg-white/10 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl mb-3">groups</span>
            <p className="text-sm">{search ? 'No customers match your search.' : 'No customers yet. They appear automatically when orders are placed with a phone number.'}</p>
          </div>
        ) : (
          <div className="bg-surface-container rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-high">
                <tr className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                  <th className="px-5 py-3 w-12 text-center">
                    <input type="checkbox" checked={customers.length > 0 && selectedCustomerIds.size === customers.length} onChange={toggleSelectAllCustomers} className="rounded text-secondary w-4 h-4 cursor-pointer" />
                  </th>
                  <th className="text-left px-5 py-3">
                    <button onClick={() => requestSort('name')} className="flex items-center gap-1 hover:text-on-surface transition-colors uppercase tracking-wider">
                      Name
                      <span className="material-symbols-outlined text-[14px]">{getSortIcon('name')}</span>
                    </button>
                  </th>
                  <th className="text-left px-5 py-3">Phone</th>
                  <th className="text-right px-5 py-3">
                    <button onClick={() => requestSort('orderCount')} className="flex items-center gap-1 hover:text-on-surface transition-colors uppercase tracking-wider ml-auto">
                      Orders
                      <span className="material-symbols-outlined text-[14px]">{getSortIcon('orderCount')}</span>
                    </button>
                  </th>
                  <th className="text-right px-5 py-3">
                    <button onClick={() => requestSort('totalSpent')} className="flex items-center gap-1 hover:text-on-surface transition-colors uppercase tracking-wider ml-auto">
                      Total Spent
                      <span className="material-symbols-outlined text-[14px]">{getSortIcon('totalSpent')}</span>
                    </button>
                  </th>
                  <th className="text-left px-5 py-3">
                    <button onClick={() => requestSort('lastOrderDate')} className="flex items-center gap-1 hover:text-on-surface transition-colors uppercase tracking-wider">
                      Last Order
                      <span className="material-symbols-outlined text-[14px]">{getSortIcon('lastOrderDate')}</span>
                    </button>
                  </th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {sortedCustomers.map(c => (
                  <tr key={c.id} className="border-t border-outline-variant/10 hover:bg-surface-container-high/50 transition-colors">
                    <td className="px-5 py-4 text-center">
                      <input type="checkbox" checked={selectedCustomerIds.has(c.id)} onChange={() => toggleCustomerSelect(c.id)} className="rounded text-secondary w-4 h-4 cursor-pointer" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">{c.name[0]?.toUpperCase()}</div>
                        <div>
                          <div className="font-semibold text-on-surface">{c.name}</div>
                          {c.address && <div className="text-xs text-on-surface-variant truncate max-w-[160px]">{c.address}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-on-surface-variant">{c.phone}</td>
                    <td className="px-5 py-4 text-right font-bold">{c.orderCount}</td>
                    <td className="px-5 py-4 text-right font-bold text-secondary">{formatCurrency(c.totalSpent)}</td>
                    <td className="px-5 py-4 text-on-surface-variant text-xs">{formatDate(c.lastOrderDate)}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openDetail(c)}
                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-secondary transition-colors px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20"
                      >
                        <span className="material-symbols-outlined text-[14px]">history</span>
                        History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-6 border-b border-outline-variant/10 flex justify-between items-start">
                <div>
                  <h3 className="font-headline text-xl font-bold">{selected.name}</h3>
                  <p className="text-sm text-on-surface-variant">{selected.phone}{selected.address ? ` · ${selected.address}` : ''}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-sm"><strong>{selected.orderCount}</strong> <span className="text-on-surface-variant">orders</span></span>
                    <span className="text-sm font-bold text-secondary">{formatCurrency(selected.totalSpent)}</span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="text-on-surface-variant hover:text-on-surface mt-1"><span className="material-symbols-outlined">close</span></button>
              </div>
              <div className="overflow-y-auto p-4 space-y-2">
                {selected.orders.length === 0 ? (
                  <p className="text-center text-sm text-on-surface-variant py-8">No orders yet.</p>
                ) : selected.orders.map(o => (
                  <div key={o.id} className="bg-surface-container rounded-xl p-4 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-on-surface-variant">{o.orderNumber}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${o.status === 'Done' ? 'bg-green-500/10 text-green-400' : o.status === 'Cancelled' ? 'bg-red-500/10 text-red-400' : 'bg-surface-variant text-on-surface-variant'}`}>{o.status}</span>
                      </div>
                      <div className="text-xs text-on-surface-variant">{formatDate(o.createdAt)} · {o.itemsCount} items · {o.orderType.replace('_','-')}</div>
                      {o.review && (
                        <div className="flex items-center gap-0.5 mt-1.5 flex-wrap">
                          <div className="flex items-center gap-0.5">
                            {[1,2,3,4,5].map(s => <span key={s} className={`material-symbols-outlined text-[12px] ${s <= o.review!.stars ? 'text-tertiary fill-1' : 'text-on-surface-variant/30 fill-0'}`}>star</span>)}
                          </div>
                          {o.review.comment && <span className="text-xs text-on-surface-variant ml-1.5 italic">"{o.review.comment}"</span>}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold">{formatCurrency(o.total)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {confirmCustomerDelete && (
        <ConfirmModal
          title={`Delete ${selectedCustomerIds.size} Customer${selectedCustomerIds.size > 1 ? 's' : ''}`}
          message={`This will permanently remove ${selectedCustomerIds.size} customer record${selectedCustomerIds.size > 1 ? 's' : ''}. This action cannot be undone.`}
          onConfirm={deleteSelectedCustomers}
          onClose={() => setConfirmCustomerDelete(false)}
        />
      )}
    </div>
  );
};

// ── Localization View ─────────────────────────────────────────────────────────
const LANGUAGES = ['English', 'French', 'Arabic', 'Spanish', 'Japanese', 'German'];
const CURRENCIES = [
  { code: 'DZD', name: 'Algerian Dinar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'TND', name: 'Tunisian Dinar' },
];
const TIMEZONES = [
  'Africa/Algiers', 'Europe/Paris', 'Europe/London', 'America/New_York',
  'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Dubai', 'Africa/Casablanca',
];
const COUNTRIES = [
  'Algeria', 'France', 'Morocco', 'Tunisia', 'United States', 'United Kingdom',
  'Japan', 'Germany', 'Spain', 'Saudi Arabia',
];

const DEFAULT_LOCALIZATION = {
  language: 'English', currency: 'DZD', currencyPosition: 'right',
  country: 'Algeria', taxEnabled: true, taxRate: 8, timezone: 'Africa/Algiers',
  currencyDecimals: 2, decimalSeparator: 'dot' as string,
  gratuityEnabled: false, gratuityRate: 0,
};

const LocalizationView = () => {
  const { setLocalization } = useLocalization();
  const [settings, setSettings] = useState(DEFAULT_LOCALIZATION);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings.getLocalization().then(setSettings).catch(() => {
      try {
        const local = localStorage.getItem('zenpos_localization');
        if (local) setSettings(JSON.parse(local));
      } catch {}
    });
  }, []);

  const update = (key: string, value: any) => setSettings((prev: any) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await api.settings.updateLocalization(settings);
    } catch (err: any) {
      console.error('Localization save failed:', err.message);
    }
    setLocalization(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">{label}</label>
      {children}
    </div>
  );

  const selectClass = "w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm";

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Localization</h1>
        <p className="text-on-surface-variant text-sm">Configure language, currency, tax, and regional settings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Language & Region */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10 space-y-6">
          <h3 className="font-headline font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary">language</span> Language & Region
          </h3>
          <Field label="Language">
            <select value={settings.language} onChange={e => update('language', e.target.value)} className={selectClass}>
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Country">
            <select value={settings.country} onChange={e => update('country', e.target.value)} className={selectClass}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Timezone">
            <select value={settings.timezone} onChange={e => update('timezone', e.target.value)} className={selectClass}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
            </select>
          </Field>
        </div>

        {/* Currency */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10 space-y-6">
          <h3 className="font-headline font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary">payments</span> Currency
          </h3>
          <Field label="Currency">
            <select value={settings.currency} onChange={e => update('currency', e.target.value)} className={selectClass}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </Field>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Currency Symbol Position">
              <div className="flex gap-3 mt-1">
                {(['left', 'right'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => update('currencyPosition', pos)}
                    className={`flex-1 py-3 rounded-xl border text-sm font-bold capitalize transition-all ${settings.currencyPosition === pos ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'}`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Decimal Separator">
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => update('decimalSeparator', 'dot')}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold capitalize transition-all ${settings.decimalSeparator === 'dot' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'}`}
                >
                  Dot (.)
                </button>
                <button
                  onClick={() => update('decimalSeparator', 'comma')}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold capitalize transition-all ${settings.decimalSeparator === 'comma' ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'}`}
                >
                  Comma (,)
                </button>
              </div>
            </Field>
          </div>

          <Field label="Decimals">
            <div className="flex gap-2 mt-1">
              {[0, 2, 3].map(dec => (
                <button
                  key={dec}
                  onClick={() => update('currencyDecimals', dec)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold capitalize transition-all ${settings.currencyDecimals === dec ? 'border-secondary bg-secondary/10 text-secondary' : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'}`}
                >
                  {dec}
                </button>
              ))}
            </div>
          </Field>

          <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/10">
            <div className="text-xs text-on-surface-variant mb-1">Preview</div>
            <div className="text-2xl font-bold text-on-surface">
              {(() => {
                const useComma = settings.decimalSeparator === 'comma';
                const formatted = new Intl.NumberFormat(useComma ? 'de-DE' : 'en-US', {
                  minimumFractionDigits: settings.currencyDecimals ?? 2,
                  maximumFractionDigits: settings.currencyDecimals ?? 2
                }).format(1234.567);
                return settings.currencyPosition === 'left'
                  ? `${settings.currency} ${formatted}`
                  : `${formatted} ${settings.currency}`;
              })()}
            </div>
          </div>
        </div>

        {/* Tax */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10 lg:col-span-2">
          <h3 className="font-headline font-bold text-on-surface flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-secondary">receipt_long</span> Tax Configuration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Tax Enabled</label>
              <button
                onClick={() => update('taxEnabled', !settings.taxEnabled)}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${settings.taxEnabled ? 'bg-secondary' : 'bg-surface-variant'}`}
              >
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-300 ${settings.taxEnabled ? 'left-7' : 'left-0.5'}`} />
              </button>
              <p className="text-xs text-on-surface-variant mt-2">{settings.taxEnabled ? 'Tax is applied to all orders' : 'No tax applied'}</p>
            </div>
            <div className={`transition-opacity duration-200 ${settings.taxEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Tax Rate (%)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0} max={100} step={0.1}
                  value={settings.taxRate}
                  onChange={e => update('taxRate', parseFloat(e.target.value) || 0)}
                  className="w-28 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold text-lg text-center"
                />
                <span className="text-2xl text-on-surface-variant font-bold">%</span>
              </div>
            </div>
            <div className={`p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/10 transition-opacity duration-200 ${settings.taxEnabled ? 'opacity-100' : 'opacity-30'}`}>
              <div className="text-xs text-on-surface-variant mb-2">Example on 1,000 {settings.currency} order</div>
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>1,000.00</span></div>
              {settings.taxEnabled && <div className="flex justify-between text-sm text-on-surface-variant"><span>Tax ({settings.taxRate}%)</span><span>+{(1000 * settings.taxRate / 100).toFixed(2)}</span></div>}
              <div className="flex justify-between font-bold mt-2 pt-2 border-t border-outline-variant/10"><span>Total</span><span>{settings.taxEnabled ? (1000 + 1000 * settings.taxRate / 100).toFixed(2) : '1,000.00'} {settings.currency}</span></div>
            </div>
          </div>
        </div>

        {/* Gratuity / Service Charge */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10 lg:col-span-2">
          <h3 className="font-headline font-bold text-on-surface flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-secondary">room_service</span> Gratuity / Service Charge
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Gratuity Enabled</label>
              <button
                onClick={() => update('gratuityEnabled', !settings.gratuityEnabled)}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${settings.gratuityEnabled ? 'bg-secondary' : 'bg-surface-variant'}`}
              >
                <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-300 ${settings.gratuityEnabled ? 'left-7' : 'left-0.5'}`} />
              </button>
              <p className="text-xs text-on-surface-variant mt-2">{settings.gratuityEnabled ? 'Gratuity is applied to all orders' : 'No automatic gratuity'}</p>
            </div>
            <div className={`transition-opacity duration-200 ${settings.gratuityEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Gratuity Rate (%)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0} max={100} step={0.1}
                  value={settings.gratuityRate}
                  onChange={e => update('gratuityRate', parseFloat(e.target.value) || 0)}
                  className="w-28 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold text-lg text-center"
                />
                <span className="text-2xl text-on-surface-variant font-bold">%</span>
              </div>
            </div>
            <div className={`p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/10 transition-opacity duration-200 ${settings.gratuityEnabled ? 'opacity-100' : 'opacity-30'}`}>
              <div className="text-xs text-on-surface-variant mb-2">Example on 1,000 {settings.currency} order</div>
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>1,000.00</span></div>
              {settings.gratuityEnabled && <div className="flex justify-between text-sm text-on-surface-variant"><span>Gratuity ({settings.gratuityRate}%)</span><span>+{(1000 * settings.gratuityRate / 100).toFixed(2)}</span></div>}
              <div className="flex justify-between font-bold mt-2 pt-2 border-t border-outline-variant/10"><span>Total</span><span>{settings.gratuityEnabled ? (1000 + 1000 * settings.gratuityRate / 100).toFixed(2) : '1,000.00'} {settings.currency}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          className="px-8 py-3 bg-secondary text-on-secondary font-bold rounded-xl hover:bg-secondary/90 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined">save</span>
          Save Settings
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Settings saved
          </div>
        )}
      </div>
    </div>
  );
};

// ── Integration View ──────────────────────────────────────────────────────────
const DEFAULT_INTEGRATION = {
  telegramEnabled: false, telegramBotToken: '', telegramChatId: '',
  telegramReports: { daily: true, weekly: false, newOrder: false },
  emailEnabled: false, emailRecipients: '', emailService: 'smtp',
  emailHost: '', emailPort: '587', emailUser: '', emailPassword: '',
  emailReports: { daily: true, weekly: true },
  firebaseEnabled: false,
  firebaseApiKey: '', firebaseAuthDomain: '', firebaseProjectId: '',
  firebaseStorageBucket: '', firebaseMessagingSenderId: '', firebaseAppId: '',
  firebaseMeasurementId: '',
  bunnyEnabled: false,
  bunnyApiKey: '', bunnyStorageZone: '', bunnyStorageRegion: '',
  bunnyCdnHostname: '', bunnyPullZoneId: '',
  metaPixelEnabled: false, metaPixelId: '',
  metaCapiEnabled: false, metaCapiToken: '', metaCapiTestEventCode: '',
};

const IntegrationView = () => {
  const [cfg, setCfg] = useState<api.settings.IntegrationData>(DEFAULT_INTEGRATION as api.settings.IntegrationData);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<'telegram' | 'email' | null>(null);
  const [bunnyTestStatus, setBunnyTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [bunnyTesting, setBunnyTesting] = useState(false);

  useEffect(() => {
    api.settings.getIntegration().then(d => setCfg(d)).catch(() => {
      try {
        const local = localStorage.getItem('zenpos_integration');
        if (local) setCfg(JSON.parse(local));
      } catch {}
    });
  }, []);

  const update = (key: string, value: any) => setCfg((prev: any) => ({ ...prev, [key]: value }));
  const updateNested = (parent: string, key: string, value: any) =>
    setCfg((prev: any) => ({ ...prev, [parent]: { ...prev[parent], [key]: value } }));

  const handleSave = async () => {
    try {
      await api.settings.updateIntegration(cfg);
    } catch (err: any) {
      console.error('Integration save failed:', err.message);
    }
    localStorage.setItem('zenpos_integration', JSON.stringify(cfg));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleTest = async (channel: 'telegram' | 'email') => {
    setTesting(channel);
    await new Promise(r => setTimeout(r, 1800));
    setTesting(null);
  };

  const handleTestBunny = async () => {
    setBunnyTesting(true);
    setBunnyTestStatus(null);
    try {
      const result = await api.settings.testBunnyConnection();
      setBunnyTestStatus(result);
    } catch (err: any) {
      setBunnyTestStatus({ ok: false, message: err.message ?? 'Request failed' });
    } finally {
      setBunnyTesting(false);
    }
  };

  const inputClass = "w-full bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm";
  const labelClass = "block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2";

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)} className={`relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0 ${value ? 'bg-secondary' : 'bg-surface-variant'}`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${value ? 'left-6' : 'left-0.5'}`} />
    </button>
  );

  const CheckReport = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <button onClick={() => onChange(!checked)} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checked ? 'bg-secondary border-secondary' : 'border-outline-variant/40'}`}>
        {checked && <span className="material-symbols-outlined text-[14px] text-on-secondary">check</span>}
      </button>
      <span className="text-sm text-on-surface">{label}</span>
    </label>
  );

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Integration</h1>
        <p className="text-on-surface-variant text-sm">Connect ZEN-POS to external services for automated reports and notifications.</p>
      </div>

      <div className="space-y-6 mb-8">
        {/* Telegram */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#26a5e4]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#26a5e4]">send</span>
              </div>
              <div>
                <div className="font-headline font-bold text-on-surface">Telegram</div>
                <div className="text-xs text-on-surface-variant">Send reports directly to a Telegram group or channel</div>
              </div>
            </div>
            <Toggle value={cfg.telegramEnabled} onChange={v => update('telegramEnabled', v)} />
          </div>

          <div className={`space-y-4 transition-opacity duration-200 ${cfg.telegramEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Bot Token</label>
                <input type="password" value={cfg.telegramBotToken} onChange={e => update('telegramBotToken', e.target.value)} placeholder="1234567890:AAXXXXXXX" className={inputClass} />
                <p className="text-xs text-on-surface-variant mt-1">Get your token from @BotFather on Telegram</p>
              </div>
              <div>
                <label className={labelClass}>Chat ID</label>
                <input type="text" value={cfg.telegramChatId} onChange={e => update('telegramChatId', e.target.value)} placeholder="-100xxxxxxxxx" className={inputClass} />
                <p className="text-xs text-on-surface-variant mt-1">Group chat ID (negative) or user ID</p>
              </div>
            </div>
            <div>
              <label className={labelClass}>Report Triggers</label>
              <div className="flex flex-wrap gap-6 mt-2">
                <CheckReport label="Daily summary" checked={cfg.telegramReports.daily} onChange={v => updateNested('telegramReports', 'daily', v)} />
                <CheckReport label="Weekly summary" checked={cfg.telegramReports.weekly} onChange={v => updateNested('telegramReports', 'weekly', v)} />
                <CheckReport label="New order alert" checked={cfg.telegramReports.newOrder} onChange={v => updateNested('telegramReports', 'newOrder', v)} />
              </div>
            </div>
            <button
              onClick={() => handleTest('telegram')}
              disabled={!!testing}
              className="flex items-center gap-2 px-4 py-2 bg-[#26a5e4]/10 text-[#26a5e4] rounded-lg text-sm font-semibold hover:bg-[#26a5e4]/20 transition-colors disabled:opacity-50"
            >
              {testing === 'telegram' ? <span className="material-symbols-outlined text-[16px] animate-spin">sync</span> : <span className="material-symbols-outlined text-[16px]">send</span>}
              {testing === 'telegram' ? 'Sending…' : 'Send Test Message'}
            </button>
          </div>
        </div>

        {/* Email */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary">mail</span>
              </div>
              <div>
                <div className="font-headline font-bold text-on-surface">Email Reports</div>
                <div className="text-xs text-on-surface-variant">Send automated sales reports by email</div>
              </div>
            </div>
            <Toggle value={cfg.emailEnabled} onChange={v => update('emailEnabled', v)} />
          </div>

          <div className={`space-y-4 transition-opacity duration-200 ${cfg.emailEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div>
              <label className={labelClass}>Recipients (comma-separated)</label>
              <input type="text" value={cfg.emailRecipients} onChange={e => update('emailRecipients', e.target.value)} placeholder="owner@restaurant.com, manager@restaurant.com" className={inputClass} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>SMTP Host</label>
                <input type="text" value={cfg.emailHost} onChange={e => update('emailHost', e.target.value)} placeholder="smtp.gmail.com" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Port</label>
                <input type="text" value={cfg.emailPort} onChange={e => update('emailPort', e.target.value)} placeholder="587" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Username / Email</label>
                <input type="text" value={cfg.emailUser} onChange={e => update('emailUser', e.target.value)} placeholder="notifications@restaurant.com" className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>App Password</label>
                <input type="password" value={cfg.emailPassword} onChange={e => update('emailPassword', e.target.value)} placeholder="••••••••••••" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Report Schedule</label>
              <div className="flex flex-wrap gap-6 mt-2">
                <CheckReport label="Daily report" checked={cfg.emailReports.daily} onChange={v => updateNested('emailReports', 'daily', v)} />
                <CheckReport label="Weekly report" checked={cfg.emailReports.weekly} onChange={v => updateNested('emailReports', 'weekly', v)} />
              </div>
            </div>
            <button
              onClick={() => handleTest('email')}
              disabled={!!testing}
              className="flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-lg text-sm font-semibold hover:bg-secondary/20 transition-colors disabled:opacity-50"
            >
              {testing === 'email' ? <span className="material-symbols-outlined text-[16px] animate-spin">sync</span> : <span className="material-symbols-outlined text-[16px]">mail</span>}
              {testing === 'email' ? 'Sending…' : 'Send Test Email'}
            </button>
          </div>
        </div>

        {/* Firebase */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#f57c00]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#f57c00]">local_fire_department</span>
              </div>
              <div>
                <div className="font-headline font-bold text-on-surface">Firebase Cloud Messaging</div>
                <div className="text-xs text-on-surface-variant">Enable SMS verification services using Firebase Auth / Identity Platform</div>
              </div>
            </div>
            <Toggle value={cfg.firebaseEnabled} onChange={v => update('firebaseEnabled', v)} />
          </div>

          <div className={`space-y-4 transition-opacity duration-200 ${cfg.firebaseEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>API Key</label>
                <input type="password" value={cfg.firebaseApiKey} onChange={e => update('firebaseApiKey', e.target.value)} placeholder="AIzaSy..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Auth Domain</label>
                <input type="text" value={cfg.firebaseAuthDomain} onChange={e => update('firebaseAuthDomain', e.target.value)} placeholder="project-id.firebaseapp.com" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Project ID</label>
                <input type="text" value={cfg.firebaseProjectId} onChange={e => update('firebaseProjectId', e.target.value)} placeholder="project-id" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>App ID</label>
                <input type="text" value={cfg.firebaseAppId} onChange={e => update('firebaseAppId', e.target.value)} placeholder="1:1234567890:web:abcdef..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Messaging Sender ID</label>
                <input type="text" value={cfg.firebaseMessagingSenderId} onChange={e => update('firebaseMessagingSenderId', e.target.value)} placeholder="1234567890" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Storage Bucket</label>
                <input type="text" value={cfg.firebaseStorageBucket} onChange={e => update('firebaseStorageBucket', e.target.value)} placeholder="project-id.appspot.com" className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* BunnyNet CDN Storage */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ff6600]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#ff6600]">cloud_upload</span>
              </div>
              <div>
                <div className="font-headline font-bold text-on-surface">BunnyNet CDN</div>
                <div className="text-xs text-on-surface-variant">Store and serve product images via Bunny.net edge storage</div>
              </div>
            </div>
            <Toggle value={cfg.bunnyEnabled} onChange={v => update('bunnyEnabled', v)} />
          </div>

          <div className={`space-y-4 transition-opacity duration-200 ${cfg.bunnyEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Storage Zone Password</label>
                <input type="password" value={cfg.bunnyApiKey} onChange={e => update('bunnyApiKey', e.target.value)} placeholder="Your Storage Zone password (FTP password)" className={inputClass} />
                <p className="text-xs text-on-surface-variant mt-1">Found in your Storage Zone → FTP &amp; API Access. <strong className="text-error">Not</strong> the account API key.</p>
              </div>
              <div>
                <label className={labelClass}>Storage Zone Name</label>
                <input type="text" value={cfg.bunnyStorageZone} onChange={e => update('bunnyStorageZone', e.target.value)} placeholder="e.g. unagisushi" className={inputClass} />
                <p className="text-xs text-on-surface-variant mt-1">Your FTP username — this is the zone name used in the API URL.</p>
              </div>
              <div>
                <label className={labelClass}>Storage Region</label>
                <select value={cfg.bunnyStorageRegion} onChange={e => update('bunnyStorageRegion', e.target.value)} className={inputClass}>
                  <option value="">Default (Falkenstein)</option>
                  <option value="de">🇩🇪 Germany (Falkenstein)</option>
                  <option value="uk">🇬🇧 United Kingdom (London)</option>
                  <option value="ny">🇺🇸 US East (New York)</option>
                  <option value="la">🇺🇸 US West (Los Angeles)</option>
                  <option value="sg">🇸🇬 Asia (Singapore)</option>
                  <option value="syd">🇦🇺 Oceania (Sydney)</option>
                  <option value="br">🇧🇷 South America (São Paulo)</option>
                  <option value="jh">🇿🇦 Africa (Johannesburg)</option>
                  <option value="se">🇸🇪 Europe North (Stockholm)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>CDN Hostname</label>
                <input type="text" value={cfg.bunnyCdnHostname} onChange={e => update('bunnyCdnHostname', e.target.value)} placeholder="myzone.b-cdn.net" className={inputClass} />
                <p className="text-xs text-on-surface-variant mt-1">Your Pull Zone hostname for serving files</p>
              </div>
              <div>
                <label className={labelClass}>Pull Zone ID</label>
                <input type="text" value={cfg.bunnyPullZoneId} onChange={e => update('bunnyPullZoneId', e.target.value)} placeholder="123456" className={inputClass} />
                <p className="text-xs text-on-surface-variant mt-1">Optional — used for cache purging</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-outline-variant/10 mt-4">
            <button
              onClick={handleTestBunny}
              disabled={bunnyTesting || !cfg.bunnyApiKey || !cfg.bunnyStorageZone}
              className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-highest text-on-surface rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-surface-variant transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {bunnyTesting
                ? <><span className="material-symbols-outlined text-sm animate-spin">sync</span>Testing…</>
                : <><span className="material-symbols-outlined text-sm">wifi_tethering</span>Test Connection</>
              }
            </button>
            {bunnyTestStatus && (
              <div className={`flex items-center gap-2 text-sm font-semibold ${bunnyTestStatus.ok ? 'text-tertiary' : 'text-error'}`}>
                <span className="material-symbols-outlined text-[18px]">{bunnyTestStatus.ok ? 'check_circle' : 'error'}</span>
                {bunnyTestStatus.message}
              </div>
            )}
          </div>
        </div>

        {/* Meta Pixel */}
        <div className="bg-surface-container rounded-2xl p-8 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1877f2]/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </div>
              <div>
                <div className="font-headline font-bold text-on-surface">Meta Pixel</div>
                <div className="text-xs text-on-surface-variant">Track conversions and events on your storefront via Meta Pixel and Conversions API</div>
              </div>
            </div>
            <Toggle value={cfg.metaPixelEnabled} onChange={v => update('metaPixelEnabled', v)} />
          </div>

          <div className={`space-y-6 transition-opacity duration-200 ${cfg.metaPixelEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            {/* Pixel ID */}
            <div>
              <label className={labelClass}>Pixel ID</label>
              <input
                type="text"
                value={cfg.metaPixelId}
                onChange={e => update('metaPixelId', e.target.value)}
                placeholder="e.g. 1234567890123456"
                className={inputClass}
              />
              <p className="text-xs text-on-surface-variant mt-1">Found in Meta Events Manager → your Pixel → Settings</p>
            </div>

            {/* Conversions API */}
            <div className="border-t border-outline-variant/10 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-bold text-on-surface">Conversions API (CAPI)</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">Server-side event tracking — works alongside the browser Pixel for higher match quality and ad-blocker resilience</div>
                </div>
                <Toggle value={cfg.metaCapiEnabled} onChange={v => update('metaCapiEnabled', v)} />
              </div>

              <div className={`space-y-4 transition-opacity duration-200 ${cfg.metaCapiEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div>
                  <label className={labelClass}>Access Token</label>
                  <input
                    type="password"
                    value={cfg.metaCapiToken}
                    onChange={e => update('metaCapiToken', e.target.value)}
                    placeholder="Your CAPI Access Token"
                    className={inputClass}
                  />
                  <p className="text-xs text-on-surface-variant mt-1">Generate in Meta Events Manager → your Pixel → Settings → Conversions API → Generate Access Token</p>
                </div>
                <div>
                  <label className={labelClass}>Test Event Code <span className="normal-case font-normal text-on-surface-variant">(optional)</span></label>
                  <input
                    type="text"
                    value={cfg.metaCapiTestEventCode}
                    onChange={e => update('metaCapiTestEventCode', e.target.value)}
                    placeholder="e.g. TEST12345"
                    className={inputClass}
                  />
                  <p className="text-xs text-on-surface-variant mt-1">Use this during testing — remove it in production</p>
                </div>
              </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 bg-[#1877f2]/5 border border-[#1877f2]/20 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-[#1877f2] text-[18px] mt-0.5">info</span>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                The Pixel script is injected into your public storefront and fires <strong className="text-on-surface">PageView</strong>, <strong className="text-on-surface">ViewContent</strong>, <strong className="text-on-surface">AddToCart</strong>, and <strong className="text-on-surface">Purchase</strong> events automatically. CAPI sends the same events server-side for deduplication.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={handleSave} className="px-8 py-3 bg-secondary text-on-secondary font-bold rounded-xl hover:bg-secondary/90 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined">save</span>Save Settings
        </button>
        {saved && <div className="flex items-center gap-2 text-green-400 text-sm font-semibold"><span className="material-symbols-outlined text-[18px]">check_circle</span>Settings saved</div>}
      </div>
    </div>
  );
};

// ── Notifications Settings ──────────────────────────────────────────────────

const NotificationsSettingsView = () => {
  const [cfg, setCfg] = useState<SoundConfig>(() => getSoundConfig());
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof SoundConfig>(key: K, value: SoundConfig[K]) => {
    setCfg(prev => ({ ...prev, [key]: value }));
  };

  const updateSound = (type: string, value: boolean) => {
    setCfg(prev => ({ ...prev, sounds: { ...prev.sounds, [type]: value } }));
  };

  const handleSave = () => {
    saveSoundConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const soundEvents: { key: keyof SoundConfig['sounds']; label: string; desc: string; icon: string }[] = [
    { key: 'new_order',   label: 'New Order',       desc: 'Ascending chime when a new order arrives', icon: 'add_circle' },
    { key: 'urgent',      label: 'Urgent Order',    desc: 'Sharp double beep for urgent orders',       icon: 'priority_high' },
    { key: 'status_done', label: 'Order Completed', desc: 'Soft ping when an order is marked Done',    icon: 'check_circle' },
    { key: 'ready',       label: 'Order Ready',     desc: 'Two-tone chime when food is ready',         icon: 'restaurant' },
  ];

  return (
    <div className="space-y-8">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Notifications</h1>
        <p className="text-on-surface-variant text-sm">Configure real-time WebSocket alerts and sound preferences for your POS.</p>
      </div>

      {/* Sound System */}
      <div className="bg-surface-container rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-secondary">volume_up</span>
          <h2 className="text-lg font-bold text-on-surface font-headline">Sound System</h2>
        </div>

        {/* Master toggle */}
        <div className="flex items-center justify-between p-4 bg-surface-container-high rounded-xl">
          <div>
            <p className="font-semibold text-on-surface text-sm">Enable Sounds</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Play audio alerts for incoming events</p>
          </div>
          <button
            onClick={() => update('masterEnabled', !cfg.masterEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${cfg.masterEnabled ? 'bg-secondary' : 'bg-outline-variant'}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cfg.masterEnabled ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        {/* Volume slider */}
        <div className={cfg.masterEnabled ? '' : 'opacity-40 pointer-events-none'}>
          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">
            Volume — {Math.round(cfg.volume * 100)}%
          </label>
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-outline-variant text-sm">volume_down</span>
            <input
              type="range" min="0" max="1" step="0.05"
              value={cfg.volume}
              onChange={e => update('volume', parseFloat(e.target.value))}
              className="flex-1 accent-secondary"
            />
            <span className="material-symbols-outlined text-outline-variant text-sm">volume_up</span>
          </div>
        </div>

        {/* Per-event toggles */}
        <div className={`space-y-3 ${cfg.masterEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Event Sounds</label>
          {soundEvents.map(({ key, label, desc, icon }) => (
            <div key={key} className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">{icon}</span>
                <div>
                  <p className="text-sm font-semibold text-on-surface">{label}</p>
                  <p className="text-xs text-on-surface-variant">{desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() => playSound(key)}
                  title="Preview sound"
                  className="text-xs text-on-surface-variant hover:text-secondary transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">play_circle</span>
                </button>
                <button
                  onClick={() => updateSound(key, !cfg.sounds[key])}
                  className={`relative w-10 h-5 rounded-full transition-colors ${cfg.sounds[key] ? 'bg-secondary' : 'bg-outline-variant'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cfg.sounds[key] ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* WebSocket status card */}
      <div className="bg-surface-container rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="material-symbols-outlined text-secondary">wifi</span>
          <h2 className="text-lg font-bold text-on-surface font-headline">Real-time Connection</h2>
        </div>
        <p className="text-sm text-on-surface-variant">
          ZEN-POS uses a persistent WebSocket connection to push instant notifications for new orders, status changes,
          and urgent alerts. The connection automatically reconnects if the server restarts.
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Connection is managed automatically — no configuration required.
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={handleSave} className="px-8 py-3 bg-secondary text-on-secondary font-bold rounded-xl hover:bg-secondary/90 transition-all flex items-center gap-2">
          <span className="material-symbols-outlined">save</span>Save Preferences
        </button>
        {saved && (
          <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>Saved
          </div>
        )}
      </div>
    </div>
  );
};

// ─── ProfileSettingsView ───────────────────────────────────────────────────────
const ProfileSettingsView = ({ currentUser, onUserUpdate }: {
  currentUser: User;
  onUserUpdate: (u: User) => void;
}) => {
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email);
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [imagePreview, setImagePreview] = useState(currentUser.image || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    api.settings.uploadFile(file)
      .then(({ url }) => setImagePreview(url))
      .catch((err) => {
        console.error('Avatar upload failed:', err);
        setError('Avatar upload failed');
      })
      .finally(() => setSaving(false));
  };

  const handleSave = async () => {
    setError('');
    
    // Password validation
    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) { setError('Enter your current password to change it.'); return; }
      if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
      if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return; }
    }

    // PIN validation
    if (newPin || confirmPin) {
      if (newPin.length !== 4 || isNaN(Number(newPin))) { setError('PIN must be 4 digits.'); return; }
      if (newPin !== confirmPin) { setError('PINs do not match.'); return; }
    }

    setSaving(true);
    try {
      await api.users.updateUser(currentUser.id, { name, email, phone, image: imagePreview || undefined });
      
      if (newPassword) {
        await api.auth.changePassword(currentPassword, newPassword);
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      }

      if (newPin) {
        await api.users.updatePin(currentUser.id, newPin);
        setNewPin(''); setConfirmPin('');
      }

      onUserUpdate({ ...currentUser, name, email, phone, image: imagePreview });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">My Profile</h1>
        <p className="text-on-surface-variant text-sm">Update your personal information and account security settings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Avatar card */}
        <div className="bg-surface-container rounded-2xl p-8 flex flex-col items-center gap-4 border border-outline-variant/10">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group w-24 h-24 rounded-full bg-primary/20 border-4 border-primary/30 flex items-center justify-center overflow-hidden focus:outline-none"
            title="Change profile photo"
          >
            {imagePreview
              ? <img src={imagePreview} alt={name} className="w-full h-full object-cover" />
              : <span className="text-3xl font-bold text-primary">{initials}</span>
            }
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-white text-xl">photo_camera</span>
              <span className="text-white text-[9px] font-bold uppercase tracking-wider">Change</span>
            </div>
          </button>
          <div className="text-center">
            <p className="text-lg font-bold text-on-surface leading-tight">{name || currentUser.name}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{currentUser.email}</p>
            <span className="inline-block mt-2 px-3 py-1 bg-secondary/15 text-secondary text-[10px] font-bold uppercase tracking-widest rounded-full">
              {currentUser.role || 'Staff'}
            </span>
          </div>
          <div className="w-full pt-4 border-t border-outline-variant/10 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-on-surface-variant">Attendance</span>
              <span className="font-bold text-on-surface">{currentUser.attendanceScore ?? 0}%</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-on-surface-variant">Start Date</span>
              <span className="font-bold text-on-surface">{currentUser.startDate || '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-on-surface-variant">Contract</span>
              <span className="font-bold text-on-surface">{currentUser.contractType || '—'}</span>
            </div>
          </div>
        </div>

        {/* Edit forms */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Personal Information */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">person</span>
              <span className="font-bold text-on-surface text-sm uppercase tracking-widest">Personal Information</span>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Role</label>
                <div className="w-full px-4 py-3 bg-surface-container border border-outline-variant/20 rounded-xl text-sm text-on-surface-variant cursor-not-allowed select-none">
                  {currentUser.role || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* PIN Security */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">pin</span>
              <span className="font-bold text-on-surface text-sm uppercase tracking-widest">PIN Security</span>
              <span className="ml-auto text-[10px] text-on-surface-variant">4-digit code for kiosk & lock screen</span>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">New PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  value={newPin}
                  onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-colors tracking-widest"
                  placeholder="••••"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Confirm PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-colors tracking-widest"
                  placeholder="••••"
                />
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">lock</span>
              <span className="font-bold text-on-surface text-sm uppercase tracking-widest">Change Password</span>
              <span className="ml-auto text-[10px] text-on-surface-variant">Leave blank to keep current password</span>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Current Password', value: currentPassword, setter: setCurrentPassword, show: showCurrentPw, toggle: () => setShowCurrentPw(v => !v) },
                { label: 'New Password', value: newPassword, setter: setNewPassword, show: showNewPw, toggle: () => setShowNewPw(v => !v) },
                { label: 'Confirm New Password', value: confirmPassword, setter: setConfirmPassword, show: showConfirmPw, toggle: () => setShowConfirmPw(v => !v) },
              ].map(({ label, value, setter, show, toggle }) => (
                <div key={label}>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">{label}</label>
                  <div className="relative">
                    <input
                      type={show ? 'text' : 'password'}
                      value={value}
                      onChange={e => setter(e.target.value)}
                      className="w-full px-4 py-3 pr-10 bg-surface-container-high border border-outline-variant/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={toggle}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">{show ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Error / Save */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">{saving ? 'hourglass_empty' : 'save'}</span>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saved && (
              <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>Saved
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


// ── Delivery Management View ────────────────────────────────────────────────
const DeliveryManagementView = () => {
  const { formatCurrency } = useLocalization();
  const [tab, setTab] = useState<'places' | 'agents'>('places');
  // Places
  const [places, setPlaces] = useState<{ id: string; name: string; wilaya: string; delivery_fee: number; is_active: boolean }[]>([]);
  const [placeForm, setPlaceForm] = useState({ name: '', wilaya: '', delivery_fee: '' });
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeSearch, setPlaceSearch] = useState('');
  // Agents
  const [agents, setAgents] = useState<{ id: string; name: string; phone: string; vehicle_type: string; is_active: boolean }[]>([]);
  const [agentForm, setAgentForm] = useState({ name: '', phone: '', vehicle_type: '' });
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState('');
  // Shared
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'place' | 'agent'; id: string; name: string } | null>(null);

  useEffect(() => {
    api.delivery.listPlaces().then(setPlaces).catch(console.error);
    api.delivery.listAgents().then(setAgents).catch(console.error);
  }, []);

  // ── Place handlers ──
  const handleSavePlace = async () => {
    if (!placeForm.name.trim()) return;
    const fee = parseFloat(placeForm.delivery_fee) || 0;
    if (editingPlaceId) {
      const updated = await api.delivery.updatePlace(editingPlaceId, { name: placeForm.name, wilaya: placeForm.wilaya, delivery_fee: fee });
      setPlaces(prev => prev.map(p => p.id === editingPlaceId ? updated : p));
      setEditingPlaceId(null);
    } else {
      const created = await api.delivery.createPlace({ name: placeForm.name, wilaya: placeForm.wilaya, delivery_fee: fee, is_active: true });
      setPlaces(prev => [...prev, created]);
    }
    setPlaceForm({ name: '', wilaya: '', delivery_fee: '' });
  };

  const handleTogglePlace = async (id: string, active: boolean) => {
    const updated = await api.delivery.updatePlace(id, { is_active: active });
    setPlaces(prev => prev.map(p => p.id === id ? updated : p));
  };

  const handleDeletePlace = async (id: string) => {
    await api.delivery.deletePlace(id);
    setPlaces(prev => prev.filter(p => p.id !== id));
  };

  // ── Agent handlers ──
  const handleSaveAgent = async () => {
    if (!agentForm.name.trim() || !agentForm.phone.trim()) return;
    if (editingAgentId) {
      const updated = await api.delivery.updateAgent(editingAgentId, { name: agentForm.name, phone: agentForm.phone, vehicle_type: agentForm.vehicle_type });
      setAgents(prev => prev.map(a => a.id === editingAgentId ? updated : a));
      setEditingAgentId(null);
    } else {
      const created = await api.delivery.createAgent({ name: agentForm.name, phone: agentForm.phone, vehicle_type: agentForm.vehicle_type, is_active: true });
      setAgents(prev => [...prev, created]);
    }
    setAgentForm({ name: '', phone: '', vehicle_type: '' });
  };

  const handleToggleAgent = async (id: string, active: boolean) => {
    const updated = await api.delivery.updateAgent(id, { is_active: active });
    setAgents(prev => prev.map(a => a.id === id ? updated : a));
  };

  const handleDeleteAgent = async (id: string) => {
    await api.delivery.deleteAgent(id);
    setAgents(prev => prev.filter(a => a.id !== id));
  };

  const filteredPlaces = places.filter(p => p.name.toLowerCase().includes(placeSearch.toLowerCase()) || p.wilaya.toLowerCase().includes(placeSearch.toLowerCase()));
  const filteredAgents = agents.filter(a => a.name.toLowerCase().includes(agentSearch.toLowerCase()) || a.phone.includes(agentSearch));

  return (
    <>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Delivery Management</h1>
          <p className="text-on-surface-variant text-sm">Manage delivery zones and delivery agents for your restaurant.</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-8">
        {(['places', 'agents'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
              tab === t ? 'bg-primary text-on-primary shadow-md' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'
            }`}
          >
            <span className="material-symbols-outlined text-sm mr-2 align-middle">{t === 'places' ? 'location_on' : 'person_pin'}</span>
            {t === 'places' ? 'Delivery Places' : 'Delivery Agents'}
          </button>
        ))}
      </div>

      {/* ── PLACES TAB ─────────────────────────────────────────────── */}
      {tab === 'places' && (
        <div className="space-y-6">
          {/* Add/edit form */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/20 p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">{editingPlaceId ? 'Edit Place' : 'Add Delivery Place'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text" placeholder="Municipality / Zone name *"
                value={placeForm.name} onChange={e => setPlaceForm({ ...placeForm, name: e.target.value })}
                className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
              <input
                type="text" placeholder="Wilaya / Region (optional)"
                value={placeForm.wilaya} onChange={e => setPlaceForm({ ...placeForm, wilaya: e.target.value })}
                className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
              <div className="flex gap-2">
                <input
                  type="number" placeholder="Delivery fee"
                  value={placeForm.delivery_fee} onChange={e => setPlaceForm({ ...placeForm, delivery_fee: e.target.value })}
                  className="flex-1 bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
                <button
                  onClick={handleSavePlace}
                  disabled={!placeForm.name.trim()}
                  className="px-5 py-3 bg-primary text-on-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">{editingPlaceId ? 'save' : 'add'}</span>
                  {editingPlaceId ? 'Save' : 'Add'}
                </button>
                {editingPlaceId && (
                  <button onClick={() => { setEditingPlaceId(null); setPlaceForm({ name: '', wilaya: '', delivery_fee: '' }); }} className="px-3 py-3 bg-surface-container-highest text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-variant transition-all">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-2.5 border border-outline-variant/20 max-w-md">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
            <input type="text" placeholder="Search places…" value={placeSearch} onChange={e => setPlaceSearch(e.target.value)} className="flex-1 bg-transparent border-none focus:outline-none text-sm text-on-surface" />
          </div>

          {/* List */}
          <div className="grid gap-3">
            {filteredPlaces.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant opacity-50">
                <span className="material-symbols-outlined text-4xl mb-2 block">location_off</span>
                <p className="text-sm">No delivery places yet. Add one above to get started.</p>
              </div>
            ) : filteredPlaces.map(place => (
              <div key={place.id} className={`bg-surface-container rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between gap-4 transition-all hover:border-primary/30 ${!place.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary">location_on</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface text-sm truncate">{place.name}</p>
                    {place.wilaya && <p className="text-xs text-on-surface-variant">{place.wilaya}</p>}
                  </div>
                  {place.delivery_fee > 0 && (
                    <span className="text-xs font-bold text-secondary bg-secondary/10 px-2 py-1 rounded-lg flex-shrink-0">{formatCurrency(place.delivery_fee)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTogglePlace(place.id, !place.is_active)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${place.is_active ? 'bg-primary' : 'bg-outline-variant/30'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow ${place.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <button
                    onClick={() => { setEditingPlaceId(place.id); setPlaceForm({ name: place.name, wilaya: place.wilaya, delivery_fee: String(place.delivery_fee) }); }}
                    className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ type: 'place', id: place.id, name: place.name })}
                    className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Stats bar */}
          <div className="flex gap-4 text-xs text-on-surface-variant">
            <span>{places.length} total</span>
            <span className="text-primary">{places.filter(p => p.is_active).length} active</span>
           <span className="text-outline-variant">{places.filter(p => !p.is_active).length} inactive</span>
          </div>
        </div>
      )}

      {/* ── AGENTS TAB ─────────────────────────────────────────────── */}
      {tab === 'agents' && (
        <div className="space-y-6">
          {/* Add/edit form */}
          <div className="bg-surface-container rounded-2xl border border-outline-variant/20 p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4">{editingAgentId ? 'Edit Agent' : 'Add Delivery Agent'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <input
                type="text" placeholder="Agent name *"
                value={agentForm.name} onChange={e => setAgentForm({ ...agentForm, name: e.target.value })}
                className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
              <input
                type="tel" placeholder="Phone number *"
                value={agentForm.phone} onChange={e => setAgentForm({ ...agentForm, phone: e.target.value })}
                className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
              />
              <select
                value={agentForm.vehicle_type} onChange={e => setAgentForm({ ...agentForm, vehicle_type: e.target.value })}
                className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
              >
                <option value="">Vehicle type</option>
                <option value="Motorcycle">Motorcycle</option>
                <option value="Car">Car</option>
                <option value="Bicycle">Bicycle</option>
                <option value="Van">Van</option>
                <option value="On foot">On foot</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveAgent}
                  disabled={!agentForm.name.trim() || !agentForm.phone.trim()}
                  className="flex-1 px-5 py-3 bg-primary text-on-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">{editingAgentId ? 'save' : 'add'}</span>
                  {editingAgentId ? 'Save' : 'Add'}
                </button>
                {editingAgentId && (
                  <button onClick={() => { setEditingAgentId(null); setAgentForm({ name: '', phone: '', vehicle_type: '' }); }} className="px-3 py-3 bg-surface-container-highest text-on-surface-variant rounded-xl text-xs font-bold hover:bg-surface-variant transition-all">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 bg-surface-container rounded-xl px-4 py-2.5 border border-outline-variant/20 max-w-md">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
            <input type="text" placeholder="Search agents…" value={agentSearch} onChange={e => setAgentSearch(e.target.value)} className="flex-1 bg-transparent border-none focus:outline-none text-sm text-on-surface" />
          </div>

          {/* List */}
          <div className="grid gap-3">
            {filteredAgents.length === 0 ? (
              <div className="text-center py-12 text-on-surface-variant opacity-50">
                <span className="material-symbols-outlined text-4xl mb-2 block">person_off</span>
                <p className="text-sm">No delivery agents yet. Add one above to get started.</p>
              </div>
            ) : filteredAgents.map(agent => (
              <div key={agent.id} className={`bg-surface-container rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between gap-4 transition-all hover:border-primary/30 ${!agent.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-tertiary/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-tertiary">person_pin</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface text-sm truncate">{agent.name}</p>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">phone</span>{agent.phone}
                    </p>
                  </div>
                  {agent.vehicle_type && (
                    <span className="text-xs font-bold text-tertiary bg-tertiary/10 px-2 py-1 rounded-lg flex-shrink-0 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                      {agent.vehicle_type}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleAgent(agent.id, !agent.is_active)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${agent.is_active ? 'bg-primary' : 'bg-outline-variant/30'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all shadow ${agent.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <button
                    onClick={() => { setEditingAgentId(agent.id); setAgentForm({ name: agent.name, phone: agent.phone, vehicle_type: agent.vehicle_type }); }}
                    className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ type: 'agent', id: agent.id, name: agent.name })}
                    className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Stats bar */}
          <div className="flex gap-4 text-xs text-on-surface-variant">
            <span>{agents.length} total</span>
            <span className="text-primary">{agents.filter(a => a.is_active).length} active</span>
            <span className="text-outline-variant">{agents.filter(a => !a.is_active).length} inactive</span>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          title={`Delete ${deleteConfirm.type === 'place' ? 'Place' : 'Agent'}`}
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This action cannot be undone.`}
          onConfirm={() => {
            if (deleteConfirm.type === 'place') handleDeletePlace(deleteConfirm.id);
            else handleDeleteAgent(deleteConfirm.id);
          }}
          onClose={() => setDeleteConfirm(null)}
        />
      )}
    </>
  );
};


export const SettingsView = ({ currentSetting, hasPermission, branding: appBranding, onBrandingUpdate, currentUser, onUserUpdate }: {
  currentSetting: string;
  hasPermission: (p: Permission) => boolean;
  branding?: BrandingData;
  onBrandingUpdate?: (b: BrandingData) => void;
  currentUser?: User;
  onUserUpdate?: (u: User) => void;
}) => {
  const { formatCurrency } = useLocalization();
  const [selectedDossierUser, setSelectedDossierUser] = useState<{ user: User, edit: boolean, log?: 'Reward' | 'Sanction' } | null>(null);
  const [selectedWithdrawalUser, setSelectedWithdrawalUser] = useState<User | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isEditScheduleOpen, setIsEditScheduleOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [confirmFireBulk, setConfirmFireBulk] = useState(false);
  const [confirmFireUser, setConfirmFireUser] = useState<string | null>(null);

  const toggleUserSelect = (id: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedUserIds(next);
  };
  const toggleSelectAllUsers = () => {
    const visible = users.filter(u => !u.isSystem);
    if (selectedUserIds.size === visible.length && visible.length > 0) setSelectedUserIds(new Set());
    else setSelectedUserIds(new Set(visible.map(u => u.id)));
  };
  const fireSelectedUsers = async () => {
    try {
      for (const id of Array.from(selectedUserIds)) {
        await api.users.deleteUser(id);
      }
      setSelectedUserIds(new Set());
      loadUsers();
    } catch(err) { console.error('Fire failed', err); }
  };
  const fireUser = async (id: string) => {
    try {
      await api.users.deleteUser(id);
      loadUsers();
    } catch(err) { console.error('Fire failed', err); }
  };

  const loadUsers = useCallback(() => { api.users.listUsers().then(setUsers).catch(console.error); }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    return zenWs.onEvent(e => {
      if (e.type === 'user_update') loadUsers();
    });
  }, [loadUsers]);

  // Clear open modals when the user switches between admin sections
  useEffect(() => {
    setSelectedDossierUser(null);
    setSelectedWithdrawalUser(null);
  }, [currentSetting]);
  const [hrSelectedMonth, setHrSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Derived from hrSelectedMonth — single source of truth
  const hrDateRange = useMemo(() => {
    const [y, m] = hrSelectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${lastDay}` };
  }, [hrSelectedMonth]);

  // Build the list of selectable months (current month + 23 months back)
  const hrMonthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  }, []);

  const [attendanceReport, setAttendanceReport] = useState<import('../api/attendance').AttendanceReport | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<import('../api/attendance').AttendanceRecord[]>([]);
  const [allPerformanceLogs, setAllPerformanceLogs] = useState<import('../api/payroll').PerformanceLogEntry[]>([]);
  // Tick every 60 s so "Online since Xm" labels stay current without a full re-fetch
  const [, setAttendanceTick] = useState(0);

  useEffect(() => {
    if (currentSetting !== 'hr') return;
    api.attendance.getReport(hrDateRange.start, hrDateRange.end)
      .then(setAttendanceReport)
      .catch(console.error);
  }, [currentSetting, hrDateRange]);

  useEffect(() => {
    if (currentSetting !== 'hr') return;
    api.payroll.getPerformanceLogs().then(setAllPerformanceLogs).catch(console.error);
  }, [currentSetting]);

  // Fetch live check-in status and refresh every 30 s while HR section is open
  useEffect(() => {
    if (currentSetting !== 'hr') return;
    const fetch = () => api.attendance.getTodayRecords().then(setTodayAttendance).catch(console.error);
    fetch();
    const fetchInterval = setInterval(fetch, 30_000);
    const tickInterval = setInterval(() => setAttendanceTick(t => t + 1), 60_000);
    return () => { clearInterval(fetchInterval); clearInterval(tickInterval); };
  }, [currentSetting]);

  const [branding, setBranding] = useState<BrandingData>(() => {
    // Prioritise prop from App (already fetched from API), then localStorage cache, then hardcoded defaults
    if (appBranding) return appBranding;
    try {
      const cached = localStorage.getItem('zenpos_branding');
      if (cached) return { ...DEFAULT_BRANDING, ...JSON.parse(cached) };
    } catch {}
    return DEFAULT_BRANDING;
  });
  // Keep in sync when App-level branding updates (API response arrives or external save)
  useEffect(() => { if (appBranding) setBranding(appBranding); }, [appBranding]);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // ── Locations state ────────────────────────────────────────
  const [locations, setLocations] = useState<import('../api/locations').Location[]>([]);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<import('../api/locations').Location | null>(null);
  const [locationForm, setLocationForm] = useState({ name: '', subtitle: '', address: '', phone: '', email: '', tablesCount: 0, barCount: 0, openingTime: '09:00', closingTime: '22:00' });
  const [locationSaving, setLocationSaving] = useState(false);

  const loadLocations = () => { api.locations.listLocations().then(setLocations).catch(console.error); };
  useEffect(() => { if (currentSetting === 'locations') loadLocations(); }, [currentSetting]);

  const openAddLocation = () => {
    setEditingLocation(null);
    setLocationForm({ name: '', subtitle: '', address: '', phone: '', email: '', tablesCount: 0, barCount: 0, openingTime: '09:00', closingTime: '22:00' });
    setLocationModalOpen(true);
  };

  const openEditLocation = (loc: import('../api/locations').Location) => {
    setEditingLocation(loc);
    setLocationForm({ name: loc.name, subtitle: loc.subtitle ?? '', address: loc.address, phone: loc.phone, email: loc.email, tablesCount: loc.tablesCount, barCount: loc.barCount, openingTime: loc.openingTime || '09:00', closingTime: loc.closingTime || '22:00' });
    setLocationModalOpen(true);
  };

  const handleSaveLocation = async () => {
    setLocationSaving(true);
    try {
      if (editingLocation) {
        const updated = await api.locations.updateLocation(editingLocation.id, locationForm);
        setLocations(prev => prev.map(l => l.id === updated.id ? updated : l));
      } else {
        const created = await api.locations.createLocation(locationForm);
        setLocations(prev => [...prev, created]);
      }
      setLocationModalOpen(false);
    } catch (err: any) { console.error('Location save failed:', err.message); }
    finally { setLocationSaving(false); }
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await api.locations.deleteLocation(id);
      setLocations(prev => prev.filter(l => l.id !== id));
    } catch (err: any) { showError('Failed to delete location: ' + (err?.message || 'Unknown error')); }
  };

  const handleSaveBranding = async () => {
    setBrandingSaving(true);
    try {
      const updated = await api.settings.updateBranding(branding);
      onBrandingUpdate?.(updated);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2500);
    } catch (err: any) {
      console.error('Branding save failed:', err.message);
    } finally {
      setBrandingSaving(false);
    }
  };

  const nonSystemUsers = users.filter(u => !u.isSystem);

  // Pre-compute per-user HR data — recomputes only when data/range changes, not on the 60s tick
  const hrUserData = useMemo(() => {
    const startDt = new Date(hrDateRange.start + 'T00:00:00');
    const endDt = new Date(hrDateRange.end + 'T00:00:00');

    // Group all performance logs by userId for O(1) lookup
    const logsByUser = new Map<string, import('../api/payroll').PerformanceLogEntry[]>();
    allPerformanceLogs.forEach(l => {
      if (!logsByUser.has(l.userId)) logsByUser.set(l.userId, []);
      logsByUser.get(l.userId)!.push(l);
    });

    return nonSystemUsers.map(user => {
      const reportSummary = attendanceReport?.summaries.find(s => s.userId === user.id);
      const reportRecordMap = new Map<string, NonNullable<typeof reportSummary>['records'][0]>();
      reportSummary?.records.forEach(r => reportRecordMap.set(r.date, r));

      const contributionRecords: ContributionDayRecord[] = [];
      if (startDt.getTime() <= endDt.getTime()) {
        for (let d = new Date(startDt); d <= endDt; d.setDate(d.getDate() + 1)) {
          const iso = d.toISOString().split('T')[0];
          if (reportSummary) {
            const rec = reportRecordMap.get(iso);
            contributionRecords.push(rec ? {
              date: iso, hours: rec.hours || 0, isLate: rec.isLate,
              isEarlyDeparture: rec.isEarlyDeparture, isOvertime: rec.isOvertime,
              isEarlyArrival: false,
              checkIn: rec.checkIn, checkOut: rec.checkOut,
            } : { date: iso, hours: 0, isLate: false, isEarlyDeparture: false, isOvertime: false, isEarlyArrival: false });
          } else {
            const rec = user.monthlyAttendance.find(a => a.day === iso);
            contributionRecords.push(rec ? {
              date: iso, hours: rec.hours || 0, isLate: rec.isLate,
              isEarlyDeparture: rec.isEarlyDeparture, isOvertime: rec.isOvertime,
              isEarlyArrival: (rec as any).isEarlyArrival ?? false,
              checkIn: rec.checkIn, checkOut: rec.checkOut,
            } : { date: iso, hours: 0, isLate: false, isEarlyDeparture: false, isOvertime: false, isEarlyArrival: false });
          }
        }
      }

      const workedDays = contributionRecords.filter(r => r.checkIn).length;

      // Hourly rate: (baseSalary / 22 working days) / 8 hours
      const hourlyRate = user.baseSalary / (22 * 8);
      let deduction = 0;
      let overtimeBonus = 0;
      contributionRecords.forEach(r => {
        if (!r.checkIn) return;
        const shortfall = 8 - r.hours;
        if ((r.isLate || r.isEarlyDeparture) && shortfall > 0) {
          deduction += shortfall * hourlyRate;
        }
        if (r.isOvertime && r.hours > 8) {
          overtimeBonus += (r.hours - 8) * hourlyRate;
        }
      });
      deduction = Math.round(deduction * 100) / 100;
      overtimeBonus = Math.round(overtimeBonus * 100) / 100;
      const attendanceAdjustments = Math.round((overtimeBonus - deduction) * 100) / 100;

      const userLogs = logsByUser.get(user.id) || [];
      const userRewards = Math.round(userLogs.filter(l => l.type === 'Reward').reduce((s, l) => s + (parseFloat(l.impact) || 0), 0) * 100) / 100;
      const userSanctions = Math.round(userLogs.filter(l => l.type === 'Sanction').reduce((s, l) => s + (parseFloat(l.impact) || 0), 0) * 100) / 100;
      const totalSalary = Math.round((user.baseSalary + userRewards - userSanctions + attendanceAdjustments) * 100) / 100;

      const liveScore = workedDays > 0
        ? Math.round((contributionRecords.filter(r => r.checkIn && !r.isLate && !r.isEarlyDeparture).length / workedDays) * 100)
        : 0;
      const totalHours = contributionRecords.reduce((sum, r) => sum + (r.hours || 0), 0);

      return {
        user, reportSummary, contributionRecords,
        workedDays, liveScore, totalHours, hourlyRate,
        deduction, overtimeBonus,
        attendanceAdjustments, totalSalary,
        userRewards, userSanctions,
      };
    });
  }, [nonSystemUsers, attendanceReport, hrDateRange, allPerformanceLogs]);

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-grid-pattern">
      <div className="max-w-6xl mx-auto">
        {currentSetting === 'sales' && <SalesView />}
        {currentSetting === 'finance' && <FinanceDashboard />}
        {currentSetting === 'customers' && <CustomersView />}
        {currentSetting === 'products' && <ProductManagementView />}
        {currentSetting === 'inventory' && <InventoryView />}
        {currentSetting === 'localization' && <LocalizationView />}
        {currentSetting === 'integration' && <IntegrationView />}
        {currentSetting === 'delivery' && <DeliveryManagementView />}
        {currentSetting === 'notifications' && <NotificationsSettingsView />}
        {currentSetting === 'profile' && currentUser && <ProfileSettingsView currentUser={currentUser} onUserUpdate={onUserUpdate ?? (() => {})} />}
        {currentSetting === 'branding' && (
          <>
            <div className="flex items-center justify-between mb-10">
              <div>
                <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Branding</h1>
                <p className="text-on-surface-variant text-sm">Define your restaurant's visual identity across all digital and physical touchpoints.</p>
              </div>
              <button
                onClick={handleSaveBranding}
                disabled={brandingSaving}
                className="px-6 py-3 bg-secondary text-on-secondary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors shadow flex items-center gap-2 disabled:opacity-60"
              >
                {brandingSaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving…
                  </>
                ) : brandingSaved ? (
                  <><span className="material-symbols-outlined">check_circle</span> Saved!</>
                ) : (
                  <><span className="material-symbols-outlined">save</span> Save Changes</>
                )}
              </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              {/* Identity Section */}
              <div className="lg:col-span-2 bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10">
                <h3 className="text-lg font-bold font-headline mb-8 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">fingerprint</span> Identity Section
                </h3>
                
                <div className="flex flex-col md:flex-row gap-10">
                  <div className="flex-shrink-0">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Restaurant Logo</label>
                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setBrandingSaving(true);
                        try {
                          const { url } = await api.settings.uploadFile(file);
                          const updatedBranding = { ...branding, logo: url };
                          setBranding(updatedBranding);
                          // Auto-save to backend so logo persists on reload
                          const saved = await api.settings.updateBranding(updatedBranding);
                          onBrandingUpdate?.(saved);
                          setBrandingSaved(true);
                          setTimeout(() => setBrandingSaved(false), 2500);
                        } catch (err: any) {
                          console.error('Logo upload failed:', err);
                          alert('Logo upload failed');
                        } finally {
                          setBrandingSaving(false);
                        }
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      disabled={brandingSaving}
                      className={`w-48 h-48 bg-surface-container-lowest rounded-xl border-2 border-dashed border-outline-variant/30 flex items-center justify-center relative group overflow-hidden transition-colors ${brandingSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:border-primary/40'}`}
                    >
                      {brandingSaving ? (
                        <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                      ) : branding.logo ? (
                        <img src={branding.logo} alt="Logo" className="w-full h-full object-contain p-4" />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-on-surface-variant/50">
                          <span className="material-symbols-outlined text-4xl">add_photo_alternate</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest">Upload Logo</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-white text-2xl">photo_camera</span>
                        <span className="text-white text-[10px] font-bold uppercase tracking-wider">{branding.logo ? 'Change' : 'Upload'}</span>
                      </div>
                    </button>
                    {branding.logo && (
                      <button
                        type="button"
                        onClick={async () => {
                          const updatedBranding = { ...branding, logo: '' };
                          setBranding(updatedBranding);
                          setBrandingSaving(true);
                          try {
                            const saved = await api.settings.updateBranding(updatedBranding);
                            onBrandingUpdate?.(saved);
                          } catch (err: any) {
                            console.error('Failed to remove logo:', err);
                          } finally {
                            setBrandingSaving(false);
                          }
                        }}
                        className="mt-2 w-full text-[10px] font-bold uppercase tracking-widest text-error/60 hover:text-error transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Restaurant Name</label>
                    <input
                      type="text"
                      value={branding.restaurantName}
                      onChange={(e) => setBranding({...branding, restaurantName: e.target.value})}
                      className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl px-6 py-4 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold text-lg mb-4"
                    />
                    <p className="text-xs text-on-surface-variant leading-relaxed mb-6">The global restaurant name shown in the top bar. Each location has its own subtitle set in POS Settings → Locations.</p>
                    
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Site Meta Title</label>
                    <input
                      type="text"
                      value={branding.metaTitle || ''}
                      onChange={(e) => setBranding({...branding, metaTitle: e.target.value})}
                      placeholder={branding.restaurantName}
                      className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl px-6 py-4 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold text-lg mb-4"
                    />
                    <p className="text-xs text-on-surface-variant leading-relaxed">The name of the site shown in the browser tab.</p>
                  </div>
                </div>
              </div>

              {/* Color Palette */}
              <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10">
                <h3 className="text-lg font-bold font-headline mb-8 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">palette</span> Color Palette
                </h3>
                <p className="text-xs text-on-surface-variant mb-6 -mt-4">Changes apply live across the entire app.</p>

                <div className="space-y-4">
                  {([
                    { label: 'Primary', key: 'primaryColor' as const },
                    { label: 'Secondary', key: 'secondaryColor' as const },
                    { label: 'Accent', key: 'accentColor' as const },
                  ] as const).map(({ label, key }) => (
                    <label key={key} className="flex items-center gap-4 cursor-pointer group">
                      <div className="relative w-12 h-12 rounded-lg shadow-inner overflow-hidden border border-outline-variant/20 flex-shrink-0 group-hover:ring-2 group-hover:ring-secondary/40 transition-all">
                        <div className="absolute inset-0" style={{ backgroundColor: branding[key] }} />
                        <input
                          type="color"
                          value={branding[key]}
                          onChange={(e) => setBranding({ ...branding, [key]: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm text-on-surface">{label}</p>
                        <p className="text-[10px] font-mono text-on-surface-variant uppercase">{branding[key]}</p>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant text-sm opacity-0 group-hover:opacity-100 transition-opacity">colorize</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Receipt Design */}
            <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10 mb-8">
                <h3 className="text-lg font-bold font-headline mb-8 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">receipt_long</span> Receipt Design
                </h3>
                
                <div className="flex flex-col md:flex-row gap-10">
                  <div className="flex-1 space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-on-surface">Compact Layout</span>
                      <Switch enabled={branding.compactLayout} onChange={(val) => setBranding({...branding, compactLayout: val})} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-on-surface">Show Itemized Tax</span>
                      <Switch enabled={branding.showItemizedTax} onChange={(val) => setBranding({...branding, showItemizedTax: val})} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-on-surface">Print QR Code</span>
                      <Switch enabled={branding.printQrCode} onChange={(val) => setBranding({...branding, printQrCode: val})} />
                    </div>
                    
                    <div className="pt-4">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Receipt Footer Text</label>
                      <textarea
                        value={branding.footerText}
                        onChange={(e) => setBranding({...branding, footerText: e.target.value})}
                        className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium h-24 resize-none italic"
                      />
                    </div>

                  </div>
                  
                  <div className="flex-shrink-0">
                    {(() => {
                      const Sep = () => <div className="border-t border-dashed border-black/30 my-1" />;
                      const Sep2 = () => <div className="border-t-2 border-black my-1" />;
                      const mockItems = [
                        { name: '1x Ootoro Sashimi', price: 1800 },
                        { name: '1x Sake Selection', price: 950 },
                        { name: '1x Seasonal Nigiri', price: 600 },
                      ];
                      const mockSubtotal = mockItems.reduce((s, i) => s + i.price, 0);
                      const mockTotal = mockSubtotal;
                      return (
                        <div className="w-52 bg-white shadow-xl text-black font-mono text-[9px] leading-snug">
                          <div className="text-center pt-4 px-3 pb-2">
                            {branding.logo && <img src={branding.logo} alt="logo" className="w-8 h-8 object-contain mx-auto mb-1" style={{ filter: 'grayscale(1) contrast(2)' }} />}
                            <div className="font-bold text-[11px] uppercase tracking-wide">{branding.restaurantName || 'ZEN POS'}</div>
                            {(branding.address || '').split('\n').filter(Boolean).map((line, i) => (
                              <div key={i} className="text-[8px] opacity-70">{line}</div>
                            ))}
                            {branding.phone && <div className="text-[8px] opacity-70">{branding.phone}</div>}
                          </div>
                          <div className="px-3"><Sep /></div>
                          <div className="px-3 py-0.5 text-[8px] opacity-60">
                            <div>Order: #0001</div>
                            <div>Date:  {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                            <div>Type:  Dine in</div>
                          </div>
                          <div className="px-3"><Sep /></div>
                          <div className="px-3 py-1 space-y-1">
                            {mockItems.map((item, i) => (
                              <div key={i} className="flex justify-between">
                                <span>{item.name}</span>
                                <span>{formatCurrency(item.price)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="px-3"><Sep /></div>
                          <div className="px-3 py-0.5 text-[8px] opacity-70">
                            <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(mockSubtotal)}</span></div>
                          </div>
                          <div className="px-3"><Sep2 /></div>
                          <div className="px-3 flex justify-between font-bold text-[10px]">
                            <span>TOTAL:</span><span>{formatCurrency(mockTotal)}</span>
                          </div>
                          <div className="px-3"><Sep2 /></div>
                          <div className="text-center text-[8px] py-2 px-3 italic opacity-60">{branding.footerText || 'Thank you for dining with us!'}</div>
                          {branding.printQrCode && (
                            <div className="flex flex-col items-center gap-0.5 pb-3">
                              <div className="text-[7px] font-bold tracking-wider">*** FIDELITY PROGRAM ***</div>
                              <QRCode value={`${window.location.origin}/track/ORDER-0001`} size={52} />
                              <div className="text-[7px] opacity-50 uppercase tracking-widest">SCAN ME</div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Public Menu Layout */}
              <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10">
                <h3 className="text-lg font-bold font-headline mb-2 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">grid_view</span> Public Menu Layout
                </h3>
                <p className="text-xs text-on-surface-variant mb-8">Choose how product cards appear on the customer-facing menu.</p>
                <div className="flex gap-4">
                  {(['vertical', 'horizontal'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setBranding({...branding, publicMenuCardLayout: opt})}
                      className={`flex-1 flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-colors ${branding.publicMenuCardLayout === opt ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-outline-variant/40'}`}
                    >
                      {opt === 'vertical' ? (
                        <div className="w-20 h-24 rounded-lg border border-outline-variant/30 overflow-hidden flex flex-col bg-surface-container-lowest">
                          <div className="h-10 bg-surface-container-high" />
                          <div className="flex-1 p-1.5 flex flex-col justify-between">
                            <div className="space-y-1">
                              <div className="h-1.5 bg-on-surface/20 rounded w-full" />
                              <div className="h-1.5 bg-primary/40 rounded w-2/3" />
                            </div>
                            <div className="flex justify-end"><div className="w-5 h-5 rounded bg-primary-container" /></div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-20 h-24 rounded-lg border border-outline-variant/30 overflow-hidden flex flex-col gap-1.5 bg-surface-container-lowest p-1.5">
                          {[0,1].map(i => (
                            <div key={i} className="flex-1 rounded border border-outline-variant/20 overflow-hidden flex flex-row bg-surface-container-lowest">
                              <div className="w-7 bg-surface-container-high" />
                              <div className="flex-1 p-1 flex flex-col justify-between">
                                <div className="h-1 bg-on-surface/20 rounded w-full" />
                                <div className="flex justify-end"><div className="w-3 h-3 rounded bg-primary-container" /></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${branding.publicMenuCardLayout === opt ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {opt === 'vertical' ? 'Vertical Grid' : 'Horizontal List'}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-outline-variant/10">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Daily Specials Message</label>
                  <p className="text-[9px] text-on-surface-variant mb-3">Displayed as a banner on the public menu. Leave empty to hide the banner.</p>
                  <textarea
                    value={branding.dailySpecial || ''}
                    onChange={(e) => setBranding({...branding, dailySpecial: e.target.value})}
                    placeholder="e.g. Today's special: Kinmedai from Toyosu Market, Shima Aji nigiri. Ask your server for details."
                    className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium h-20 resize-none"
                  />
                </div>
              </div>

              {/* Order Tracking Image */}
              <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10">
                <h3 className="text-lg font-bold font-headline mb-2 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">local_shipping</span> Order Tracking Image
                </h3>
                <p className="text-xs text-on-surface-variant mb-8">Illustration shown on the customer order tracking page. Defaults to the built-in bag graphic.</p>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="tracking-image-input"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBrandingSaving(true);
                    try {
                      const { url } = await api.settings.uploadFile(file);
                      const updatedBranding = { ...branding, trackingImage: url };
                      setBranding(updatedBranding);
                      const saved = await api.settings.updateBranding(updatedBranding);
                      onBrandingUpdate?.(saved);
                      setBrandingSaved(true);
                      setTimeout(() => setBrandingSaved(false), 2500);
                    } catch (err: any) {
                      console.error('Tracking image upload failed:', err);
                      alert('Image upload failed');
                    } finally {
                      setBrandingSaving(false);
                    }
                    e.target.value = '';
                  }}
                />
                <div className="flex items-start gap-6">
                  <button
                    type="button"
                    onClick={() => document.getElementById('tracking-image-input')?.click()}
                    disabled={brandingSaving}
                    className={`w-40 h-40 flex-shrink-0 bg-surface-container-lowest rounded-xl border-2 border-dashed border-outline-variant/30 flex items-center justify-center relative group overflow-hidden transition-colors ${brandingSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:border-primary/40'}`}
                  >
                    {brandingSaving ? (
                      <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                    ) : branding.trackingImage ? (
                      <img src={branding.trackingImage} alt="Tracking" className="w-full h-full object-contain p-3" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-on-surface-variant/50">
                        <span className="material-symbols-outlined text-4xl">add_photo_alternate</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-center leading-tight">Upload<br/>Image</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-white text-2xl">photo_camera</span>
                      <span className="text-white text-[10px] font-bold uppercase tracking-wider">{branding.trackingImage ? 'Change' : 'Upload'}</span>
                    </div>
                  </button>
                  <div className="flex-1 flex flex-col gap-3 pt-1">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Upload a PNG, WebP or SVG. Recommended: transparent background, square format, minimum 400×400 px.
                    </p>
                    {branding.trackingImage && (
                      <button
                        type="button"
                        onClick={async () => {
                          const updatedBranding = { ...branding, trackingImage: '' };
                          setBranding(updatedBranding);
                          setBrandingSaving(true);
                          try {
                            const saved = await api.settings.updateBranding(updatedBranding);
                            onBrandingUpdate?.(saved);
                          } catch (err: any) {
                            console.error('Failed to remove tracking image:', err);
                          } finally {
                            setBrandingSaving(false);
                          }
                        }}
                        className="self-start text-[10px] font-bold uppercase tracking-widest text-error/60 hover:text-error transition-colors"
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Opening Hours */}
            {(() => {
              const DAYS = [
                { key: 'monday',    label: 'Mon' },
                { key: 'tuesday',   label: 'Tue' },
                { key: 'wednesday', label: 'Wed' },
                { key: 'thursday',  label: 'Thu' },
                { key: 'friday',    label: 'Fri' },
                { key: 'saturday',  label: 'Sat' },
                { key: 'sunday',    label: 'Sun' },
              ] as const;
              type DayKey = typeof DAYS[number]['key'];
              const oh = branding.openingHours;
              const setDay = (day: DayKey, patch: Partial<import('../api/settings').DaySchedule>) =>
                setBranding({ ...branding, openingHours: { ...oh, [day]: { ...oh[day], ...patch } } });

              return (
                <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10 mt-8">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold font-headline flex items-center gap-3">
                      <span className="material-symbols-outlined text-secondary">schedule</span> Opening Hours
                    </h3>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                        {oh.enabled ? 'Schedule active' : 'Disabled'}
                      </span>
                      <Switch
                        enabled={oh.enabled}
                        onChange={val => setBranding({ ...branding, openingHours: { ...oh, enabled: val } })}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-8">
                    When active, the public menu is locked outside of these hours. Customers will see a "We're closed" message and cannot place orders.
                  </p>

                  <div className={`space-y-2 transition-opacity ${oh.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                    {DAYS.map(({ key, label }) => {
                      const day = oh[key];
                      return (
                        <div key={key} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/10">
                          {/* Day label */}
                          <span className="w-8 text-xs font-bold font-headline text-on-surface-variant uppercase tracking-widest flex-shrink-0">{label}</span>

                          {/* Open / closed toggle */}
                          <button
                            type="button"
                            onClick={() => setDay(key, { enabled: !day.enabled })}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex-shrink-0 ${
                              day.enabled
                                ? 'bg-tertiary/15 text-tertiary'
                                : 'bg-surface-container text-on-surface-variant/50 border border-outline-variant/20'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${day.enabled ? 'bg-tertiary' : 'bg-on-surface-variant/30'}`} />
                            {day.enabled ? 'Open' : 'Closed'}
                          </button>

                          {/* Time inputs */}
                          <div className={`flex-1 flex items-center gap-3 transition-opacity ${day.enabled ? '' : 'opacity-30 pointer-events-none'}`}>
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest flex-shrink-0">From</span>
                              <input
                                type="time"
                                value={day.open}
                                onChange={e => setDay(key, { open: e.target.value })}
                                className="flex-1 min-w-0 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1.5 text-sm font-mono text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
                              />
                            </div>
                            <span className="material-symbols-outlined text-on-surface-variant/40 text-sm flex-shrink-0">arrow_forward</span>
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest flex-shrink-0">To</span>
                              <input
                                type="time"
                                value={day.close}
                                onChange={e => setDay(key, { close: e.target.value })}
                                className="flex-1 min-w-0 bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-1.5 text-sm font-mono text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {currentSetting === 'hardware' && (
          <>
            <h1 className="text-3xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Hardware</h1>
            <p className="text-on-surface-variant text-sm mb-8">Manage connected devices and printers.</p>
            
            <div className="bg-surface-container rounded-xl p-8 shadow-sm mb-8">
              <h3 className="text-lg font-bold font-headline mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">print</span> Printers
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/10">
                  <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-on-surface-variant">receipt</span>
                    <div>
                      <p className="font-bold text-sm text-on-surface">Front Desk Receipt</p>
                      <p className="text-xs text-on-surface-variant">Epson TM-m30II (192.168.1.100)</p>
                    </div>
                  </div>
                  <span className="bg-tertiary/10 text-tertiary text-[10px] px-2 py-1 rounded font-bold uppercase tracking-micro">Online</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-lg border border-outline-variant/10">
                  <div className="flex items-center gap-4">
                    <span className="material-symbols-outlined text-on-surface-variant">restaurant</span>
                    <div>
                      <p className="font-bold text-sm text-on-surface">Kitchen Station 1</p>
                      <p className="text-xs text-on-surface-variant">Star Micronics SP700 (192.168.1.101)</p>
                    </div>
                  </div>
                  <span className="bg-tertiary/10 text-tertiary text-[10px] px-2 py-1 rounded font-bold uppercase tracking-micro">Online</span>
                </div>
              </div>
            </div>
          </>
        )}

        {currentSetting === 'team' && (
          <>
            <div className="flex justify-between items-end mb-10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">OPERATIONS › STAFFING</p>
                <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface">COLLECTIVE MANAGEMENT</h1>
                <p className="text-on-surface-variant text-sm mt-2">Architectural coordination of personnel assets and operational flow.</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsOnboardingOpen(true)}
                  className="px-6 py-3 bg-secondary text-on-secondary rounded text-[10px] font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">person_add</span>
                  ONBOARD PERSONNEL
                </button>
              </div>
            </div>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-6 mb-10">
              <div className="bg-surface-container p-8 rounded-xl border border-outline-variant/10 bg-grid-pattern relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">PERSONNEL COUNT</p>
                  <div className="flex items-baseline gap-3">
                    <p className="text-5xl font-headline font-extrabold text-on-surface">{nonSystemUsers.length}</p>
                    <p className="text-xs font-bold text-tertiary">+2 MOM</p>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
              </div>
              <div className="bg-surface-container p-8 rounded-xl border border-outline-variant/10 bg-grid-pattern relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">GLOBAL ATTENDANCE SCORE</p>
                  <div className="flex items-baseline gap-3">
                    <p className="text-5xl font-headline font-extrabold text-on-surface">
                      {nonSystemUsers.length > 0 ? Math.round(nonSystemUsers.reduce((acc, u) => acc + u.attendanceScore, 0) / nonSystemUsers.length) : 0}%
                    </p>
                    <p className="text-xs font-bold text-tertiary">OPTIMAL</p>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-tertiary/5 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500"></div>
              </div>
            </div>

            {/* Operational Shift Schedule */}
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 mb-10 overflow-hidden">
              <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">OPERATIONAL SHIFT SCHEDULE</h3>
                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    <button className="p-2 hover:bg-surface-container-high rounded transition-colors">
                      <span className="material-symbols-outlined text-sm">chevron_left</span>
                    </button>
                    <button className="p-2 hover:bg-surface-container-high rounded transition-colors">
                      <span className="material-symbols-outlined text-sm">chevron_right</span>
                    </button>
                  </div>
                  <button 
                    onClick={() => setIsEditScheduleOpen(true)}
                    className="px-4 py-2 bg-surface-container-highest text-on-surface rounded text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-colors"
                  >
                    EDIT SCHEDULE
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low">
                      <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10">PERSONNEL</th>
                      {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                        <th key={day} className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10 text-center">{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {nonSystemUsers.map(user => (
                      <tr key={user.id} className="hover:bg-surface-container-high transition-colors group">
                        <td className="px-6 py-6 border-r border-outline-variant/5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded bg-surface-container-high border border-outline-variant/30 overflow-hidden">
                              <img src={user.image} alt={user.name} className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-on-surface uppercase tracking-wider">{user.name}</p>
                              <p className="text-[9px] text-on-surface-variant uppercase tracking-widest mt-0.5">{user.role}</p>
                            </div>
                          </div>
                        </td>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                          <td key={day} className="px-6 py-6 text-center">
                            {user.shifts[day] ? (
                              <span className="bg-surface-container-highest text-on-surface text-[9px] px-3 py-1.5 rounded font-bold tracking-widest whitespace-nowrap">
                                {user.shifts[day]}
                              </span>
                            ) : (
                              <span className="text-[9px] text-on-surface-variant italic opacity-30 tracking-widest uppercase">OFFLINE</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Personnel Registry */}
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 mb-10 overflow-hidden">
              <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">PERSONNEL REGISTRY</h3>
                  {selectedUserIds.size > 0 && (
                    <button
                      onClick={() => setConfirmFireBulk(true)}
                      className="px-4 py-2 bg-error/10 text-error rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-error/20 transition-all flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">person_remove</span>
                      FIRE SELECTED ({selectedUserIds.size})
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
                  <input 
                    type="text" 
                    placeholder="ID LOOKUP..." 
                    className="bg-surface-container-lowest border border-outline-variant/10 rounded px-10 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary/30 w-64"
                  />
                </div>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low">
                    <th className="px-6 py-4 w-12 text-center border-b border-outline-variant/10">
                      <input type="checkbox" checked={nonSystemUsers.length > 0 && selectedUserIds.size === nonSystemUsers.length} onChange={toggleSelectAllUsers} className="rounded text-secondary w-4 h-4 cursor-pointer" />
                    </th>
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10">PERSONNEL</th>
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10">ROLE</th>
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10">ATTENDANCE SCORE</th>
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {nonSystemUsers.map(user => (
                    <tr key={user.id} className="hover:bg-surface-container-high transition-colors group">
                      <td className="px-6 py-6 text-center">
                        <input type="checkbox" checked={selectedUserIds.has(user.id)} onChange={() => toggleUserSelect(user.id)} className="rounded text-secondary w-4 h-4 cursor-pointer" />
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded bg-surface-container-high border border-outline-variant/30 overflow-hidden flex items-center justify-center text-on-surface-variant">
                            <span className="material-symbols-outlined">person</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-on-surface uppercase tracking-wider">{user.name}</p>
                            <p className="text-[9px] text-on-surface-variant lowercase mt-0.5">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <span className="text-[10px] font-bold text-on-surface uppercase tracking-widest">{user.role}</span>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden max-w-[120px]">
                            <div 
                              className={`h-full rounded-full ${user.attendanceScore > 90 ? 'bg-tertiary' : 'bg-secondary'}`} 
                              style={{ width: `${user.attendanceScore}%` }}
                            ></div>
                          </div>
                          <span className={`text-[10px] font-bold tracking-widest ${user.attendanceScore > 90 ? 'text-tertiary' : 'text-secondary'}`}>{user.attendanceScore}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setSelectedDossierUser({ user, edit: true })}
                            className="p-2 bg-surface-container-highest hover:bg-surface-variant rounded-lg transition-colors text-on-surface flex items-center justify-center"
                            title="Edit Dossier"
                          >
                            <span className="material-symbols-outlined text-sm">edit_note</span>
                          </button>
                          <button
                            onClick={() => setConfirmFireUser(user.id)}
                            className="p-2 bg-error/10 hover:bg-error/20 text-error rounded-lg transition-colors flex items-center justify-center"
                            title="Fire Personnel"
                          >
                            <span className="material-symbols-outlined text-sm">person_remove</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {currentSetting === 'hr' && (
          <>
            <div className="flex justify-between items-end mb-10">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-1">OPERATIONS › HUMAN RESOURCES</p>
                <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface">ATTENDANCE REPORT</h1>
                <p className="text-on-surface-variant text-sm mt-2">Comprehensive analysis of personnel attendance, performance, and financial distribution.</p>
              </div>
              <div className="flex gap-3 items-center">
                {/* Month selector */}
                <div className="flex items-center gap-1 bg-surface-container-highest border border-outline-variant/20 rounded-xl overflow-hidden">
                  <button
                    onClick={() => {
                      const idx = hrMonthOptions.findIndex(o => o.value === hrSelectedMonth);
                      if (idx < hrMonthOptions.length - 1) {
                        setHrSelectedMonth(hrMonthOptions[idx + 1].value);
                        setAttendanceReport(null);
                      }
                    }}
                    className="px-3 py-2 hover:bg-surface-variant transition-colors text-on-surface-variant hover:text-on-surface"
                    title="Previous month"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                  </button>
                  <select
                    value={hrSelectedMonth}
                    onChange={e => { setHrSelectedMonth(e.target.value); setAttendanceReport(null); }}
                    className="bg-transparent text-xs font-bold text-on-surface focus:outline-none cursor-pointer py-2 px-1 min-w-[140px] text-center appearance-none"
                  >
                    {hrMonthOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const idx = hrMonthOptions.findIndex(o => o.value === hrSelectedMonth);
                      if (idx > 0) {
                        setHrSelectedMonth(hrMonthOptions[idx - 1].value);
                        setAttendanceReport(null);
                      }
                    }}
                    disabled={hrMonthOptions[0]?.value === hrSelectedMonth}
                    className="px-3 py-2 hover:bg-surface-variant transition-colors text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                    title="Next month"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
                </div>
                <button
                  onClick={() => {
                    const header = 'Name,Role,Days Worked,Total Hours,Late,Early Out,Overtime,Hourly Rate,Deduction,OT Bonus,Base Salary,Adjustments,Total Salary';
                    const rows = hrUserData.map(({ user, reportSummary, workedDays, totalHours, hourlyRate, deduction, overtimeBonus, attendanceAdjustments, totalSalary }) => {
                      const late = reportSummary?.lateCount ?? 0;
                      const earlyOut = reportSummary?.earlyDepartureCount ?? 0;
                      const ot = reportSummary?.overtimeCount ?? 0;
                      return [user.name, user.role, workedDays, totalHours.toFixed(1), late, earlyOut, ot, hourlyRate.toFixed(2), deduction.toFixed(2), overtimeBonus.toFixed(2), user.baseSalary, attendanceAdjustments.toFixed(2), totalSalary.toFixed(2)].join(',');
                    });
                    const csv = [header, ...rows].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `hr-report-${hrDateRange.start}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-6 py-3 bg-surface-container-highest text-on-surface rounded text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  EXPORT REPORT
                </button>
                <button className="px-6 py-3 bg-secondary text-on-secondary rounded text-[10px] font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">payments</span>
                  PROCESS PAYROLL
                </button>
              </div>
            </div>

            {/* Loading skeleton while report fetches */}
            {!attendanceReport && nonSystemUsers.length > 0 && (
              <div className="grid grid-cols-1 gap-8">
                {nonSystemUsers.map(user => (
                  <div key={user.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden animate-pulse">
                    <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-low">
                      <div className="w-14 h-14 rounded-xl bg-surface-container-highest" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-surface-container-highest rounded w-32" />
                        <div className="h-3 bg-surface-container-highest rounded w-20" />
                      </div>
                    </div>
                    <div className="p-6 h-64 bg-surface-container-high/20" />
                  </div>
                ))}
              </div>
            )}

            <div className={`grid grid-cols-1 gap-8 ${!attendanceReport && nonSystemUsers.length > 0 ? 'hidden' : ''}`}>
              {hrUserData.map(({ user, reportSummary, contributionRecords, workedDays, liveScore, totalHours, hourlyRate, deduction, overtimeBonus, attendanceAdjustments, totalSalary, userRewards, userSanctions }) => {
                const todayRec = !user.excludeFromAttendance
                  ? todayAttendance.find(r => r.userId === user.id)
                  : undefined;
                const isOnline = todayRec?.status === 'active';
                let sinceLabel = '';
                if (isOnline && todayRec?.checkIn) {
                  const [h, m] = todayRec.checkIn.split(':').map(Number);
                  const now = new Date();
                  const checkedIn = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
                  const diffMin = Math.max(0, Math.floor((now.getTime() - checkedIn.getTime()) / 60000));
                  const hrs2 = Math.floor(diffMin / 60);
                  const mins2 = diffMin % 60;
                  sinceLabel = hrs2 > 0 ? (mins2 > 0 ? `${hrs2}h ${mins2}m` : `${hrs2}h`) : `${mins2}m`;
                }
                const currentMonth = hrDateRange.start.slice(0, 7); // "2026-04"
                return (
                  <div key={user.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden flex flex-col">
                    {/* Employee header */}
                    <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-low">
                      <div className="relative w-14 h-14 shrink-0">
                        <div className="w-14 h-14 rounded-xl bg-surface-container-high border border-outline-variant/30 overflow-hidden">
                          <img src={user.image} alt={user.name} className="w-full h-full object-cover grayscale" />
                        </div>
                        {!user.excludeFromAttendance && (
                          <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-surface-container-low ${isOnline ? 'bg-tertiary' : 'bg-on-surface-variant/30'}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-headline font-extrabold text-on-surface uppercase tracking-tight truncate">{user.name}</h3>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{user.role}</p>
                        {!user.excludeFromAttendance && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-tertiary animate-pulse' : 'bg-on-surface-variant/40'}`} />
                            {isOnline ? (
                              <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Online · {sinceLabel}</span>
                            ) : (
                              <span className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                                {todayRec?.checkOut ? `Checked out ${todayRec.checkOut}` : 'Offline'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">ATTENDANCE SCORE</p>
                        <p className={`text-2xl font-headline font-extrabold ${workedDays === 0 ? 'text-on-surface-variant' : liveScore > 90 ? 'text-tertiary' : 'text-secondary'}`}>
                          {workedDays === 0 ? 'N/A' : `${liveScore}%`}
                        </p>
                      </div>
                    </div>

                    {/* API summary strip */}
                    {reportSummary && (
                      <div className="px-6 py-3 bg-surface-container-highest/40 border-b border-outline-variant/10 flex gap-6 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        <span className="text-on-surface">{reportSummary.totalDays} <span className="text-on-surface-variant font-normal">days</span></span>
                        <span className="text-on-surface">{reportSummary.totalHours.toFixed(1)} <span className="text-on-surface-variant font-normal">hrs</span></span>
                        {reportSummary.lateCount > 0 && <span className="text-secondary">{reportSummary.lateCount} late</span>}
                        {reportSummary.earlyDepartureCount > 0 && <span className="text-secondary">{reportSummary.earlyDepartureCount} early out</span>}
                        {reportSummary.overtimeCount > 0 && <span className="text-tertiary">{reportSummary.overtimeCount} overtime</span>}
                      </div>
                    )}

                    {/* Full-width monthly calendar */}
                    <div className="p-6 border-b border-outline-variant/10">
                      <AttendanceContributionGraph
                        records={contributionRecords}
                        month={currentMonth}
                        totalHours={totalHours}
                        workedDays={workedDays}
                      />
                    </div>

                    {/* Performance + Financial summary row */}
                    <div className="p-6 grid grid-cols-2 gap-8">
                      {/* Performance metrics */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">PERFORMANCE METRICS</p>
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={() => setSelectedDossierUser({ user, edit: false, log: 'Reward' })}
                            className="text-left bg-surface-container-low p-3 rounded-lg border border-outline-variant/5 hover:bg-surface-container-high transition-colors cursor-pointer group"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[9px] font-bold text-tertiary uppercase tracking-widest mb-1 group-hover:text-tertiary/80">REWARDS</p>
                                <p className="text-lg font-headline font-extrabold text-on-surface">+{formatCurrency(userRewards)}</p>
                              </div>
                              <span className="material-symbols-outlined text-sm text-tertiary opacity-0 group-hover:opacity-100 transition-opacity">add_circle</span>
                            </div>
                          </button>
                          <button
                            onClick={() => setSelectedDossierUser({ user, edit: false, log: 'Sanction' })}
                            className="text-left bg-surface-container-low p-3 rounded-lg border border-outline-variant/5 hover:bg-surface-container-high transition-colors cursor-pointer group"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[9px] font-bold text-error uppercase tracking-widest mb-1 group-hover:text-error/80">SANCTIONS</p>
                                <p className="text-lg font-headline font-extrabold text-on-surface">-{formatCurrency(userSanctions)}</p>
                              </div>
                              <span className="material-symbols-outlined text-sm text-error opacity-0 group-hover:opacity-100 transition-opacity">add_circle</span>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Financial summary */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">FINANCIAL SUMMARY</p>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">BASE SALARY</span>
                            <span className="text-xs font-bold text-on-surface">{formatCurrency(user.baseSalary)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">HOURLY RATE</span>
                            <span className="text-xs font-bold text-on-surface-variant">{formatCurrency(hourlyRate)}/h</span>
                          </div>
                          {deduction > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">LATE/EARLY CUTS</span>
                              <span className="text-xs font-bold text-error">-{formatCurrency(deduction)}</span>
                            </div>
                          )}
                          {overtimeBonus > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">OVERTIME BONUS</span>
                              <span className="text-xs font-bold text-tertiary">+{formatCurrency(overtimeBonus)}</span>
                            </div>
                          )}
                          {(userRewards > 0 || userSanctions > 0) && (
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">REWARDS / SANCTIONS</span>
                              <span className={`text-xs font-bold ${userRewards - userSanctions >= 0 ? 'text-tertiary' : 'text-error'}`}>
                                {userRewards - userSanctions >= 0 ? '+' : ''}{formatCurrency(userRewards - userSanctions)}
                              </span>
                            </div>
                          )}
                          <div className="h-px bg-outline-variant/10 my-1" />
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-on-surface uppercase tracking-widest">TOTAL SALARY</span>
                            <span className="text-lg font-headline font-extrabold text-primary">{formatCurrency(totalSalary)}</span>
                          </div>
                        </div>
                        <div className="mt-4">
                          <button
                            onClick={() => setSelectedWithdrawalUser(user)}
                            className="w-full py-2.5 bg-secondary text-on-secondary rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                            WITHDRAW SALARY
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-surface-container-highest/30 flex justify-end items-center">
                      <button
                        onClick={() => setSelectedDossierUser({ user, edit: false })}
                        className="text-[10px] font-bold text-secondary uppercase tracking-widest hover:underline"
                      >
                        VIEW FULL DOSSIER
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </>
        )}

        {currentSetting === 'roles' && <RoleManagementView />}

        {currentSetting === 'locations' && (
          <>
            <div className="flex items-start justify-between mb-8">
              <div>
                <h1 className="text-3xl font-extrabold font-headline tracking-tight text-on-surface mb-1">Locations</h1>
                <p className="text-on-surface-variant text-sm">Manage your restaurant venues. Staff and data are scoped per location.</p>
              </div>
              {hasPermission('view_settings') && (
                <button onClick={openAddLocation} className="flex items-center gap-2 px-6 py-3 bg-secondary text-on-secondary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors shadow-lg">
                  <span className="material-symbols-outlined text-sm">add</span> Add Location
                </button>
              )}
            </div>

            {/* Venue Cards */}
            <div className="bg-surface-container rounded-xl p-8 shadow-sm mb-8">
              <h3 className="text-lg font-bold font-headline mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">location_on</span> Venues
                <span className="ml-auto text-xs text-on-surface-variant font-normal">{locations.length} location{locations.length !== 1 ? 's' : ''}</span>
              </h3>

              {locations.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-3 block">location_off</span>
                  <p className="text-sm font-bold mb-1">No locations yet</p>
                  <p className="text-xs mb-4">Add your first venue to start scoping data by location.</p>
                  <button onClick={openAddLocation} className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors shadow">
                    <span className="material-symbols-outlined text-sm">add</span> Add Location
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {locations.map((loc, idx) => (
                    <div key={loc.id} className={`p-6 bg-surface-container-lowest rounded-xl border-2 relative overflow-hidden ${idx === 0 ? 'border-secondary' : 'border-outline-variant/20'}`}>
                      {idx === 0 && (
                        <div className="absolute top-0 right-0 bg-secondary text-on-secondary text-[9px] font-bold uppercase tracking-micro px-2 py-1 rounded-bl-lg">Primary</div>
                      )}
                      <h4 className="font-bold text-base mb-1 pr-12">{loc.name}</h4>
                      {loc.address && (
                        <p className="text-xs text-on-surface-variant mb-1 leading-relaxed">{loc.address.split('\n')[0]}</p>
                      )}
                      {loc.phone && <p className="text-xs text-on-surface-variant mb-1">{loc.phone}</p>}
                      {(loc.openingTime || loc.closingTime) && (() => {
                        const fmt = (t?: string) => {
                          if (!t) return '';
                          const [h, m] = t.split(':').map(Number);
                          const ampm = h >= 12 ? 'PM' : 'AM';
                          return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
                        };
                        const isOpen = (() => {
                          if (!loc.openingTime || !loc.closingTime) return null;
                          const now = new Date();
                          const cur = now.getHours() * 60 + now.getMinutes();
                          const [oh, om] = loc.openingTime.split(':').map(Number);
                          const [ch, cm] = loc.closingTime.split(':').map(Number);
                          const open = oh * 60 + om;
                          const close = ch * 60 + cm;
                          return close <= open ? cur >= open || cur < close : cur >= open && cur < close;
                        })();
                        return (
                          <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-sm text-on-surface-variant">schedule</span>
                            <span className="text-xs text-on-surface-variant">{fmt(loc.openingTime)} – {fmt(loc.closingTime)}</span>
                            {isOpen !== null && (
                              <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${isOpen ? 'bg-tertiary/15 text-tertiary' : 'bg-error/15 text-error'}`}>
                                {isOpen ? 'OPEN' : 'CLOSED'}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {loc.tablesCount > 0 && (
                          <span className="bg-surface-container-high text-on-surface text-[10px] px-2 py-1 rounded font-bold uppercase tracking-micro">{loc.tablesCount} Tables</span>
                        )}
                        {loc.barCount > 0 && (
                          <span className="bg-surface-container-high text-on-surface text-[10px] px-2 py-1 rounded font-bold uppercase tracking-micro">{loc.barCount} Bar seats</span>
                        )}
                      </div>
                      {hasPermission('view_settings') && (
                        <div className="flex gap-2">
                          <button onClick={() => openEditLocation(loc)} className="flex-1 py-2 bg-surface-container-high hover:bg-surface-variant text-on-surface text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
                            <span className="material-symbols-outlined text-sm">edit</span> Edit
                          </button>
                          {locations.length > 1 && (
                            <button onClick={() => handleDeleteLocation(loc.id)} className="py-2 px-3 bg-error/10 hover:bg-error/20 text-error text-xs font-bold rounded-lg transition-colors flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {hasPermission('view_settings') && (
                    <button onClick={openAddLocation} className="p-6 bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant/30 opacity-60 hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-center min-h-[160px]">
                      <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2">add_circle</span>
                      <p className="font-bold text-sm text-on-surface">Add New Location</p>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Add/Edit Location Modal */}
            {locationModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-surface-container-lowest rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                  <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
                    <h2 className="font-headline font-bold text-lg">{editingLocation ? 'Edit Location' : 'Add New Location'}</h2>
                    <button onClick={() => setLocationModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant">
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Location Name *</label>
                      <input type="text" value={locationForm.name} onChange={e => setLocationForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Omakase Station 01"
                        className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Subtitle</label>
                      <input type="text" value={locationForm.subtitle} onChange={e => setLocationForm(f => ({ ...f, subtitle: e.target.value }))}
                        placeholder="e.g. Grand Hyatt · Level 2"
                        className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Phone</label>
                      <input type="text" value={locationForm.phone} onChange={e => setLocationForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+1 (555) 000-0000"
                        className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Address</label>
                      <textarea value={locationForm.address} onChange={e => setLocationForm(f => ({ ...f, address: e.target.value }))}
                        placeholder={"123 Culinary Ave\nFood District, NY 10001"}
                        className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium h-20 resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Tables</label>
                        <input type="number" min={0} value={locationForm.tablesCount} onChange={e => setLocationForm(f => ({ ...f, tablesCount: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Bar Seats</label>
                        <input type="number" min={0} value={locationForm.barCount} onChange={e => setLocationForm(f => ({ ...f, barCount: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Opening Time</label>
                        <input type="time" value={locationForm.openingTime} onChange={e => setLocationForm(f => ({ ...f, openingTime: e.target.value }))}
                          className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Closing Time</label>
                        <input type="time" value={locationForm.closingTime} onChange={e => setLocationForm(f => ({ ...f, closingTime: e.target.value }))}
                          className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-medium [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:cursor-pointer" />
                      </div>
                    </div>
                  </div>
                  <div className="p-6 border-t border-outline-variant/10 flex gap-3 justify-end">
                    <button onClick={() => setLocationModalOpen(false)} className="px-6 py-3 bg-surface-container hover:bg-surface-variant text-on-surface rounded-xl text-sm font-bold transition-colors">Cancel</button>
                    <button onClick={handleSaveLocation} disabled={locationSaving || !locationForm.name.trim()}
                      className="px-8 py-3 bg-secondary text-on-secondary rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors disabled:opacity-60 flex items-center gap-2">
                      {locationSaving ? <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <span className="material-symbols-outlined text-sm">save</span>}
                      {editingLocation ? 'Save Changes' : 'Create Location'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Global modals — rendered outside section blocks so they work from any tab */}
        {selectedDossierUser && (
          <DossierModal
            user={selectedDossierUser.user}
            dateRange={hrDateRange}
            initialIsEditing={selectedDossierUser.edit}
            initialAddingLog={selectedDossierUser.log}
            onClose={() => setSelectedDossierUser(null)}
            onSaved={loadUsers}
          />
        )}

        {selectedWithdrawalUser && (
          <WithdrawalModal
            user={selectedWithdrawalUser}
            dateRange={hrDateRange}
            onClose={() => setSelectedWithdrawalUser(null)}
          />
        )}

        {isOnboardingOpen && (
          <OnboardPersonnelModal
            onClose={() => setIsOnboardingOpen(false)}
            onCreated={loadUsers}
          />
        )}

        {isEditScheduleOpen && (
          <EditScheduleModal
            onClose={() => { setIsEditScheduleOpen(false); loadUsers(); }}
            users={users}
          />
        )}

        {confirmFireBulk && (
          <ConfirmModal
            title={`Fire ${selectedUserIds.size} Personnel`}
            message={`This will deactivate access for ${selectedUserIds.size} staff member${selectedUserIds.size > 1 ? 's' : ''}. This action cannot be undone.`}
            confirmLabel="Fire"
            onConfirm={fireSelectedUsers}
            onClose={() => setConfirmFireBulk(false)}
          />
        )}

        {confirmFireUser && (
          <ConfirmModal
            title="Fire Personnel"
            message="This will permanently deactivate this staff member's access. This action cannot be undone."
            confirmLabel="Fire"
            onConfirm={() => fireUser(confirmFireUser)}
            onClose={() => setConfirmFireUser(null)}
          />
        )}
      </div>
    </div>
  );
};
