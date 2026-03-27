import React from 'react';

/**
 * StatusBadge — coloured pill for order / attendance statuses.
 *
 * @example
 * <StatusBadge status="Done" />
 * <StatusBadge status="Cancelled" />
 * <StatusBadge status="Preparing" />
 *
 * Recognised statuses and their colours:
 * - Done        → green
 * - Cancelled   → red
 * - Preparing   → blue
 * - Ready       → yellow
 * - Queued      → neutral
 * - Scheduled   → purple
 * - (fallback)  → neutral
 */
export const StatusBadge = ({ status }: { status: string }) => {
  const colours: Record<string, string> = {
    Done:       'bg-green-500/10 text-green-400',
    Cancelled:  'bg-red-500/10 text-red-400',
    Preparing:  'bg-blue-500/10 text-blue-400',
    Ready:      'bg-yellow-500/10 text-yellow-400',
    Queued:     'bg-surface-variant text-on-surface-variant',
    Scheduled:  'bg-purple-500/10 text-purple-400',
  };

  return (
    <span
      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
        colours[status] ?? 'bg-surface-variant text-on-surface-variant'
      }`}
    >
      {status}
    </span>
  );
};

/**
 * CountBadge — small numeric counter dot (e.g. cart item count, notification count).
 *
 * @example
 * <CountBadge count={3} />
 */
export const CountBadge = ({ count }: { count: number }) => (
  <span className="absolute -top-1 -right-1 bg-tertiary text-on-tertiary text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
    {count}
  </span>
);
