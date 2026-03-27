import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User } from '../data';
import * as api from '../api';

export const AdminLoginView = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out. Is the server running?')), 8000)
      );
      const user = await Promise.race([api.auth.login(email, password), timeout]);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Invalid email or password. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-surface-container-lowest p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-surface-container rounded-[3rem] p-10 border border-outline-variant/10 shadow-3xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          
          <div className="text-center mb-10">
            <div className="w-20 h-20 rounded-3xl bg-primary-container mx-auto mb-6 flex items-center justify-center shadow-2xl">
              <span className="material-symbols-outlined text-primary text-4xl">lock_open</span>
            </div>
            <h2 className="text-2xl font-headline font-extrabold text-primary tracking-tight mb-2">ZenPOS Access</h2>
            <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">Secure Login Portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">Email Address</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant text-sm">mail</span>
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@zenpos.com"
                  className="w-full bg-surface-container-low rounded-2xl pl-12 pr-6 py-4 text-sm text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-2">Password</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant text-sm">lock</span>
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-surface-container-low rounded-2xl pl-12 pr-6 py-4 text-sm text-on-surface border border-outline-variant/10 focus:border-primary/50 outline-none transition-all"
                />
              </div>
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] font-bold text-error uppercase tracking-widest text-center"
              >
                {error}
              </motion.p>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-5 bg-primary text-on-primary rounded-2xl text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-all shadow-xl flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <span className="material-symbols-outlined animate-spin">sync</span>
              ) : (
                <>
                  <span className="material-symbols-outlined">login</span>
                  AUTHENTICATE
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-[10px] text-on-surface-variant/40 font-medium uppercase tracking-widest">
              Authorized Personnel Only
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
