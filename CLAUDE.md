# ZEN-POS Project Rules

## Stack
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first via `src/index.css @theme`)
- **Backend**: FastAPI + Beanie ODM + MongoDB
- **Deploy**: git push → Dokploy → Docker multi-stage build → production (never copy dist files manually)

## Charts — ALWAYS use shadcn/ui chart
**Rule: ALL charts and graphs must use `@/components/ui/chart` (shadcn/ui chart, wraps Recharts).**

- Import: `import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'`
- Define a `ChartConfig` with labeled keys and `color: 'var(--chart-N)'` (N = 1–5)
- Use `<ChartContainer config={...}>` instead of `<ResponsiveContainer>`
- Use `<ChartTooltip content={<ChartTooltipContent />}>` instead of raw `<Tooltip>`
- Recharts primitives (`Bar`, `Line`, `PieChart`, `XAxis`, etc.) are still used inside the container
- Color palette (defined in `src/index.css`):
  - `--chart-1` → green (income/positive)
  - `--chart-2` → red (expenses/negative)
  - `--chart-3` → blue (profit/neutral)
  - `--chart-4` → orange (accent)
  - `--chart-5` → purple (secondary accent)

Never use raw `<ResponsiveContainer>` or bare `<Tooltip>` from recharts.

## Design tokens
Custom Material Design tokens in `src/index.css @theme` — use `text-on-surface`, `bg-surface-container`, `text-primary`, etc. Do NOT use shadcn's default `bg-background`/`text-foreground` in UI components; use the Material tokens instead.

## Path alias
`@` → `src/` (configured in `vite.config.ts` and `tsconfig.json`)

## Payroll / Finance
- `DELETE /payroll/withdrawals/{id}` — delete a salary withdrawal record
- `GET /analytics/finance?start_date=&end_date=` — P&L report
- `SalaryItem` includes `id: str` for frontend delete targeting
