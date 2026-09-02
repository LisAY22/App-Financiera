"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FlowPoint } from "@/lib/queries/analytics";
import { formatBucketLabel, type Granularity } from "@/lib/periods";
import { axisProps, gridProps, semanticColors } from "@/lib/chart-theme";
import { useMoneyFormatter } from "@/components/settings-provider";
import {
  BAR_MAX_SIZE,
  BAR_RADIUS,
  ChartEmpty,
  ChartLegend,
  ChartTooltip,
  LINE_WIDTH,
  bucketTitle,
  useAxisFormatter,
} from "./primitives";

/**
 * Ingresos vs egresos por periodo, con el balance neto como línea.
 *
 * Un solo eje para las tres cosas: son la misma magnitud (dinero), así que
 * comparten escala y la comparación es honesta. Dos ejes con escalas distintas
 * dejarían "poner" cualquier conclusión moviendo los rangos.
 */
export function IncomeExpenseChart({
  data,
  granularity,
}: {
  data: FlowPoint[];
  granularity: Granularity;
}) {
  const format = useMoneyFormatter();
  const axisFormat = useAxisFormatter();

  if (data.every((p) => p.income === 0 && p.expense === 0)) {
    return <ChartEmpty message="Todavía no hay movimientos en este periodo." />;
  }

  return (
    <>
      <div className="h-64 w-full md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="bucket"
              {...axisProps}
              tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
              minTickGap={16}
            />
            <YAxis {...axisProps} tickFormatter={axisFormat} width={64} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as FlowPoint;
                return (
                  <ChartTooltip
                    title={bucketTitle(String(label), granularity)}
                    rows={[
                      {
                        label: "Ingresos",
                        value: format(point.income),
                        color: semanticColors.income,
                      },
                      {
                        label: "Egresos",
                        value: format(point.expense),
                        color: semanticColors.expense,
                      },
                      {
                        label: "Balance",
                        value: format(point.net, { signed: true }),
                        emphasis: true,
                      },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="income"
              name="Ingresos"
              fill={semanticColors.income}
              maxBarSize={BAR_MAX_SIZE}
              radius={BAR_RADIUS}
            />
            <Bar
              dataKey="expense"
              name="Egresos"
              fill={semanticColors.expense}
              maxBarSize={BAR_MAX_SIZE}
              radius={BAR_RADIUS}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Balance"
              stroke="var(--chart-1)"
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend
        items={[
          { label: "Ingresos", color: semanticColors.income },
          { label: "Egresos", color: semanticColors.expense },
          { label: "Balance neto", color: "var(--chart-1)" },
        ]}
      />
    </>
  );
}

/** Variante compacta de una sola serie para el resumen; sin leyenda. */
export function MiniBarChart({
  data,
  granularity,
  dataKey,
  color,
}: {
  data: FlowPoint[];
  granularity: Granularity;
  dataKey: "income" | "expense";
  color: string;
}) {
  const format = useMoneyFormatter();

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as FlowPoint;
              return (
                <ChartTooltip
                  title={bucketTitle(String(label), granularity)}
                  rows={[{ label: "Total", value: format(point[dataKey]), color }]}
                />
              );
            }}
          />
          <Bar dataKey={dataKey} fill={color} maxBarSize={BAR_MAX_SIZE} radius={BAR_RADIUS} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
