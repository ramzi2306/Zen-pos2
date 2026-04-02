import * as React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityDataPoint {
  day: string;
  value: number;
}

interface ActivityChartCardProps {
  title?: string;
  totalValue: string;
  data: ActivityDataPoint[];
  className?: string;
  dropdownOptions?: string[];
  trend?: {
    value: number;
    label: string;
  };
}

/**
 * Compact attendance bar chart — always stacks vertically.
 * Handles 1–31 bars gracefully: skips labels when crowded,
 * uses pixel-thin bars so the chart never overflows its column.
 */
export const ActivityChartCard = ({
  title,
  totalValue,
  data,
  className,
  trend,
}: ActivityChartCardProps) => {
  const maxValue = React.useMemo(
    () => data.reduce((m, d) => (d.value > m ? d.value : m), 0),
    [data]
  );

  // Show a day label every N bars to avoid crowding
  const labelEvery = data.length <= 7 ? 1 : data.length <= 14 ? 2 : data.length <= 21 ? 3 : 7;

  const isPositive = !trend || trend.value >= 0;

  return (
    <div className={cn("flex flex-col gap-3 w-full", className)}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col min-w-0">
          {title && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
              {title}
            </p>
          )}
          <p className="text-2xl font-headline font-extrabold text-on-surface leading-none tracking-tight truncate">
            {totalValue}
          </p>
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              {isPositive
                ? <TrendingUp className="h-3 w-3 text-tertiary shrink-0" />
                : <TrendingDown className="h-3 w-3 text-error shrink-0" />
              }
              <span className={cn(
                "text-[10px] font-semibold leading-none",
                isPositive ? "text-tertiary" : "text-error"
              )}>
                {trend.value > 0 ? "+" : ""}{trend.value}%
              </span>
              <span className="text-[10px] text-on-surface-variant leading-none truncate">
                {trend.label}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bar chart */}
      {data.length > 0 ? (
        <div className="flex flex-col gap-1 w-full">
          {/* Bars */}
          <motion.div
            key={data.length}
            className="flex items-end w-full gap-px"
            style={{ height: 56 }}
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
          >
            {data.map((item, i) => {
              const heightPct = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
              const hasValue = item.value > 0;
              return (
                <motion.div
                  key={i}
                  className="flex-1 min-w-0 rounded-sm"
                  style={{
                    height: `${Math.max(heightPct, hasValue ? 6 : 2)}%`,
                    backgroundColor: hasValue
                      ? item.value === maxValue
                        ? "var(--color-primary)"
                        : "color-mix(in srgb, var(--color-primary) 50%, transparent)"
                      : "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                  }}
                  variants={{
                    hidden: { scaleY: 0, originY: 1 },
                    visible: {
                      scaleY: 1,
                      originY: 1,
                      transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
                    },
                  }}
                  title={`Day ${item.day}: ${item.value}h`}
                />
              );
            })}
          </motion.div>

          {/* Day labels — shown only every N bars */}
          <div className="flex items-center w-full gap-px">
            {data.map((item, i) => (
              <div key={i} className="flex-1 min-w-0 flex justify-center">
                {i % labelEvery === 0 ? (
                  <span className="text-[8px] text-on-surface-variant leading-none truncate">
                    {item.day}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-14 flex items-center justify-center">
          <span className="text-[10px] text-on-surface-variant">No data</span>
        </div>
      )}
    </div>
  );
};
