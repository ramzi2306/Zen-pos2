import React, { useState, useEffect, useMemo } from 'react';
import { User, Role } from '../data';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../api';
import { zenWs } from '../api/websocket';

/**
 * AttendanceView — full-screen kiosk for staff check-in / check-out.
 *
 * @prop setCurrentView - Navigate away from this screen
 * @prop group          - Optional station filter: "kitchen" | "cashier" | "admin"
 *                        When set, only staff assigned to that attendance group are shown.
 *                        Leave undefined to show all staff (admin tablet).
 */
export const AttendanceView = ({ setCurrentView, onLogout, isKioskOnly, isKioskForever, isLocked, currentUserId, onCurrentUserCheckedIn, group }: {
  setCurrentView: (v: string) => void;
  onLogout?: () => void;
  /** Legacy: only view_attendance perm, no view_menu — shows logout button */
  isKioskOnly?: boolean;
  /** Attendance Manager role: no exit button, only logout */
  isKioskForever?: boolean;
  /** Register is closed: exit button hidden, user must check in first */
  isLocked?: boolean;
  /** The currently logged-in user's ID, to detect when they personally check in */
  currentUserId?: string;
  /** Called when the logged-in user (currentUserId) successfully checks in */
  onCurrentUserCheckedIn?: () => void;
  group?: string;
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load users (filtered by station group if provided) and today's attendance status
  useEffect(() => {
    // Fetch users and roles in parallel
    Promise.all([
      api.users.listUsers(group),
      api.users.listRoles()
    ]).then(([loadedUsers, loadedRoles]) => {
      setUsers(loadedUsers);
      setRoles(loadedRoles);
    }).catch(console.error);

    api.attendance.getTodayRecords().then(records => {
      const ids = new Set(records.filter(r => r.status === 'active').map(r => r.userId));
      setCheckedInIds(ids);
    }).catch(console.error);
  }, [group]);

  // Keep checked-in state in sync across all kiosk tablets via WebSocket
  useEffect(() => {
    return zenWs.onEvent(event => {
      if (event.type !== 'attendance_update' || !event.user_id) return;
      if (event.action === 'check_in') {
        setCheckedInIds(prev => new Set([...prev, event.user_id!]));
      } else if (event.action === 'check_out' || event.action === 'force_check_out') {
        setCheckedInIds(prev => { const next = new Set(prev); next.delete(event.user_id!); return next; });
      }
    });
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const role = roles.find(r => r.id === user.roleId);
      return !role?.excludeFromAttendance && user.role !== 'Super Admin';
    });
  }, [users, roles]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handlePinClick = (num: string) => {
    if (pin.length < 4) setPin(prev => prev + num);
  };

  const handleClear = () => setPin('');

  const handleAction = async (type: 'check-in' | 'check-out') => {
    if (!selectedUser || pin.length < 4) return;
    try {
      if (type === 'check-in') {
        const record = await api.attendance.checkIn(selectedUser.id, pin);
        setCheckedInIds(prev => new Set([...prev, selectedUser.id]));
        setMessage({ type: 'success', text: `${selectedUser.name} checked in at ${record.checkIn}` });
        // If this is the currently logged-in user checking in, open the register
        if (currentUserId && selectedUser.id === currentUserId) {
          setTimeout(() => onCurrentUserCheckedIn?.(), 1200);
        }
      } else {
        const record = await api.attendance.checkOut(selectedUser.id, pin);
        setCheckedInIds(prev => { const next = new Set(prev); next.delete(selectedUser.id); return next; });
        setMessage({ type: 'success', text: `${selectedUser.name} checked out at ${record.checkOut}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Invalid PIN or action failed.' });
    }
    setPin('');
    setSelectedUser(null);
    setTimeout(() => setMessage(null), 3000);
  };

  const isUserCheckedIn = (userId: string) => checkedInIds.has(userId);

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-grid-pattern flex flex-col items-center justify-center min-h-full relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Controls */}
      <div className="absolute top-8 right-8 flex gap-4 z-50">
        <button
          onClick={toggleFullscreen}
          className="w-12 h-12 rounded-full bg-surface-container/80 backdrop-blur-md border border-outline-variant/20 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all shadow-lg"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          <span className="material-symbols-outlined">
            {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
          </span>
        </button>
        {/* isKioskForever = Attendance Manager: only shows logout, no exit */}
        {isKioskForever ? (
          <button
            onClick={onLogout}
            className="w-12 h-12 rounded-full bg-error/10 backdrop-blur-md border border-error/20 flex items-center justify-center text-error hover:bg-error hover:text-white transition-all shadow-lg"
            title="Logout"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        ) : isKioskOnly ? (
          <button
            onClick={onLogout}
            className="w-12 h-12 rounded-full bg-error/10 backdrop-blur-md border border-error/20 flex items-center justify-center text-error hover:bg-error hover:text-white transition-all shadow-lg"
            title="Logout"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        ) : !isLocked ? (
          /* Register is open — allow exiting the attendance screen */
          <button
            onClick={() => setCurrentView('menu')}
            className="w-12 h-12 rounded-full bg-surface-container/80 backdrop-blur-md border border-outline-variant/20 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-surface-container transition-all shadow-lg"
            title="Exit Attendance"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        ) : null /* isLocked=true: register closed, must check in — no exit button */}
      </div>

      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        
        {/* Left Side: Time and User Selection */}
        <div className="flex flex-col">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-12 text-center lg:text-left"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-secondary mb-3">
              {group ? `${group.toUpperCase()} STATION · ` : ''}OPERATIONAL CHRONOGRAPH
            </p>
            <h1 className="text-7xl font-headline font-extrabold text-on-surface mb-2 tracking-tighter">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </h1>
            <p className="text-on-surface-variant text-sm font-bold uppercase tracking-[0.2em] opacity-60">
              {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface-container/60 backdrop-blur-xl rounded-[2.5rem] p-8 border border-outline-variant/10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">PERSONNEL REGISTRY</h3>
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-secondary" />
                <div className="w-1 h-1 rounded-full bg-secondary/40" />
                <div className="w-1 h-1 rounded-full bg-secondary/20" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredUsers.map((user, idx) => (
                <motion.button
                  key={user.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + (idx * 0.05) }}
                  onClick={() => {
                    setSelectedUser(user);
                    setPin('');
                  }}
                  className={`p-4 rounded-2xl border transition-all flex items-center gap-4 text-left group relative overflow-hidden ${
                    selectedUser?.id === user.id 
                      ? 'bg-secondary border-secondary text-on-secondary shadow-xl scale-[1.02]' 
                      : 'bg-surface-container-low border-outline-variant/10 text-on-surface hover:bg-surface-container-high hover:border-secondary/30'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-surface-container-high overflow-hidden flex-shrink-0 border border-outline-variant/20">
                    <img src={user.image} alt={user.name} className={`w-full h-full object-cover transition-all duration-500 ${selectedUser?.id === user.id ? 'grayscale-0 scale-110' : 'grayscale group-hover:grayscale-0'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider leading-tight truncate">{user.name}</p>
                    <p className={`text-[8px] font-bold uppercase tracking-widest mt-1 truncate ${selectedUser?.id === user.id ? 'text-on-secondary/70' : 'text-on-surface-variant/60'}`}>
                      {user.role}
                    </p>
                  </div>
                  {isUserCheckedIn(user.id) && (
                    <div className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_12px_rgba(74,222,128,0.8)] animate-pulse"></div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right Side: PIN Pad and Actions */}
        <div className="flex flex-col items-center justify-center min-h-[600px]">
          <AnimatePresence mode="wait">
            {selectedUser ? (
              <motion.div 
                key="pin-pad"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -20 }}
                className="w-full max-w-sm"
              >
                <div className="bg-surface-container/40 backdrop-blur-2xl rounded-[3rem] p-10 border border-outline-variant/10 shadow-3xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-secondary/40 to-transparent" />
                  
                  <div className="text-center mb-10">
                    <div className="w-20 h-20 rounded-3xl bg-surface-container-high mx-auto mb-6 border-2 border-secondary/20 overflow-hidden shadow-2xl">
                      <img src={selectedUser.image} alt="" className="w-full h-full object-cover grayscale" />
                    </div>
                    <p className="text-[10px] font-bold text-secondary uppercase tracking-[0.3em] mb-4">SECURITY VERIFICATION</p>
                    <div className="flex justify-center gap-5">
                      {[0, 1, 2, 3].map(i => (
                        <motion.div 
                          key={i} 
                          animate={{ 
                            scale: pin.length > i ? 1.2 : 1,
                            backgroundColor: pin.length > i ? 'var(--color-secondary)' : 'transparent'
                          }}
                          className={`w-4 h-4 rounded-full border-2 transition-all ${
                            pin.length > i ? 'border-secondary' : 'border-outline-variant/30'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-5 mb-10">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                      <motion.button
                        key={num}
                        whileHover={{ scale: 1.05, backgroundColor: 'var(--color-surface-container-high)' }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handlePinClick(num.toString())}
                        className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center text-2xl font-headline font-extrabold text-on-surface transition-all border border-outline-variant/10 shadow-sm"
                      >
                        {num}
                      </motion.button>
                    ))}
                    <button 
                      onClick={handleClear} 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-[10px] font-bold text-secondary uppercase tracking-widest hover:bg-secondary/10 transition-all"
                    >
                      CLEAR
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.05, backgroundColor: 'var(--color-surface-container-high)' }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handlePinClick('0')}
                      className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center text-2xl font-headline font-extrabold text-on-surface transition-all border border-outline-variant/10 shadow-sm"
                    >
                      0
                    </motion.button>
                    <button 
                      onClick={() => setSelectedUser(null)} 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest hover:bg-surface-container-highest/30 transition-all"
                    >
                      BACK
                    </button>
                  </div>

                  <div className="space-y-4">
                    {isUserCheckedIn(selectedUser.id) ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={pin.length < 4}
                        onClick={() => handleAction('check-out')}
                        className="w-full py-5 bg-error text-white rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-error/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-xl shadow-error/20"
                      >
                        TERMINATE SHIFT
                      </motion.button>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={pin.length < 4}
                        onClick={() => handleAction('check-in')}
                        className="w-full py-5 bg-tertiary text-on-tertiary rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-tertiary/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-xl shadow-tertiary/20"
                      >
                        INITIALIZE SHIFT
                      </motion.button>
                    )}

                    {/* Removed payroll/withdrawal section */}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="empty-state"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center p-16 bg-surface-container/20 backdrop-blur-md rounded-[4rem] border border-dashed border-outline-variant/20 max-w-sm flex flex-col items-center"
              >
                <div className="w-24 h-24 rounded-full bg-surface-container-highest/50 flex items-center justify-center text-on-surface-variant/20 mb-8 border border-outline-variant/10">
                  <span className="material-symbols-outlined text-5xl animate-pulse">fingerprint</span>
                </div>
                <h2 className="text-xl font-headline font-extrabold text-on-surface-variant uppercase tracking-[0.2em] mb-4">BIOMETRIC STANDBY</h2>
                <p className="text-xs text-on-surface-variant/40 leading-relaxed font-medium uppercase tracking-widest">Select a personnel profile from the registry to proceed with authentication.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Status Message Toast */}
      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-12 left-1/2 px-10 py-5 rounded-3xl shadow-3xl flex items-center gap-4 z-[100] backdrop-blur-xl ${
              message.type === 'success' ? 'bg-tertiary/90 text-on-tertiary' : 'bg-error/90 text-on-error'
            }`}
          >
            <span className="material-symbols-outlined">{message.type === 'success' ? 'check_circle' : 'error'}</span>
            <p className="text-xs font-bold uppercase tracking-[0.2em]">{message.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent Activity Log */}
      <AnimatePresence>
        {!selectedUser && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-8 right-8 max-w-xs w-full hidden xl:block z-10"
          >
            <div className="bg-surface-container/40 backdrop-blur-2xl rounded-[2rem] p-6 border border-outline-variant/10 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">ACTIVITY LOG</h4>
                <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              </div>
              <div className="space-y-5">
                {[...checkedInIds].slice(-3).map((userId, i) => {
                  const user = users.find(u => u.id === userId);
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-4"
                    >
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high overflow-hidden border border-outline-variant/10">
                        <img src={user?.image} alt="" className="w-full h-full object-cover grayscale" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-on-surface uppercase tracking-wider truncate">{user?.name}</p>
                        <p className="text-[8px] font-bold text-on-surface-variant uppercase tracking-widest mt-0.5">
                          <span className="text-tertiary">IN</span>
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
                {checkedInIds.size === 0 && (
                  <div className="py-6 flex flex-col items-center opacity-20">
                    <span className="material-symbols-outlined text-3xl mb-2">history</span>
                    <p className="text-[8px] font-bold uppercase tracking-widest">Log Empty</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
