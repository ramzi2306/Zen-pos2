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
  startDate: string;   // "2024-01-01"
  endDate: string;     // "2024-01-31"
  totalHours: number;
  workedDays: number;
  className?: string;
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getCellStyle(rec: ContributionDayRecord | undefined, inRange: boolean): React.CSSProperties {
  if (!inRange) return {};
  if (!rec || !rec.checkIn) {
    return { backgroundColor: 'color-mix(in srgb, var(--color-on-surface) 8%, transparent)' };
  }
  if (rec.isLate || rec.isEarlyDeparture) {
    // orange — punctuality issue
    return { backgroundColor: 'color-mix(in srgb, var(--color-secondary) 75%, transparent)' };
  }
  if (rec.isOvertime) {
    // bright green — exceeded hours
    return { backgroundColor: 'var(--color-tertiary)' };
  }
  // intensity by hours: base 60% opacity, scales up to 100% at 8h+
  const intensity = Math.min(1, 0.5 + (rec.hours / 8) * 0.5);
  return { backgroundColor: `color-mix(in srgb, var(--color-tertiary) ${Math.round(intensity * 100)}%, transparent)` };
}

function buildTooltip(rec: ContributionDayRecord | undefined, date: string): string {
  const d = new Date(date + 'T00:00:00');
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!rec || !rec.checkIn) return `${label} — Off / No record`;
  const flags = [
    rec.isLate && 'Late',
    rec.isEarlyDeparture && 'Early out',
    rec.isOvertime && 'Overtime',
  ].filter(Boolean).join(' · ');
  const range = rec.checkOut ? `${rec.checkIn} → ${rec.checkOut}` : `In: ${rec.checkIn}`;
  return `${label}\n${rec.hours.toFixed(1)}h  ${range}${flags ? `\n${flags}` : ''}`;
}

export const AttendanceContributionGraph = ({
  records,
  startDate,
  endDate,
  totalHours,
  workedDays,
  className,
}: AttendanceContributionGraphProps) => {
  const recordMap = React.useMemo(() => {
    const map = new Map<string, ContributionDayRecord>();
    records.forEach(r => map.set(r.date, r));
    return map;
  }, [records]);

  // Build a Mon-anchored weekly grid covering [startDate, endDate]
  const weeks = React.useMemo(() => {
    if (!startDate || !endDate) return [];

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    // Rewind cursor to previous Monday
    const gridStart = new Date(start);
    const dow = gridStart.getDay(); // 0=Sun
    gridStart.setDate(gridStart.getDate() - ((dow + 6) % 7));

    const result: Array<Array<{ date: string; rec?: ContributionDayRecord; inRange: boolean }>> = [];
    const cursor = new Date(gridStart);

    while (cursor <= end) {
      const week: typeof result[0] = [];
      for (let d = 0; d < 7; d++) {
        const iso = cursor.toISOString().split('T')[0];
        const inRange = cursor >= start && cursor <= end;
        week.push({ date: iso, rec: inRange ? recordMap.get(iso) : undefined, inRange });
        cursor.setDate(cursor.getDate() + 1);
      }
      result.push(week);
    }
    return result;
  }, [startDate, endDate, recordMap]);

  const lateDays = records.filter(r => r.isLate || r.isEarlyDeparture).length;
  const overtimeDays = records.filter(r => r.isOvertime).length;

  return (
    <div className={cn("flex flex-col gap-3 w-full min-w-0", className)}>
      {/* Header stats */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
            Attendance
          </p>
          <p className="text-2xl font-headline font-extrabold text-on-surface leading-none tracking-tight">
            {totalHours.toFixed(1)} hrs
          </p>
          <p className="text-[10px] text-on-surface-variant mt-1 font-medium">
            {workedDays} day{workedDays !== 1 ? 's' : ''} worked
          </p>
        </div>
        <div className="text-right shrink-0 flex flex-col gap-0.5">
          {lateDays > 0 && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--color-secondary)' }}>
              {lateDays} late
            </span>
          )}
          {overtimeDays > 0 && (
            <span className="text-[10px] font-bold" style={{ color: 'var(--color-tertiary)' }}>
              {overtimeDays} OT
            </span>
          )}
        </div>
      </div>

      {/* Contribution grid */}
      {weeks.length > 0 ? (
        <div className="flex gap-0.5 items-start">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-0.5 mr-1 shrink-0">
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                className="w-3 h-3 flex items-center justify-center text-[8px] font-bold text-on-surface-variant/50 leading-none"
              >
                {i % 2 === 0 ? label : ''}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map(({ date, rec, inRange }, di) => (
                <div
                  key={di}
                  className="w-3 h-3 rounded-[2px] transition-opacity hover:opacity-80 cursor-default"
                  style={getCellStyle(rec, inRange)}
                  title={inRange ? buildTooltip(rec, date) : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="h-14 flex items-center justify-center">
          <span className="text-[10px] text-on-surface-variant">No data</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {[
          { label: 'Absent', style: { backgroundColor: 'color-mix(in srgb, var(--color-on-surface) 8%, transparent)' } },
          { label: 'Present', style: { backgroundColor: 'color-mix(in srgb, var(--color-tertiary) 70%, transparent)' } },
          { label: 'Late', style: { backgroundColor: 'color-mix(in srgb, var(--color-secondary) 75%, transparent)' } },
          { label: 'OT', style: { backgroundColor: 'var(--color-tertiary)' } },
        ].map(({ label, style }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-[1px]" style={style} />
            <span className="text-[9px] text-on-surface-variant font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
