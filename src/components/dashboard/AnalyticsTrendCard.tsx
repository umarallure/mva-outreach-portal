"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";

export type OperationalTrendPoint = {
  day: string;
  ready: number;
  targets: number;
  profiles: number;
};

type AnalyticsTrendCardProps = {
  data: OperationalTrendPoint[];
  title: string;
  subtitle: string;
  animationDelay?: number;
};

type ChartTooltipPayload = {
  color?: string;
  dataKey?: string | number;
  value?: number | string;
};

type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipPayload[];
};

function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const seriesMeta: Record<string, { label: string; color: string }> = {
    ready: { label: "Ready Accounts", color: "#AE4010" },
    targets: { label: "Target Links", color: "#4A90D9" },
    profiles: { label: "GoLogin Profiles", color: "#3A9D5C" },
  };

  return (
    <div className="rounded-lg border border-[var(--dash-border)] bg-[#1A1A1A] px-3 py-2.5 shadow-lg backdrop-blur-md">
      <p className="mb-1.5 text-[11px] font-medium text-[var(--dash-text-muted)]">{label}</p>
      {payload.map((entry) => {
        const dataKey = String(entry.dataKey ?? "");
        const meta = seriesMeta[dataKey];
        return (
          <div className="flex items-center gap-2 py-0.5" key={dataKey}>
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: meta?.color ?? entry.color }}
            />
            <span className="text-[11px] text-[var(--dash-text-muted)]">
              {meta?.label ?? entry.dataKey}
            </span>
            <span className="ml-auto pl-3 text-[12px] font-semibold text-[var(--dash-text)]">
              {entry.value?.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function AnalyticsTrendCard({
  data,
  title,
  subtitle,
  animationDelay = 0,
}: AnalyticsTrendCardProps) {
  const currentReady = data.at(-1)?.ready ?? 0;

  return (
    <div
      className="dash-animate-in flex flex-col overflow-hidden rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] backdrop-blur-[var(--dash-blur)]"
      style={{ boxShadow: "var(--dash-shadow)", animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex flex-col gap-3 border-b border-[var(--dash-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#AE4010]/10">
            <BarChart3 className="h-4 w-4 text-[#AE4010]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
            <p className="text-[11px] text-[var(--dash-text-muted)]">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-full bg-[#3A9D5C]/12 px-2.5 py-1 text-[11px] font-semibold text-[#3A9D5C]">
          <TrendingUp className="h-3 w-3" />
          <span>{currentReady}</span>
          <span className="font-normal text-[var(--dash-text-muted)]">ready</span>
        </div>
      </div>

      <div className="px-4 py-4" style={{ minHeight: 220 }}>
        <ResponsiveContainer height={220} width="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="gradReady" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#AE4010" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#AE4010" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradEmbeds" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#4A90D9" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#4A90D9" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradLaunches" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3A9D5C" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#3A9D5C" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="day"
              tick={{ fill: "#8a8580", fontSize: 10 }}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tick={{ fill: "#8a8580", fontSize: 10 }}
              tickLine={false}
              tickMargin={4}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              activeDot={{ r: 4, fill: "#AE4010", stroke: "#202020", strokeWidth: 2 }}
              dataKey="ready"
              dot={false}
              fill="url(#gradReady)"
              stroke="#AE4010"
              strokeWidth={2}
              type="monotone"
            />
            <Area
              activeDot={{ r: 3, fill: "#4A90D9", stroke: "#202020", strokeWidth: 2 }}
              dataKey="targets"
              dot={false}
              fill="url(#gradEmbeds)"
              stroke="#4A90D9"
              strokeWidth={1.5}
              type="monotone"
            />
            <Area
              activeDot={{ r: 3, fill: "#3A9D5C", stroke: "#202020", strokeWidth: 2 }}
              dataKey="profiles"
              dot={false}
              fill="url(#gradLaunches)"
              stroke="#3A9D5C"
              strokeWidth={1.5}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
