'use client';

// Split out of the dashboard page so the heavy recharts bundle loads lazily
// (dynamic import, client-only). Weak PCs parse less JS up front; charts pop
// in with a skeleton fallback instead of blocking first paint.

import { JetBrains_Mono } from 'next/font/google';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
});

export type MetricChartProps = {
  title: string;
  subtitle: string;
  valueLabel: string;
  data: Array<{ label: string; value: number | null; fullLabel: string }>;
  color: string;
  suffix: string;
  isPercent?: boolean;
};

export function MetricChart({
  title,
  subtitle,
  valueLabel,
  data,
  color,
  suffix,
  isPercent = false,
}: MetricChartProps) {
  const hasPoints = data.some((point) => typeof point.value === 'number');

  return (
    <article className="dash-metric-chart">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <strong className={mono.className}>{valueLabel}</strong>
      </header>
      <div className="dash-metric-chart-canvas">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid
              stroke="rgba(var(--app-border-rgb), 0.14)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--app-text-secondary)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={22}
            />
            <YAxis
              tick={{ fill: 'var(--app-text-secondary)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={42}
              domain={isPercent ? [0, 100] : ['auto', 'auto']}
            />
            <Tooltip
              formatter={(value) => {
                if (typeof value !== 'number') return ['N/A', title];
                return [`${value.toFixed(2)}${suffix}`, title];
              }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.fullLabel ?? ''
              }
              contentStyle={{
                borderRadius: 2,
                border: '1px solid rgba(var(--app-border-rgb), 0.18)',
                background: 'var(--app-surface-2)',
                color: 'var(--app-text)',
              }}
              labelStyle={{
                color: 'var(--app-text-secondary)',
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {!hasPoints ? (
          <p className="dash-metric-chart-empty">No data for selected range.</p>
        ) : null}
      </div>
    </article>
  );
}
