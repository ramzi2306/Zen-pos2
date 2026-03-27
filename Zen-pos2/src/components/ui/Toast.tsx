import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Toast — floating notification pill that slides up from the bottom.
 *
 * Wrap with AnimatePresence at the call-site so exit animations work:
 *
 * @example
 * <AnimatePresence>
 *   {toast && <Toast message={toast.message} type={toast.type} />}
 * </AnimatePresence>
 *
 * @prop message - Text to display
 * @prop type    - 'success' (green check) | 'error' (red X)
 */
export const Toast = ({
  message,
  type,
}: {
  message: string;
  type: 'success' | 'error';
}) => (
  <motion.div
    initial={{ opacity: 0, y: 50, x: '-50%' }}
    animate={{ opacity: 1, y: 0, x: '-50%' }}
    exit={{ opacity: 0, y: 50, x: '-50%' }}
    className="fixed bottom-8 left-1/2 z-[100] px-6 py-3 bg-surface-container-highest border border-outline-variant/20 rounded-full shadow-2xl flex items-center gap-3 min-w-[300px]"
  >
    <div className={type === 'success' ? 'text-[#8bc34a]' : 'text-error'}>
      <span className="material-symbols-outlined">
        {type === 'success' ? 'check_circle' : 'error'}
      </span>
    </div>
    <span className="text-on-surface font-medium">{message}</span>
  </motion.div>
);
