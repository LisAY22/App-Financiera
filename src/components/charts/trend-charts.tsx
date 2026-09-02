"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryTrend, NetWorthPoint } from "@/lib/queries/analytics";
import type { DebtBalancePoint } from "@/lib/queries/debts";
import { formatBucketLabel, type Granularity } from "@/lib/periods";
import { axisProps, gridProps, seriesColor, semanticColors } from "@/lib/chart-theme";
import { useMoneyFormatter } from "@/components/settings-provider";
import {
  AREA_OPACITY,
  BAR_MAX_SIZE,
  BAR_RADIUS,
  ChartEmpty,
  ChartLegend,
  ChartTooltip,
  LINE_WIDTH,
  bucketTitle,
  useAxisFormatter,
} from "./primitives";

/* ==================================================================== *
 * Tendencia por categoría (áreas apiladas)
 * ==================================================================== */

export function CategoryTrendChart({
  trend,
  granularity,
}: {
  trend: CategoryTrend;
  granularity: Granularity;
}) {
  const format = useMoneyFormatter();
  const axisFormat = useAxisFormatter();

  if (trend.series.length === 0) {
    return <ChartEmpty message="Todavía no hay gastos que comparar en este periodo." />;
  }

  const data = trend.buckets.map((bucket, i) => {
    const row: Record<string, string | number> = { bucket };
    for (const serie of trend.series) row[serie.name] = serie.values[i];
    return row;
  });

  const legend = trend.series.map((serie, index) => ({
    label: serie.name,
    color: seriesColor(index),
  }));

  return (
    <>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="bucket"
              {...axisProps}
              tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
              minTickGap={16}
            />
            <YAxis {...axisProps} tickFormatter={axisFormat} width={64} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rows = [...payload]
                  .filter((entry) => Number(entry.value) > 0)
                  .reverse()
                  .map((entry) => ({
                    label: String(entry.name),
                    value: format(Number(entry.value)),
                    color: String(entry.color),
                  }));
                if (rows.length === 0) return null;
                return (
                  <ChartTooltip
                    title={bucketTitle(String(label), granularity)}
                    rows={rows}
                  />
                );
              }}
            />
            {trend.series.map((serie, index) => (
              <Area
                key={serie.categoryId}
                type="monotone"
                dataKey={serie.name}
                stackId="gasto"
                stroke={seriesColor(index)}
                strokeWidth={LINE_WIDTH}
                fill={seriesColor(index)}
                fillOpacity={AREA_OPACITY}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={legend} />
    </>
  );
}

/* ==================================================================== *
 * Evolución del patrimonio
 * ==================================================================== */

export function NetWorthChart({
  data,
  granularity,
}: {
  data: NetWorthPoint[];
  granularity: Granularity;
}) {
  const format = useMoneyFormatter();
  const axisFormat = useAxisFormatter();
  const hasDebt = data.some((p) => p.debt > 0);

  if (data.length === 0) return <ChartEmpty message="Sin datos todavía." />;

  return (
    <>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="bucket"
              {...axisProps}
              tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
              minTickGap={16}
            />
            <YAxis {...axisProps} tickFormatter={axisFormat} width={64} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as NetWorthPoint;
                return (
                  <ChartTooltip
                    title={bucketTitle(String(label), granularity)}
                    rows={[
                      { label: "Activos", value: format(point.assets), color: "var(--chart-1)" },
                      ...(hasDebt
                        ? [
                            {
                              label: "Deudas",
                              value: format(point.debt),
                              color: semanticColors.debt,
                            },
                          ]
                        : []),
                      { label: "Patrimonio neto", value: format(point.net), emphasis: true },
                    ]}
                  />
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Patrimonio neto"
              stroke="var(--chart-1)"
              strokeWidth={LINE_WIDTH}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
            {hasDebt && (
              <Line
                type="monotone"
                dataKey="debt"
                name="Deuda viva"
                stroke={semanticColors.debt}
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={
          hasDebt
            ? [
                { label: "Patrimonio neto", color: "var(--chart-1)" },
                { label: "Deuda viva", color: semanticColors.debt },
              ]
            : []
        }
      />
    </>
  );
}

/* ==================================================================== *
 * Deuda: evolución del total adeudado y pagos por periodo
 * ==================================================================== */

export function DebtOutstandingChart({
  data,
  granularity,
}: {
  data: DebtBalancePoint[];
  granularity: Granularity;
}) {
  const format = useMoneyFormatter();
  const axisFormat = useAxisFormatter();

  if (data.every((p) => p.outstanding === 0)) {
    return <ChartEmpty message="No tienes deudas registradas en este periodo." />;
  }

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="bucket"
            {...axisProps}
            tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
            minTickGap={16}
          />
          <YAxis {...axisProps} tickFormatter={axisFormat} width={64} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as DebtBalancePoint;
              return (
                <ChartTooltip
                  title={bucketTitle(String(label), granularity)}
                  rows={[
                    {
                      label: "Te falta pagar",
                      value: format(point.outstanding),
                      color: semanticColors.debt,
                      emphasis: true,
                    },
                    { label: "Pagado en el periodo", value: format(point.paid) },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="outstanding"
            name="Total adeudado"
            stroke={semanticColors.debt}
            strokeWidth={LINE_WIDTH}
            fill={semanticColors.debt}
            fillOpacity={AREA_OPACITY}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DebtPaymentsChart({
  data,
  granularity,
}: {
  data: DebtBalancePoint[];
  granularity: Granularity;
}) {
  const format = useMoneyFormatter();
  const axisFormat = useAxisFormatter();

  if (data.every((p) => p.paid === 0)) {
    return <ChartEmpty message="Todavía no has registrado pagos en este periodo." />;
  }

  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
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
              const point = payload[0].payload as DebtBalancePoint;
              return (
                <ChartTooltip
                  title={bucketTitle(String(label), granularity)}
                  rows={[
                    {
                      label: "Pagado",
                      value: format(point.paid),
                      color: semanticColors.debt,
                      emphasis: true,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="paid"
            name="Pagado"
            fill={semanticColors.debt}
            maxBarSize={BAR_MAX_SIZE}
            radius={BAR_RADIUS}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
