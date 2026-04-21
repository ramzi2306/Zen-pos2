import * as React from "react";
import { cn } from "@/lib/utils";

export interface ContributionDayRecord {
  date: string;        // full ISO date "2024-01-15"
  hours: number;
  isLate: boolean;
  isEarlyDeparture: boolean;
  isOvertime: boolean;
  checkIn?: string;
  checkOut?: string;
}

interface AttendanceContributionGraphProps {
  records: ContributionDayRecord[];
  /** "2026-04" — always shows the full month regardless */
  month: string;
  totalHours: number;
  workedDays: number;
  className?: string;
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const WEEKEND = new Set([6, 0]); // Saturday = 6, Sunday = 0 (getDay)

function cellBg(rec: ContributionDayRecord | undefined, isWeekend: boolean): React.CSSProperties {
  if (!rec?.checkIn) {
    return isWeekend
      ? { backgroundColor: 'color-mix(in srgb, var(--color-on-surface) 4%, transparent)' }
      : { backgroundColor: 'color-mix(in srgb, var(--color-on-surface) 10%, transparent)' };
  }
  if (rec.isOvertime && !rec.isLate && !rec.isEarlyDeparture) {
    return { backgroundColor: 'var(--color-tertiary)', color: 'var(--color-on-tertiary)' };
  }
  if (rec.isLate || rec.isEarlyDeparture) {
    return { backgroundColor: 'color-mix(in srgb, var(--color-secondary) 80%, transparent)' };
  }
  const intensity = Math.min(100, Math.round((0.45 + (rec.hours / 8) * 0.55) * 100));
  return { backgroundColor: `color-mix(in srgb, var(--color-tertiary) ${intensity}%, transparent)` };
}

function cellTooltip(rec: ContributionDayRecord | undefined, date: string): string {
  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!rec?.checkIn) return `${label} — Off`;
  const flags = [rec.isLate && 'Late', rec.isEarlyDeparture && 'Early out', rec.isOvertime && 'Overtime'].filter(Boolean).join(' · ');
  const range = rec.checkOut ? `${rec.checkIn} → ${rec.checkOut}` : `In: ${rec.checkIn}`;
  return `${label}\n${rec.hours.toFixed(1)}h  ${range}${flags ? `\n${flags}` : ''}`;
}

export const AttendanceContributionGraph = ({
  records,
  month,
  totalHours,
  workedDays,
  className,
}: AttendanceContributionGraphProps) => {
  const recordMap = React.useMemo(() => {
    const m = new Map<string, ContributionDayRecord>();
    records.forEach(r => m.set(r.date, r));
    return m;
  }, [records]);

  // Parse the month string and build the full calendar grid
  const { monthLabel, calendarWeeks } = React.useMemo(() => {
    const [y, mo] = month.split('-').map(Number);
    const label = new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(y, mo - 1, 1);
    const lastDay  = new Date(y, mo, 0);

    // Mon-anchored: 0=Mon…6=Sun
    const startOffset = (firstDay.getDay() + 6) % 7;

    type Cell = { date: string; day: number; inMonth: boolean };
    const cells: Cell[] = [];

    // Leading empty cells
    for (let i = 0; i < startOffset; i++) cells.push({ date: '', day: 0, inMonth: false });

    // Actual days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date: iso, day: d, inMonth: true });
    }

    // Trailing empty cells to complete the last week
    while (cells.length % 7 !== 0) cells.push({ date: '', day: 0, inMonth: false });

    // Split into rows
    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return { monthLabel: label, calendarWeeks: weeks };
  }, [month]);

  const lateDays     = records.filter(r => r.isLate || r.isEarlyDeparture).length;
  const overtimeDays = records.filter(r => r.isOvertime).length;

  const [y, mo] = month.split('-').map(Number);

  return (
    <div className={cn("flex flex-col gap-4 w-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">
            Attendance Calendar
          </p>
          <p className="text-xl font-headline font-extrabold text-on-surface tracking-tight">
            {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-bold text-on-surface">
            {totalHours.toFixed(1)} <span className="text-on-surface-variant font-normal">hrs</span>
          </span>
          <span className="text-[11px] font-bold text-on-surface">
            {workedDays} <span className="text-on-surface-variant font-normal">days</span>
          </span>
          {lateDays > 0 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-secondary) 15%, transparent)', color: 'var(--color-secondary)' }}
            >
              {lateDays} late
            </span>
          )}
          {overtimeDays > 0 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)', color: 'var(--color-tertiary)' }}
            >
              {overtimeDays} OT
            </span>
          )}
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 w-full">
        {DOW_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid gap-1 w-full" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {calendarWeeks.flat().map((cell, i) => {
          if (!cell.inMonth) {
            return <div key={i} className="min-h-[56px] rounded-lg" />;
          }
          const d = new Date(y, mo - 1, cell.day);
          const isWeekend = WEEKEND.has(d.getDay());
          const rec = recordMap.get(cell.date);
          const bg = cellBg(rec, isWeekend);
          const isWorked = !!rec?.checkIn;

          return (
            <div
              key={i}
              className="min-h-[76px] rounded-lg p-2 flex flex-col justify-between cursor-default transition-opacity hover:opacity-85 relative"
              style={bg}
              title={cell.inMonth ? cellTooltip(rec, cell.date) : undefined}
            >
              {/* Top row: status dot + day number */}
              <div className="flex items-start justify-between">
                <div className="flex gap-0.5 mt-0.5">
                  {isWorked && (rec?.isLate || rec?.isEarlyDeparture) && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />
                  )}
                  {isWorked && rec?.isOvertime && !rec?.isLate && !rec?.isEarlyDeparture && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white/90 shrink-0" />
                  )}
                </div>
                <span
                  className="text-[11px] font-bold leading-none"
                  style={{ opacity: isWorked ? 0.65 : 0.35 }}
                >
                  {cell.day}
                </span>
              </div>

              {/* Bottom: hours + times */}
              {isWorked ? (
                <div className="flex flex-col gap-0.5 mt-1">
                  {rec!.hours > 0 && (
                    <span className="text-[11px] font-extrabold leading-none">
                      {rec!.hours.toFixed(1)}h
                    </span>
                  )}
                  {rec!.checkIn && (
                    <span className="text-[9px] leading-none" style={{ opacity: 0.75 }}>
                      {rec!.checkIn}{rec!.checkOut ? ` → ${rec!.checkOut}` : ''}
                    </span>
                  )}
                </div>
              ) : (
                <div />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap pt-1">
        {[
          { label: 'Off',     style: { backgroundColor: 'color-mix(in srgb, var(--color-on-surface) 10%, transparent)' } },
          { label: 'Present', style: { backgroundColor: 'color-mix(in srgb, var(--color-tertiary) 70%, transparent)' } },
          { label: 'Late',    style: { backgroundColor: 'color-mix(in srgb, var(--color-secondary) 80%, transparent)' } },
          { label: 'OT',      style: { backgroundColor: 'var(--color-tertiary)' } },
        ].map(({ label, style }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-[3px]" style={style} />
            <span className="text-[10px] text-on-surface-variant font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
