"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { CategorySlice } from "@/lib/queries/analytics";
import { seriesColor } from "@/lib/chart-theme";
import { useMoneyFormatter } from "@/components/settings-provider";
import { ChartEmpty, ChartTooltip } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Dona + ranking, siempre juntos.
 *
 * No es decoración: la validación de la paleta marcó tres slots por debajo de
 * 3:1 de contraste en modo claro, y la regla de alivio exige que los valores
 * sean legibles por otra vía. El ranking con los montos en texto ES esa vía, y
 * además responde mejor la pregunta real ("¿en qué gasto más?") que la dona.
 */
export function CategoryBreakdown({
  slices,
  emptyMessage = "Todavía no hay gastos en este periodo.",
  maxItems,
}: {
  slices: CategorySlice[];
  emptyMessage?: string;
  /** Cuántas categorías lista el ranking. Ver `CategoryRanking`. */
  maxItems?: number;
}) {
  const format = useMoneyFormatter();
  const visible = slices.filter((s) => s.total > 0);

  if (visible.length === 0) return <ChartEmpty message={emptyMessage} />;

  // El total es el del periodo completo, no el de las categorías listadas: es
  // el gasto del mes, y recortarlo al top N diría un número que no existe.
  const total = visible.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,180px)_1fr] md:items-center md:gap-5">
      <div className="relative mx-auto size-32 sm:size-40 md:size-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="total"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {visible.map((slice, index) => (
                <Cell key={slice.categoryId} fill={seriesColor(index)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const slice = payload[0].payload as CategorySlice;
                const index = visible.findIndex((s) => s.categoryId === slice.categoryId);
                return (
                  <ChartTooltip
                    title={slice.name}
                    rows={[
                      {
                        label: "Gasto neto",
                        value: format(slice.total),
                        color: seriesColor(index),
                        emphasis: true,
                      },
                      { label: "Del total", value: `${slice.share.toFixed(1)} %` },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[11px] text-muted-foreground">Total</p>
            <p className="tabular text-sm font-semibold">
              {format(total, { compact: true, hideZeroCents: true })}
            </p>
          </div>
        </div>
      </div>

      <CategoryRanking slices={visible} maxItems={maxItems} />
    </div>
  );
}

/** El ranking con montos, porcentaje y variación contra el periodo anterior. */
export function CategoryRanking({
  slices,
  maxItems = 8,
}: {
  slices: CategorySlice[];
  maxItems?: number;
}) {
  const format = useMoneyFormatter();
  const max = Math.max(...slices.map((s) => s.total), 1);

  return (
    <ol className="min-w-0 space-y-2.5">
      {slices.slice(0, maxItems).map((slice, index) => {
        const delta = slice.previous === 0 ? null : slice.total - slice.previous;
        const deltaPct =
          slice.previous === 0 ? null : ((slice.total - slice.previous) / slice.previous) * 100;

        return (
          <li key={slice.categoryId}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: seriesColor(index) }}
                />
                <span className="truncate">{slice.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="tabular text-sm font-medium">{format(slice.total)}</span>
                <span className="tabular w-10 text-right text-xs text-muted-foreground">
                  {slice.share.toFixed(0)} %
                </span>
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(slice.total / max) * 100}%`,
                    background: seriesColor(index),
                  }}
                />
              </div>
              {delta !== null && deltaPct !== null && Math.abs(deltaPct) >= 1 && (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 text-[11px]",
                    delta > 0 ? "text-[var(--expense-ink)]" : "text-[var(--income-ink)]",
                  )}
                  title={`Periodo anterior: ${format(slice.previous)}`}
                >
                  {delta > 0 ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {Math.abs(deltaPct).toFixed(0)} %
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
