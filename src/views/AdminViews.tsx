import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { USERS, PERFORMANCE_LOGS, User, PerformanceLog, ROLES, Role, Permission, Product, CATEGORIES, PRODUCTS, VariationGroup, VariationOption, Ingredient } from '../data';
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Scatter, LineChart, Line, Area, PieChart, Pie } from 'recharts';

const WithdrawalModal = ({ user, dateRange, onClose }: { user: User, dateRange?: { start: string, end: string }, onClose: () => void }) => {
  const [amount, setAmount] = useState('');
  const [staffComment, setStaffComment] = useState('');
  const [privateComment, setPrivateComment] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);

  const filteredAttendance = user.monthlyAttendance.filter(a => {
    if (!dateRange) return true;
    const startDay = new Date(dateRange.start).getDate();
    const endDay = new Date(dateRange.end).getDate();
    const dayNum = parseInt(a.day);
    return dayNum >= startDay && dayNum <= endDay;
  });

  const lateCount = filteredAttendance.filter(a => a.isLate).length;
  const earlyCount = filteredAttendance.filter(a => a.isEarlyDeparture).length;
  const overtimeCount = filteredAttendance.filter(a => a.isOvertime).length;

  const LATE_HOURLY_RATE = 20;
  const EARLY_HOURLY_RATE = 20;
  const OVERTIME_HOURLY_RATE = 30;

  const lateIncidents = filteredAttendance.filter(a => a.isLate && a.checkIn);
  const earlyIncidents = filteredAttendance.filter(a => a.isEarlyDeparture && a.checkOut);
  const overtimeIncidents = filteredAttendance.filter(a => a.isOvertime);

  // Helper to calculate hour difference (simplified for demo)
  // In a real app, we'd compare against the actual shift start/end
  const getLateHours = (checkIn: string) => {
    const [h, m] = checkIn.split(':').map(Number);
    // Assuming 09:00 or 10:00 or 12:00 start based on user.shifts
    // For simplicity, we'll just assume any check-in after the hour is late by the minute difference
    return m / 60; 
  };

  const totalLateHours = lateIncidents.reduce((sum, a) => sum + 0.5, 0); // Mocking 0.5h for each late for demo consistency
  const totalEarlyHours = earlyIncidents.reduce((sum, a) => sum + 0.5, 0); 
  const totalOvertimeHours = overtimeIncidents.reduce((sum, a) => sum + (a.hours - 8), 0);

  const totalLateFees = totalLateHours * LATE_HOURLY_RATE;
  const totalEarlyFees = totalEarlyHours * EARLY_HOURLY_RATE;
  const totalOvertimeBonus = totalOvertimeHours * OVERTIME_HOURLY_RATE;
  
  const getFullDate = (dayNum: string) => {
    if (!dateRange) return `Day ${dayNum}`;
    const date = new Date(dateRange.start);
    date.setDate(parseInt(dayNum));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  const netAdjustments = user.rewards - user.sanctions + totalOvertimeBonus - totalLateFees - totalEarlyFees;
  const maxAmount = user.baseSalary + netAdjustments;

  const handleNumClick = (num: string) => {
    if (num === '.' && amount.includes('.')) return;
    setAmount(prev => prev + num);
  };

  const handleBackspace = () => setAmount(prev => prev.slice(0, -1));

  const handleProcess = () => {
    setIsPrinting(true);
    // In a real app, we'd save the withdrawal log here
    const newLog = {
      id: `W-${Math.floor(Math.random() * 1000)}`,
      amount: parseFloat(amount),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
      status: 'Completed' as const
    };
    user.withdrawalLogs.unshift(newLog);
    
    setTimeout(() => {
      setIsPrinting(false);
      setShowReceipt(true);
    }, 1500);
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
                  <div className="flex justify-between"><span>Base Salary:</span><span>${user.baseSalary.toLocaleString()}</span></div>
                  <div className="flex justify-between text-tertiary font-bold"><span>Rewards:</span><span>+${user.rewards}</span></div>
                  <div className="flex justify-between text-error font-bold"><span>Sanctions:</span><span>-${user.sanctions}</span></div>
                  <div className="flex justify-between text-tertiary"><span>Overtime Bonus:</span><span>+${totalOvertimeBonus.toFixed(2)}</span></div>
                  <div className="flex justify-between text-error"><span>Late Fees:</span><span>-${totalLateFees.toFixed(2)}</span></div>
                  <div className="flex justify-between text-error"><span>Early Leave Fees:</span><span>-${totalEarlyFees.toFixed(2)}</span></div>
                </div>

                {/* Detailed Logs Section */}
                <div className="pt-4 border-t-2 border-dashed border-black/10 space-y-3">
                  <p className="font-bold uppercase text-[9px] mb-2">Detailed Incident Log:</p>
                  
                  {/* Rewards & Sanctions from Performance Logs */}
                  {PERFORMANCE_LOGS.filter(log => log.userId === user.id).map((log, i) => (
                    <div key={`log-${i}`} className="flex justify-between items-start gap-4">
                      <span className="opacity-60 shrink-0">{log.date}</span>
                      <span className="flex-1 text-right italic">{log.title} ({log.type})</span>
                    </div>
                  ))}

                  {/* Attendance Incidents */}
                  {lateIncidents.map((a, i) => (
                    <div key={`late-rec-${i}`} className="flex justify-between items-start gap-4">
                      <span className="opacity-60 shrink-0">Day {a.day}</span>
                      <span className="flex-1 text-right text-error font-bold">LATE ARRIVAL ({a.checkIn})</span>
                    </div>
                  ))}
                  {earlyIncidents.map((a, i) => (
                    <div key={`early-rec-${i}`} className="flex justify-between items-start gap-4">
                      <span className="opacity-60 shrink-0">Day {a.day}</span>
                      <span className="flex-1 text-right text-error font-bold">EARLY DEPARTURE ({a.checkOut})</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-xl font-bold border-t-2 border-black pt-4 mt-6">
                  <span>TOTAL DISBURSED:</span>
                  <span>${parseFloat(amount).toLocaleString()}</span>
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
                onClick={() => window.print()}
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
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-on-surface-variant">Base Salary</p>
                      <p className="text-sm font-headline font-bold text-on-surface">${user.baseSalary.toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-on-surface-variant">Rewards & Bonuses</p>
                      <p className="text-sm font-headline font-bold text-tertiary">+${user.rewards.toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-on-surface-variant">Sanctions & Deductions</p>
                      <p className="text-sm font-headline font-bold text-error">-${user.sanctions.toLocaleString()}</p>
                    </div>
                    <div className="h-px bg-outline-variant/10 my-2" />
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-on-surface">Net Payable</p>
                      <p className="text-xl font-headline font-extrabold text-primary">${maxAmount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-surface-container rounded-[2rem] border border-outline-variant/10 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-secondary border-b border-outline-variant/10 pb-2 mb-4">Incident Detail Log</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {lateIncidents.map((a, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-error/5 rounded-lg border border-error/10">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-error uppercase">Late Check-in ({a.checkIn})</span>
                          <span className="text-[10px] font-medium text-error/70 uppercase">{getFullDate(a.day)}</span>
                        </div>
                        <span className="text-xs font-bold text-error">-$20.00</span>
                      </div>
                    ))}
                    {earlyIncidents.map((a, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-error/5 rounded-lg border border-error/10">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-error uppercase">Early Departure ({a.checkOut})</span>
                          <span className="text-[10px] font-medium text-error/70 uppercase">{getFullDate(a.day)}</span>
                        </div>
                        <span className="text-xs font-bold text-error">-$20.00</span>
                      </div>
                    ))}
                    {overtimeIncidents.map((a, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-tertiary/5 rounded-lg border border-tertiary/10">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-tertiary uppercase">Overtime (+{a.hours - 8}h)</span>
                          <span className="text-[10px] font-medium text-tertiary/70 uppercase">{getFullDate(a.day)}</span>
                        </div>
                        <span className="text-xs font-bold text-tertiary">+${(a.hours - 8) * 30}.00</span>
                      </div>
                    ))}
                    {lateIncidents.length === 0 && earlyIncidents.length === 0 && overtimeIncidents.length === 0 && (
                      <p className="text-xs text-on-surface-variant/40 italic text-center py-4">No attendance incidents recorded this period</p>
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
                    ${amount || '0'}
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
                            ${amount || '0'}
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

                {parseFloat(amount) > maxAmount && (
                  <p className="text-[10px] font-bold text-error uppercase tracking-widest mt-2 text-center animate-pulse">Exceeds net payable amount</p>
                )}

                <div className="mt-12 w-full max-w-md">
                  <button 
                    onClick={handleProcess}
                    disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > maxAmount || isPrinting}
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

const DossierModal = ({ user, dateRange, onClose, initialIsEditing = false }: { user: User, dateRange?: { start: string, end: string }, onClose: () => void, initialIsEditing?: boolean }) => {
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [editData, setEditData] = useState({ ...user });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalSalary = user.baseSalary + user.rewards - user.sanctions;

  const filteredAttendance = user.monthlyAttendance.filter(a => {
    if (!dateRange) return true;
    const startDay = new Date(dateRange.start).getDate();
    const endDay = new Date(dateRange.end).getDate();
    const dayNum = parseInt(a.day);
    return dayNum >= startDay && dayNum <= endDay;
  });
  
  const handlePrint = () => {
    const printContent = document.getElementById('dossier-print-area');
    if (printContent) {
      window.print();
    }
  };

  const handleSave = () => {
    // In a real app, this would call an API or update global state
    // For now, we'll just update the local user object (which won't persist but shows the UI logic)
    Object.assign(user, editData);
    setIsEditing(false);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    
    const newDocs = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.type.includes('pdf') ? 'PDF' : 'IMG',
      url: URL.createObjectURL(file)
    }));

    setEditData(prev => ({
      ...prev,
      personalDocuments: [...prev.personalDocuments, ...newDocs]
    }));
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
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsEditing(false)} />
        <div className="relative w-full max-w-2xl bg-surface-container rounded-3xl border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-300">
          <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
            <h2 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Edit Personnel Details</h2>
            <button onClick={() => setIsEditing(false)} className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-8">
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
                <input 
                  type="text" 
                  value={editData.role} 
                  onChange={e => setEditData({...editData, role: e.target.value})}
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
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
                />
                <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-3xl">upload_file</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-on-surface uppercase tracking-tight">Click or Drag & Drop</p>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">IMG or PDF (Max 10MB)</p>
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
                  <div className="flex justify-between"><span>Base Salary</span><span className="font-bold">${user.baseSalary.toLocaleString()}</span></div>
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
                    <p className="text-xl font-bold">+{user.rewards}</p>
                  </div>
                  <div className="border border-black p-2">
                    <p className="text-[10px] uppercase font-bold">Sanctions</p>
                    <p className="text-xl font-bold">-{user.sanctions}</p>
                  </div>
                </div>
              </section>
            </div>

            {/* Print Right Column */}
            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-bold uppercase border-b border-black mb-4">Performance Log</h3>
                <div className="space-y-3">
                  {PERFORMANCE_LOGS.filter(log => log.userId === user.id).slice(0, 5).map(log => (
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
                      <span className="font-bold">${log.amount.toLocaleString()}</span>
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
                    <span className="text-xs font-extrabold text-on-surface">${user.baseSalary.toLocaleString()}</span>
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
                  <p className="text-3xl font-headline font-extrabold text-tertiary">+{user.rewards}</p>
                </div>
                <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/10 text-center">
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Sanctions</p>
                  <p className="text-3xl font-headline font-extrabold text-error">-{user.sanctions}</p>
                </div>
              </div>

              {/* Performance Trend Chart */}
              <div className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">PERFORMANCE TREND</h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-secondary" />
                      <span className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant">Hours</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-tertiary" />
                      <span className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant">Score</span>
                    </div>
                  </div>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filteredAttendance}>
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 9, fill: 'var(--on-surface-variant)', fontWeight: 'bold' }}
                      />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: 'none', borderRadius: '12px', padding: '12px' }}
                        itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                      />
                      <Area type="monotone" dataKey="hours" fill="var(--color-secondary)" fillOpacity={0.1} stroke="var(--color-secondary)" strokeWidth={3} />
                      <Line type="monotone" dataKey="hours" stroke="var(--color-tertiary)" strokeWidth={2} dot={{ r: 4, fill: 'var(--color-tertiary)' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Performance Logs */}
              <div className="bg-surface-container-low rounded-2xl border border-outline-variant/10 overflow-hidden">
                <div className="p-5 border-b border-outline-variant/10 bg-surface-container-low/50">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface">Performance & Conduct Log</h3>
                </div>
                <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
                  {PERFORMANCE_LOGS.filter(log => log.userId === user.id).map(log => (
                    <div key={log.id} className="p-4 bg-surface-container rounded-xl border border-outline-variant/5 flex items-center gap-4">
                      <div className={`w-10 h-10 rounded flex items-center justify-center ${log.type === 'Reward' ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'}`}>
                        <span className="material-symbols-outlined text-xl">
                          {log.type === 'Reward' ? 'workspace_premium' : 'report_problem'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider">{log.title}</h4>
                          <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-widest">{log.date}</span>
                        </div>
                        <p className="text-[9px] text-on-surface-variant uppercase tracking-widest">Impact: <span className="text-on-surface">{log.impact}</span></p>
                      </div>
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
                  <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Total: ${totalSalary.toLocaleString()}</span>
                </div>
                <div className="p-4 space-y-3">
                  {user.withdrawalLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-secondary/10 flex items-center justify-center text-secondary">
                          <span className="material-symbols-outlined">payments</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-on-surface uppercase tracking-wider">${log.amount.toLocaleString()}</p>
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
    </div>
  );
};

const OnboardPersonnelModal = ({ onClose }: { onClose: () => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Staff',
    baseSalary: 3000,
    startDate: new Date().toISOString().split('T')[0],
    contractType: 'Full-time Permanent',
    contractDate: new Date().toISOString().split('T')[0],
  });

  const handleSave = () => {
    // In a real app, this would call an API
    const newUser: User = {
      id: `u${USERS.length + 1}`,
      ...formData,
      image: `https://i.pravatar.cc/150?u=u${USERS.length + 1}`,
      payrollDue: 'Next Month',
      attendanceScore: 100,
      shifts: {},
      monthlyAttendance: [],
      rewards: 0,
      sanctions: 0,
      withdrawalLogs: [],
      personalDocuments: [],
    };
    USERS.push(newUser);
    onClose();
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
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value})}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all appearance-none"
              >
                <option value="Executive Lead">Executive Lead</option>
                <option value="Site Curator">Site Curator</option>
                <option value="Architectural Sous-Lead">Architectural Sous-Lead</option>
                <option value="Frontier Management">Frontier Management</option>
                <option value="Staff">Staff</option>
              </select>
            </div>
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
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Contract Signing Date</label>
              <input 
                type="date" 
                value={formData.contractDate}
                onChange={e => setFormData({...formData, contractDate: e.target.value})}
                className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
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
                The employee will serve as <span className="text-on-surface font-bold">{formData.role}</span> with a starting base salary of <span className="text-on-surface font-bold">${formData.baseSalary.toLocaleString()}</span> per month.
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

const EditScheduleModal = ({ onClose }: { onClose: () => void }) => {
  const [schedule, setSchedule] = useState(USERS.map(u => ({
    id: u.id,
    name: u.name,
    shifts: { ...u.shifts }
  })));

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const updateShift = (userId: string, day: string, value: string) => {
    setSchedule(prev => prev.map(u => 
      u.id === userId ? { ...u, shifts: { ...u.shifts, [day]: value } } : u
    ));
  };

  const handleSave = () => {
    // In a real app, this would call an API
    schedule.forEach(s => {
      const user = USERS.find(u => u.id === s.id);
      if (user) user.shifts = s.shifts;
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-7xl bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-500">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Edit Global Schedule</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Operational shift architecture & coordination</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-0">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-surface-container-low shadow-sm">
              <tr>
                <th className="px-8 py-6 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-outline-variant/10 min-w-[240px]">Personnel Asset</th>
                {days.map(day => (
                  <th key={day} className="px-4 py-6 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-outline-variant/10 text-center">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {schedule.map(user => (
                <tr key={user.id} className="hover:bg-surface-container-high/30 transition-colors">
                  <td className="px-8 py-6 border-r border-outline-variant/5">
                    <p className="text-xs font-bold text-on-surface uppercase tracking-wider">{user.name}</p>
                    <p className="text-[8px] text-on-surface-variant uppercase tracking-widest mt-1">ID: {user.id.toUpperCase()}</p>
                  </td>
                  {days.map(day => (
                    <td key={day} className="px-3 py-4">
                      <input 
                        type="text" 
                        value={user.shifts[day] || ''}
                        onChange={e => updateShift(user.id, day, e.target.value)}
                        placeholder="OFF"
                        className="w-full bg-surface-container-highest border border-outline-variant/10 rounded-xl px-3 py-3 text-[10px] font-bold text-center text-on-surface focus:border-secondary outline-none transition-all placeholder:opacity-20 uppercase tracking-widest"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex justify-end gap-6">
          <button onClick={onClose} className="px-10 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-surface-variant transition-all">
            Discard Changes
          </button>
          <button 
            onClick={handleSave}
            className="px-10 py-4 bg-primary text-on-primary rounded-2xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-xl"
          >
            Publish Schedule
          </button>
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
  const [roles, setRoles] = useState<Role[]>(ROLES);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  const allPermissions: { id: Permission; label: string; description: string }[] = [
    { id: 'view_menu', label: 'View Menu', description: 'Access to the POS menu and item selection.' },
    { id: 'view_orders', label: 'View Orders', description: 'Monitor and manage active and past orders.' },
    { id: 'view_attendance', label: 'View Attendance', description: 'Access to staff attendance records and clock-in/out logs.' },
    { id: 'view_staff', label: 'View Staff', description: 'View the personnel registry and staff details.' },
    { id: 'view_hr', label: 'View HR', description: 'Access to human resources reports, payroll, and performance logs.' },
    { id: 'view_inventory', label: 'View Inventory', description: 'Monitor and manage stock levels and inventory items.' },
    { id: 'view_settings', label: 'View Settings', description: 'Access to POS branding, hardware, and general settings.' },
    { id: 'manage_roles', label: 'Manage Roles', description: 'Create and edit user roles and their associated permissions.' },
  ];

  const handleTogglePermission = (roleId: string, permission: Permission) => {
    setRoles(prev => prev.map(role => {
      if (role.id === roleId) {
        const hasPermission = role.permissions.includes(permission);
        const newPermissions = hasPermission 
          ? role.permissions.filter(p => p !== permission)
          : [...role.permissions, permission];
        return { ...role, permissions: newPermissions };
      }
      return role;
    }));
  };

  const handleAddRole = () => {
    if (!newRoleName.trim()) return;
    const newRole: Role = {
      id: `r_${newRoleName.toLowerCase().replace(/\s+/g, '_')}`,
      name: newRoleName,
      permissions: []
    };
    setRoles(prev => [...prev, newRole]);
    setNewRoleName('');
    setIsAddingRole(false);
    setSelectedRole(newRole);
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
                  <p className={`text-sm font-bold uppercase tracking-wider ${selectedRole?.id === role.id ? 'text-secondary' : 'text-on-surface'}`}>
                    {role.name}
                  </p>
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
                  <h3 className="text-2xl font-headline font-extrabold text-on-surface uppercase tracking-tight">{selectedRole.name}</h3>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Permission Matrix Configuration</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">ID: {selectedRole.id}</span>
                </div>
              </div>
              
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                {allPermissions.map(perm => {
                  const isActive = roles.find(r => r.id === selectedRole.id)?.permissions.includes(perm.id);
                  return (
                    <button
                      key={perm.id}
                      onClick={() => handleTogglePermission(selectedRole.id, perm.id)}
                      className={`p-6 rounded-2xl border-2 transition-all text-left flex items-start gap-4 group ${
                        isActive 
                          ? 'border-secondary bg-secondary/5' 
                          : 'border-outline-variant/10 bg-surface-container-lowest hover:border-outline-variant/30'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        isActive ? 'bg-secondary text-on-secondary' : 'bg-surface-container-highest text-on-surface-variant group-hover:text-on-surface'
                      }`}>
                        <span className="material-symbols-outlined text-xl">
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

              <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex justify-between items-center">
                <p className="text-[10px] text-on-surface-variant italic">
                  * Changes are applied in real-time to all personnel assigned to this archetype.
                </p>
                <div className="flex gap-4">
                  <button className="px-6 py-3 bg-error/10 text-error rounded text-[10px] font-bold uppercase tracking-widest hover:bg-error/20 transition-colors">
                    DELETE ROLE
                  </button>
                </div>
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

const AddUsageModal = ({ onClose, ingredients }: { onClose: () => void, ingredients: any[] }) => {
  const [selectedIngredient, setSelectedIngredient] = useState(ingredients[0].name);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('Service');

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
                <option key={ing.name} value={ing.name}>{ing.name} ({ing.inStock}{ing.unit} avail.)</option>
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
                {ingredients.find(i => i.name === selectedIngredient)?.unit}
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
            onClick={onClose}
            className="flex-1 py-4 bg-secondary text-on-secondary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-secondary/20"
          >
            Confirm Usage
          </button>
        </div>
      </div>
    </div>
  );
};

const LogPurchaseModal = ({ onClose, ingredients }: { onClose: () => void, ingredients: any[] }) => {
  const [selectedIngredient, setSelectedIngredient] = useState(ingredients[0].name);
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [vendor, setVendor] = useState('');

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
                <option key={ing.name} value={ing.name}>{ing.name}</option>
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
                  {ingredients.find(i => i.name === selectedIngredient)?.unit}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Total Cost</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">$</span>
                <input 
                  type="number" 
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl pl-10 pr-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
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
            onClick={onClose}
            className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            Log Purchase
          </button>
        </div>
      </div>
    </div>
  );
};

const CreateIngredientModal = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('kg');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">New Ingredient</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Initialize master data for a new stock item</p>
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
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">$</span>
                <input 
                  type="number" 
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl pl-10 pr-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
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
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            Create Ingredient
          </button>
        </div>
      </div>
    </div>
  );
};

export const InventoryView = () => {
  const [isAddUsageOpen, setIsAddUsageOpen] = useState(false);
  const [isLogPurchaseOpen, setIsLogPurchaseOpen] = useState(false);
  const [isCreateIngredientOpen, setIsCreateIngredientOpen] = useState(false);

  const INGREDIENTS = [
    { sku: 'SF-TUNA-01', name: 'Bluefin Tuna (Akami)', category: ['PREMIUM', 'SEAFOOD'], inStock: 12.5, capacity: 20.0, unit: 'kg', level: 62, status: 'Healthy', price: 124.00, icon: 'sushi' },
    { sku: 'GR-RICE-01', name: 'Koshihikari Rice', category: ['GRAINS'], inStock: 4.2, capacity: 50.0, unit: 'kg', level: 8, status: 'Critical', price: 8.50, icon: 'rice_bowl' },
    { sku: 'MT-WAGY-01', name: 'Miyazaki Wagyu A5', category: ['PREMIUM', 'MEAT'], inStock: 8.0, capacity: 15.0, unit: 'kg', level: 53, status: 'Healthy', price: 320.00, icon: 'restaurant' },
    { sku: 'SF-SCAL-01', name: 'Hokkaido Scallops', category: ['SEAFOOD'], inStock: 2.5, capacity: 10.0, unit: 'kg', level: 25, status: 'Low', price: 85.00, icon: 'set_meal' },
  ];

  const DELIVERIES = [
    { vendor: 'Tsukiji Market Express', time: 'YESTERDAY, 06:30 AM', amount: 2450.00, status: 'completed' },
    { vendor: 'Hokkaido Rice Mills', time: '2 DAYS AGO, 11:15 AM', amount: 840.00, status: 'completed' },
  ];

  const healthData = [
    { name: 'Active Stock', value: 90, color: '#9DD761' },
    { name: 'Waste Ratio', value: 5, color: '#FFB4A5' },
    { name: 'Procurement', value: 5, color: '#C0C7D4' },
  ];

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
            <p className="text-3xl font-headline font-extrabold text-on-surface mb-2">$14,208.50</p>
            <p className="text-[10px] font-bold text-secondary flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">trending_up</span>
              +2.4% from last month
            </p>
          </div>

          <div className="bg-surface-container p-8 rounded-2xl border border-secondary/30 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-secondary">
              <span className="material-symbols-outlined text-4xl">warning</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Action Required</p>
            <p className="text-5xl font-headline font-extrabold text-secondary mb-2">04</p>
            <p className="text-[10px] font-bold text-on-surface-variant">Low Stock Alerts</p>
          </div>

          <div className="bg-surface-container p-8 rounded-2xl border border-outline-variant/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-tertiary">
              <span className="material-symbols-outlined text-4xl">restaurant</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Usage Today</p>
            <p className="text-3xl font-headline font-extrabold text-on-surface mb-2">$1,240.00</p>
            <p className="text-[10px] font-bold text-on-surface-variant">Across 12 ingredient categories</p>
          </div>

          <div className="bg-surface-container p-8 rounded-2xl border border-outline-variant/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-primary">
              <span className="material-symbols-outlined text-4xl">payments</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Monthly Spending</p>
            <p className="text-3xl font-headline font-extrabold text-on-surface mb-2">$8,450.00</p>
            <p className="text-[10px] font-bold text-on-surface-variant">Since beginning of month</p>
          </div>
        </div>

        {/* Manifest Section */}
        <div className="bg-surface-container rounded-3xl border border-outline-variant/10 overflow-hidden mb-10">
          <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low/50">
            <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight">Ingredient Manifest</h3>
            <div className="flex gap-4">
              <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-sm">filter_list</span> FILTER
              </button>
              <button className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-sm">download</span> EXPORT
              </button>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {INGREDIENTS.map((item, idx) => (
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
                    </td>
                    <td className="px-8 py-6 min-w-[200px]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-on-surface-variant">{item.level}%</span>
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${
                          item.status === 'Critical' ? 'text-secondary' : 
                          item.status === 'Low' ? 'text-orange-400' : 'text-on-surface-variant'
                        }`}>{item.status}</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${
                            item.status === 'Critical' ? 'bg-secondary' : 
                            item.status === 'Low' ? 'bg-orange-400' : 'bg-on-surface-variant'
                          }`}
                          style={{ width: `${item.level}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <p className="text-sm font-bold text-on-surface">${item.price.toFixed(2)}/{item.unit}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-6 bg-surface-container-low/30 border-t border-outline-variant/10 flex items-center justify-between">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Showing 4 of 48 items</p>
            <div className="flex gap-4">
              <button className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest">Previous</button>
              <button className="text-[10px] font-bold text-on-surface hover:text-secondary transition-colors uppercase tracking-widest">Next</button>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Deliveries */}
          <div className="lg:col-span-2 bg-surface-container rounded-3xl border border-outline-variant/10 p-8">
            <h3 className="text-xl font-headline font-extrabold text-on-surface uppercase tracking-tight mb-8">Recent Deliveries</h3>
            <div className="space-y-4">
              {DELIVERIES.map((delivery, idx) => (
                <div key={idx} className="flex items-center justify-between p-6 bg-surface-container-low/50 rounded-2xl border border-outline-variant/5 hover:border-secondary/20 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-tertiary/10 text-tertiary flex items-center justify-center">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                    </div>
                    <div>
                      <p className="font-bold text-on-surface group-hover:text-secondary transition-colors">{delivery.vendor}</p>
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">{delivery.time}</p>
                    </div>
                  </div>
                  <p className="text-lg font-headline font-extrabold text-secondary">+${delivery.amount.toFixed(2)}</p>
                </div>
              ))}
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
                <p className="text-4xl font-headline font-extrabold text-on-surface">90</p>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">OPTIMAL</p>
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

        {isAddUsageOpen && (
          <AddUsageModal 
            ingredients={INGREDIENTS} 
            onClose={() => setIsAddUsageOpen(false)} 
          />
        )}

        {isLogPurchaseOpen && (
          <LogPurchaseModal 
            ingredients={INGREDIENTS} 
            onClose={() => setIsLogPurchaseOpen(false)} 
          />
        )}

        {isCreateIngredientOpen && (
          <CreateIngredientModal 
            onClose={() => setIsCreateIngredientOpen(false)} 
          />
        )}
      </div>
    </div>
  );
};

const CategoryModal = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-8">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-container rounded-[2.5rem] border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-500">
        <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low">
          <div>
            <h2 className="text-3xl font-headline font-extrabold text-on-surface uppercase tracking-tight">New Category</h2>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mt-1">Add a new product category</p>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-surface-variant transition-all">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Category Name</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Beverages"
              className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl px-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
            />
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
            onClick={onClose}
            className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            Create Category
          </button>
        </div>
      </div>
    </div>
  );
};

const ProductModal = ({ product, onClose }: { product?: Product, onClose: () => void }) => {
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(product?.price?.toString() || '');
  const [category, setCategory] = useState(product?.category || CATEGORIES[0].name);
  const [image, setImage] = useState(product?.image || '');
  const [variations, setVariations] = useState<VariationGroup[]>(product?.variations || []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(product?.ingredients || []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const addVariationGroup = () => {
    setVariations([...variations, { id: `vg_${Date.now()}`, name: '', options: [] }]);
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
    newVars[groupIndex].options.push({ id: `vo_${Date.now()}`, name: '', priceAdjustment: 0 });
    setVariations(newVars);
  };

  const updateOptionName = (groupIndex: number, optionIndex: number, name: string) => {
    const newVars = [...variations];
    newVars[groupIndex].options[optionIndex].name = name;
    setVariations(newVars);
  };

  const updateOptionPrice = (groupIndex: number, optionIndex: number, price: string) => {
    const newVars = [...variations];
    newVars[groupIndex].options[optionIndex].priceAdjustment = parseFloat(price) || 0;
    setVariations(newVars);
  };

  const removeOption = (groupIndex: number, optionIndex: number) => {
    const newVars = [...variations];
    newVars[groupIndex].options = newVars[groupIndex].options.filter((_, i) => i !== optionIndex);
    setVariations(newVars);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { id: `ing_${Date.now()}`, name: '', amount: 0, unit: 'g' }]);
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
    option.ingredients.push({ id: `ing_${Date.now()}`, name: '', amount: 0, unit: 'g' });
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

  const handleSave = () => {
    const productData: Product = {
      id: product?.id || `p${Date.now()}`,
      name,
      description,
      price: parseFloat(price) || 0,
      category,
      image,
      variations,
      ingredients,
      inStock: product?.inStock ?? true
    };

    if (product) {
      const index = PRODUCTS.findIndex(p => p.id === product.id);
      if (index !== -1) {
        PRODUCTS[index] = productData;
      }
    } else {
      PRODUCTS.push(productData);
    }
    onClose();
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
              {image ? (
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
              <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" onChange={handleImageUpload} />
            </div>
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
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Base Price</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">$</span>
                <input 
                  type="number" 
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-2xl pl-10 pr-6 py-4 text-sm text-on-surface focus:border-primary outline-none transition-all"
                />
              </div>
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
                <div key={ing.id} className="flex gap-3 items-center">
                  <input 
                    value={ing.name} 
                    onChange={e => updateIngredient(iIndex, 'name', e.target.value)} 
                    placeholder="Ingredient (e.g. Tuna)" 
                    className="flex-1 bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all" 
                  />
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
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">+$</span>
                          <input 
                            type="number" 
                            value={opt.priceAdjustment || ''} 
                            onChange={e => updateOptionPrice(gIndex, oIndex, e.target.value)} 
                            placeholder="0.00" 
                            className="w-full bg-surface-container-highest border border-outline-variant/20 rounded-xl pl-8 pr-3 py-2 text-sm text-on-surface focus:border-primary outline-none transition-all" 
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
                        {opt.ingredients?.map((ing, ingIndex) => (
                          <div key={ing.id} className="flex gap-2 items-center">
                            <input 
                              value={ing.name} 
                              onChange={e => updateOptionIngredient(gIndex, oIndex, ingIndex, 'name', e.target.value)} 
                              placeholder="Ingredient" 
                              className="flex-1 bg-surface-container-highest/50 border border-outline-variant/10 rounded-lg px-3 py-1.5 text-xs text-on-surface focus:border-primary outline-none transition-all" 
                            />
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
        </div>

        <div className="p-8 bg-surface-container-low border-t border-outline-variant/10 flex gap-4 shrink-0">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-surface-container-highest text-on-surface rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            {product ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ProductManagementView = () => {
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Product Management</h1>
          <p className="text-on-surface-variant text-sm">Manage your menu items and categories.</p>
        </div>
        <div className="flex gap-4">
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
              <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-left">Product</th>
              <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-left">Category</th>
              <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-right">Price</th>
              <th className="px-8 py-6 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {PRODUCTS.map((product) => (
              <tr key={product.id} className="hover:bg-surface-container-high/50 transition-colors">
                <td className="px-8 py-6">
                  <div className="flex items-center gap-4">
                    <img src={product.image} alt={product.name} className="w-12 h-12 rounded-lg object-cover" />
                    <p className="font-bold text-on-surface">{product.name}</p>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-surface-container-highest text-on-surface-variant rounded-md">
                    {product.category}
                  </span>
                </td>
                <td className="px-8 py-6 text-right font-bold text-on-surface">${product.price.toFixed(2)}</td>
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
        />
      )}
    </div>
  );
};

export const SettingsView = ({ currentSetting, hasPermission }: { currentSetting: string, hasPermission: (p: Permission) => boolean }) => {
  const [selectedDossierUser, setSelectedDossierUser] = useState<{ user: User, edit: boolean } | null>(null);
  const [selectedWithdrawalUser, setSelectedWithdrawalUser] = useState<User | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isEditScheduleOpen, setIsEditScheduleOpen] = useState(false);
  const [hrDateRange, setHrDateRange] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${lastDay}`
    };
  });
  const [branding, setBranding] = useState({
    restaurantName: 'Omakase POS',
    primaryColor: '#C0C7D4',
    secondaryColor: '#FFB4A5',
    accentColor: '#9DD761',
    compactLayout: true,
    showItemizedTax: true,
    printQrCode: false,
    footerText: 'Thank you for dining with us',
    phone: '+81 75 123 4567',
    email: 'hospitality@omakase-pos.com',
    address: '123 Sushi Lane, Kyoto District 4\nJapan, 604-8123'
  });

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-grid-pattern">
      <div className="max-w-6xl mx-auto">
        {currentSetting === 'products' && <ProductManagementView />}
        {currentSetting === 'branding' && (
          <>
            <div className="mb-10">
              <h1 className="text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Branding</h1>
              <p className="text-on-surface-variant text-sm">Define your restaurant's visual identity across all digital and physical touchpoints.</p>
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
                    <div className="w-48 h-48 bg-surface-container-lowest rounded-xl border-2 border-dashed border-outline-variant/30 flex items-center justify-center relative group cursor-pointer overflow-hidden">
                      <div className="w-24 h-24 bg-surface-container-high rounded-lg flex items-center justify-center p-4">
                        <img 
                          src="https://images.unsplash.com/photo-1615485240384-552e40079c44?auto=format&fit=crop&q=80&w=200" 
                          alt="Logo" 
                          className="w-full h-full object-contain grayscale opacity-60"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="material-symbols-outlined text-white">upload</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">Restaurant Name</label>
                    <input 
                      type="text" 
                      value={branding.restaurantName}
                      onChange={(e) => setBranding({...branding, restaurantName: e.target.value})}
                      className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl px-6 py-4 text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold text-lg mb-4" 
                    />
                    <p className="text-xs text-on-surface-variant leading-relaxed">This name will appear on the top navigation bar and all customer-facing interfaces.</p>
                  </div>
                </div>
              </div>

              {/* Color Palette */}
              <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10">
                <h3 className="text-lg font-bold font-headline mb-8 flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">palette</span> Color Palette
                </h3>
                
                <div className="space-y-6 mb-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg shadow-inner" style={{ backgroundColor: branding.primaryColor }}></div>
                    <div>
                      <p className="font-bold text-sm text-on-surface">Primary</p>
                      <p className="text-[10px] font-mono text-on-surface-variant uppercase">{branding.primaryColor}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg shadow-inner" style={{ backgroundColor: branding.secondaryColor }}></div>
                    <div>
                      <p className="font-bold text-sm text-on-surface">Secondary</p>
                      <p className="text-[10px] font-mono text-on-surface-variant uppercase">{branding.secondaryColor}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg shadow-inner" style={{ backgroundColor: branding.accentColor }}></div>
                    <div>
                      <p className="font-bold text-sm text-on-surface">Accent</p>
                      <p className="text-[10px] font-mono text-on-surface-variant uppercase">{branding.accentColor}</p>
                    </div>
                  </div>
                </div>
                
                <button className="w-full py-4 bg-surface-container-highest text-on-surface rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-surface-variant transition-colors">
                  Preview Theme
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Receipt Design */}
              <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10">
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
                    <div className="w-56 bg-white p-6 shadow-xl rounded-sm text-black font-mono text-[10px] leading-tight">
                      <div className="text-center mb-4">
                        <p className="font-bold text-sm uppercase tracking-widest mb-1">OMAKASE</p>
                        <p className="text-[8px] opacity-70">123 Sushi Lane, Kyoto</p>
                        <p className="text-[8px] opacity-70">Tel: +81 75 123 4567</p>
                      </div>
                      
                      <div className="border-t border-b border-dashed border-black/20 py-3 my-3 space-y-1">
                        <div className="flex justify-between">
                          <span>Ootoro Sashimi</span>
                          <span>$45.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sake Selection</span>
                          <span>$32.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Seasonal Nigiri</span>
                          <span>$120.00</span>
                        </div>
                      </div>
                      
                      <div className="flex justify-between font-bold text-xs mb-6">
                        <span>TOTAL</span>
                        <span>$197.00</span>
                      </div>
                      
                      <div className="text-center italic opacity-60 mb-6 px-4">
                        {branding.footerText}
                      </div>
                      
                      <div className="flex justify-center">
                        <div className="w-12 h-12 bg-black/5 flex items-center justify-center">
                          <span className="material-symbols-outlined text-black/20 text-4xl">barcode</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="flex flex-col gap-8">
                <div className="bg-surface-container rounded-2xl p-8 shadow-sm border border-outline-variant/10 flex-1">
                  <h3 className="text-lg font-bold font-headline mb-8 flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary">contact_page</span> Contact Information
                  </h3>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Phone Number</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">phone</span>
                        <input 
                          type="text" 
                          value={branding.phone}
                          onChange={(e) => setBranding({...branding, phone: e.target.value})}
                          className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl pl-12 pr-6 py-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Email Address</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">mail</span>
                        <input 
                          type="email" 
                          value={branding.email}
                          onChange={(e) => setBranding({...branding, email: e.target.value})}
                          className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl pl-12 pr-6 py-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Physical Address</label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-4 text-on-surface-variant text-lg">location_on</span>
                        <textarea 
                          value={branding.address}
                          onChange={(e) => setBranding({...branding, address: e.target.value})}
                          className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-xl pl-12 pr-6 py-4 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 font-bold h-32 resize-none" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <button className="w-full py-5 bg-secondary text-on-secondary rounded-2xl text-sm font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors shadow-lg flex items-center justify-center gap-3">
                  <span className="material-symbols-outlined">save</span> Save All Changes
                </button>
              </div>
            </div>
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
                    <p className="text-5xl font-headline font-extrabold text-on-surface">{USERS.length}</p>
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
                      {Math.round(USERS.reduce((acc, u) => acc + u.attendanceScore, 0) / USERS.length)}%
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
                    {USERS.map(user => (
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
                              <span className="bg-surface-container-highest text-on-surface text-[9px] px-3 py-1.5 rounded font-bold tracking-widest">
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
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">PERSONNEL REGISTRY</h3>
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
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10">PERSONNEL</th>
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10">ROLE</th>
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10">ATTENDANCE SCORE</th>
                    <th className="px-6 py-4 text-[10px] uppercase tracking-widest text-on-surface-variant font-bold border-b border-outline-variant/10 text-right">EDIT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {USERS.map(user => (
                    <tr key={user.id} className="hover:bg-surface-container-high transition-colors group">
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
                        <button 
                          onClick={() => setSelectedDossierUser({ user, edit: true })}
                          className="p-2 hover:bg-surface-container-highest rounded transition-colors text-on-surface-variant hover:text-on-surface"
                        >
                          <span className="material-symbols-outlined text-sm">edit_note</span>
                        </button>
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
                <div className="flex items-center gap-2">
                  <input 
                    type="date" 
                    value={hrDateRange.start}
                    onChange={(e) => setHrDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-xs text-on-surface focus:border-primary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                  <span className="text-on-surface-variant text-xs font-bold uppercase tracking-widest">to</span>
                  <input 
                    type="date" 
                    value={hrDateRange.end}
                    onChange={(e) => setHrDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="bg-surface-container-highest border border-outline-variant/20 rounded-xl px-4 py-2 text-xs text-on-surface focus:border-primary outline-none transition-all [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
                <button className="px-6 py-3 bg-surface-container-highest text-on-surface rounded text-[10px] font-bold uppercase tracking-widest hover:bg-surface-variant transition-colors">
                  EXPORT REPORT
                </button>
                <button className="px-6 py-3 bg-secondary text-on-secondary rounded text-[10px] font-bold uppercase tracking-widest hover:bg-[#ffc4b8] transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">payments</span>
                  PROCESS PAYROLL
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
              {USERS.map(user => {
                const startDay = new Date(hrDateRange.start).getDate();
                const endDay = new Date(hrDateRange.end).getDate();
                const filteredAttendance = user.monthlyAttendance.filter(a => {
                  const dayNum = parseInt(a.day);
                  // Basic mock logic: filter by day number if within the same month, or just use day number
                  return dayNum >= startDay && dayNum <= endDay;
                });
                
                const totalSalary = user.baseSalary + user.rewards - user.sanctions;
                return (
                  <div key={user.id} className="bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-outline-variant/10 flex items-center gap-4 bg-surface-container-low">
                      <div className="w-14 h-14 rounded-xl bg-surface-container-high border border-outline-variant/30 overflow-hidden">
                        <img src={user.image} alt={user.name} className="w-full h-full object-cover grayscale" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-headline font-extrabold text-on-surface uppercase tracking-tight">{user.name}</h3>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{user.role}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">ATTENDANCE SCORE</p>
                        <p className={`text-2xl font-headline font-extrabold ${user.attendanceScore > 90 ? 'text-tertiary' : 'text-secondary'}`}>{user.attendanceScore}%</p>
                      </div>
                    </div>

                    <div className="p-6 grid grid-cols-2 gap-8">
                      {/* Attendance Chart */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">MONTHLY HOURS DISTRIBUTION</p>
                        <div className="h-48 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={filteredAttendance}>
                              <XAxis 
                                dataKey="day" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={(props: any) => {
                                  const { x, y, payload, index } = props;
                                  const dayData = filteredAttendance[index];
                                  if (!dayData) return null;
                                  return (
                                    <g transform={`translate(${x},${y})`}>
                                      {dayData.rewardNote && <circle cx={0} cy={8} r={3} fill="#4ADE80" />}
                                      {dayData.sanctionNote && <circle cx={0} cy={8} r={3} fill="#FF4444" />}
                                      {!dayData.rewardNote && !dayData.sanctionNote && <circle cx={0} cy={8} r={1} fill="rgba(255,255,255,0.2)" />}
                                    </g>
                                  );
                                }}
                              />
                              <YAxis hide domain={[0, 14]} />
                              <Tooltip 
                                cursor={{ fill: 'var(--surface-container-highest)', opacity: 0.1 }}
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="bg-black/85 p-3 rounded-lg border-none shadow-xl min-w-[140px]">
                                        <p className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Day {data.day}</p>
                                        <p className="text-xs font-extrabold text-white mb-1">{data.hours} Hours</p>
                                        
                                        {data.checkIn && (
                                          <div className="flex flex-col gap-0.5 mt-2 border-t border-white/10 pt-2">
                                            <p className="text-[8px] font-bold text-white/60 uppercase tracking-tighter">Check In: <span className="text-white">{data.checkIn}</span></p>
                                            <p className="text-[8px] font-bold text-white/60 uppercase tracking-tighter">Check Out: <span className="text-white">{data.checkOut}</span></p>
                                            
                                            {(data.isLate || data.isEarlyDeparture || data.isOvertime) && (
                                              <p className="text-[8px] font-bold uppercase tracking-tighter mt-1">
                                                {data.isLate && <span className="text-[#FF6321]">Late Arrival</span>}
                                                {data.isLate && (data.isEarlyDeparture || data.isOvertime) && <span className="text-white/40"> & </span>}
                                                {data.isEarlyDeparture && <span className="text-[#FF6321]">Early Departure</span>}
                                                {data.isEarlyDeparture && data.isOvertime && <span className="text-white/40"> & </span>}
                                                {data.isOvertime && <span className="text-[#4ADE80]">Overtime</span>}
                                              </p>
                                            )}
                                          </div>
                                        )}

                                        {(data.rewardNote || data.sanctionNote) && (
                                          <div className="mt-2 border-t border-white/10 pt-2 flex flex-col gap-1">
                                            {data.rewardNote && (
                                              <div className="flex items-start gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] mt-0.5 shrink-0" />
                                                <p className="text-[8px] font-bold text-[#4ADE80] uppercase leading-tight">{data.rewardNote}</p>
                                              </div>
                                            )}
                                            {data.sanctionNote && (
                                              <div className="flex items-start gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#FF4444] mt-0.5 shrink-0" />
                                                <p className="text-[8px] font-bold text-[#FF4444] uppercase leading-tight">{data.sanctionNote}</p>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Bar dataKey="hours" radius={[2, 2, 0, 0]}>
                                {filteredAttendance.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={(entry.isLate || entry.isEarlyDeparture) ? '#FF6321' : (entry.isOvertime ? '#4ADE80' : '#FFB4A5')} 
                                  />
                                ))}
                              </Bar>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Financial & Performance Summary */}
                      <div className="space-y-6">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">PERFORMANCE METRICS</p>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/5">
                              <p className="text-[9px] font-bold text-tertiary uppercase tracking-widest mb-1">REWARDS</p>
                              <p className="text-lg font-headline font-extrabold text-on-surface">+${user.rewards}</p>
                            </div>
                            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/5">
                              <p className="text-[9px] font-bold text-error uppercase tracking-widest mb-1">SANCTIONS</p>
                              <p className="text-lg font-headline font-extrabold text-on-surface">-${user.sanctions}</p>
                            </div>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">FINANCIAL SUMMARY</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">RAW SALARY</span>
                              <span className="text-xs font-bold text-on-surface">${user.baseSalary.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">ADJUSTMENTS</span>
                              <span className={`text-xs font-bold ${user.rewards - user.sanctions >= 0 ? 'text-tertiary' : 'text-error'}`}>
                                {user.rewards - user.sanctions >= 0 ? '+' : ''}${Math.abs(user.rewards - user.sanctions)}
                              </span>
                            </div>
                            <div className="h-px bg-outline-variant/10 my-2"></div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-on-surface uppercase tracking-widest">TOTAL SALARY</span>
                              <span className="text-lg font-headline font-extrabold text-primary">${totalSalary.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-surface-container-highest/20 p-4 rounded-xl border border-outline-variant/10">
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

            {selectedDossierUser && (
              <DossierModal 
                user={selectedDossierUser.user} 
                dateRange={hrDateRange}
                initialIsEditing={selectedDossierUser.edit}
                onClose={() => setSelectedDossierUser(null)} 
              />
            )}

            {selectedWithdrawalUser && (
              <WithdrawalModal 
                user={selectedWithdrawalUser} 
                dateRange={hrDateRange}
                onClose={() => setSelectedWithdrawalUser(null)} 
              />
            )}
          </>
        )}

        {currentSetting === 'roles' && <RoleManagementView />}

        {currentSetting === 'locations' && (
          <>
            <h1 className="text-3xl font-extrabold font-headline tracking-tight text-on-surface mb-2">Locations</h1>
            <p className="text-on-surface-variant text-sm mb-8">Manage your restaurant locations.</p>
            
            <div className="bg-surface-container rounded-xl p-8 shadow-sm mb-8">
              <h3 className="text-lg font-bold font-headline mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">location_on</span> Venues
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 bg-surface-container-lowest rounded-lg border-2 border-secondary relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-secondary text-on-secondary text-[9px] font-bold uppercase tracking-micro px-2 py-1 rounded-bl-lg">Current</div>
                  <h4 className="font-bold text-lg mb-1">Omakase Station 01</h4>
                  <p className="text-xs text-on-surface-variant mb-4">123 Culinary Ave, Food District</p>
                  <div className="flex gap-2">
                    <span className="bg-surface-container-high text-on-surface text-[10px] px-2 py-1 rounded font-bold uppercase tracking-micro">12 Tables</span>
                    <span className="bg-surface-container-high text-on-surface text-[10px] px-2 py-1 rounded font-bold uppercase tracking-micro">1 Bar</span>
                  </div>
                </div>
                <div className="p-6 bg-surface-container-lowest rounded-lg border border-outline-variant/10 opacity-60 hover:opacity-100 transition-opacity cursor-pointer flex flex-col items-center justify-center text-center">
                  <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2">add_circle</span>
                  <h4 className="font-bold text-sm text-on-surface">Add New Location</h4>
                </div>
              </div>
            </div>
          </>
        )}

        {isOnboardingOpen && (
          <OnboardPersonnelModal 
            onClose={() => setIsOnboardingOpen(false)} 
          />
        )}

        {isEditScheduleOpen && (
          <EditScheduleModal 
            onClose={() => setIsEditScheduleOpen(false)} 
          />
        )}
      </div>
    </div>
  );
};
