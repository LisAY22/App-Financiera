import { requireUserId } from "@/auth";
import {
  getCategoryBreakdown,
  getCategoryTrend,
  getExpenseByAccount,
  getIncomeExpenseSeries,
  getKpis,
  getNetWorthSeries,
} from "@/lib/queries/analytics";
import { getSettings } from "@/lib/queries/lookups";
import {
  defaultGranularity,
  formatBucketFull,
  isGranularity,
  isRangePreset,
  previousRange,
  RANGE_LABELS,
  resolveRange,
  type Granularity,
  type RangePreset,
} from "@/lib/periods";
import { formatMoney } from "@/lib/money";
import { PageHeader, Panel, StatCard } from "@/components/shell";
import { PeriodControls } from "@/components/period-controls";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { CategoryBreakdown } from "@/components/charts/category-chart";
import { CategoryTrendChart, NetWorthChart } from "@/components/charts/trend-charts";

export const metadata = { title: "Análisis" };

export default async function AnalisisPage(props: PageProps<"/analisis">) {
  const userId = await requireUserId();
  const params = await props.searchParams;

  const rangePreset: RangePreset = isRangePreset(params.rango)
    ? params.rango
    : "last-6-months";
  const range = resolveRange(rangePreset);

  const granularity: Granularity = isGranularity(params.agrupar)
    ? params.agrupar
    : defaultGranularity(range);

  const [series, categories, trend, netWorth, byAccount, kpis, settings] =
    await Promise.all([
      getIncomeExpenseSeries(userId, range, granularity),
      getCategoryBreakdown(userId, range, previousRange(range), "expense"),
      getCategoryTrend(userId, range, granularity),
      getNetWorthSeries(userId, range, granularity),
      getExpenseByAccount(userId, range),
      getKpis(userId, range, granularity),
      getSettings(userId),
    ]);

  const money = (cents: number) => formatMoney(cents, settings);
  const periodWord =
    granularity === "week" ? "semana" : granularity === "month" ? "mes" : "año";

  return (
    <>
      <PageHeader
        title="Análisis"
        description="Montos netos, sin transferencias ni dinero que solo cambió de bolsillo."
      />

      <PeriodControls range={rangePreset} granularity={granularity} className="mb-5" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Gasto promedio por ${periodWord}`}
          value={money(kpis.avgExpensePerBucket)}
          hint={`Total ${money(kpis.totalExpense)}`}
        />
        <StatCard
          label={`Ingreso promedio por ${periodWord}`}
          value={money(kpis.avgIncomePerBucket)}
          hint={`Total ${money(kpis.totalIncome)}`}
        />
        <StatCard
          label="Tasa de ahorro"
          value={`${kpis.savingsRate.toFixed(0)} %`}
          hint={
            kpis.totalIncome === 0
              ? "Sin ingresos en el periodo"
              : `Te quedaron ${money(kpis.net)}`
          }
        />
        <StatCard
          label="Donde más gastas"
          value={kpis.topCategory?.name ?? "—"}
          hint={kpis.topCategory ? money(kpis.topCategory.total) : "Sin gastos aún"}
        />
      </div>

      <div className="mt-4 space-y-4">
        <Panel
          title="Ingresos vs egresos"
          description={`Agrupado por ${periodWord} · ${RANGE_LABELS[rangePreset]}`}
        >
          <IncomeExpenseChart data={series} granularity={granularity} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="En qué gastas"
            description="Con la variación contra el periodo anterior"
          >
            <CategoryBreakdown slices={categories} />
          </Panel>

          <Panel
            title="Cómo evoluciona cada categoría"
            description="Las categorías más allá de las seis principales se agrupan en «Otras»"
          >
            <CategoryTrendChart trend={trend} granularity={granularity} />
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Evolución del patrimonio"
            description="Saldo acumulado de tus cuentas, menos lo que debes"
          >
            <NetWorthChart data={netWorth} granularity={granularity} />
          </Panel>

          <Panel title="De qué cuentas sale el gasto">
            {byAccount.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin gastos en este periodo.
              </p>
            ) : (
              <ul className="space-y-3">
                {byAccount.map((slice) => (
                  <li key={slice.accountId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm">{slice.name}</span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="tabular text-sm font-medium">
                          {money(slice.total)}
                        </span>
                        <span className="tabular w-10 text-right text-xs text-muted-foreground">
                          {slice.share.toFixed(0)} %
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[var(--chart-1)]"
                        style={{ width: `${slice.share}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {kpis.peakBucket && (
          <p className="text-center text-xs text-muted-foreground">
            Tu {periodWord} más caro fue{" "}
            <span className="font-medium text-foreground">
              {formatBucketFull(kpis.peakBucket.bucket, granularity)}
            </span>{" "}
            con {money(kpis.peakBucket.expense)}.
          </p>
        )}
      </div>
    </>
  );
}
