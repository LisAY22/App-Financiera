import { requireUserId } from "@/auth";
import {
  getDebtByCreditor,
  getDebtPaidInRange,
  getDebts,
  getDebtSeries,
  getPayoffProjection,
} from "@/lib/queries/debts";
import {
  getPendingReceivables,
  getSettledReceivables,
  groupByPerson,
} from "@/lib/queries/receivables";
import { getAccountsWithBalances } from "@/lib/queries/balances";
import { getPeople, getSettings } from "@/lib/queries/lookups";
import {
  defaultGranularity,
  isGranularity,
  rangeFromParams,
  type Granularity,
} from "@/lib/periods";
import { PageHeader } from "@/components/shell";
import { DebtsTabs } from "@/components/debts/debts-tabs";

export const metadata = { title: "Deudas" };

export default async function DeudasPage(props: PageProps<"/deudas">) {
  const userId = await requireUserId();
  const params = await props.searchParams;

  const { selection, range } = rangeFromParams(params, "last-12-months");
  const granularity: Granularity = isGranularity(params.agrupar)
    ? params.agrupar
    : defaultGranularity(range);

  const tab = params.tab === "debo" ? "debo" : "me-deben";

  const [
    pending,
    settled,
    debts,
    debtSeries,
    byCreditor,
    projection,
    paidInRange,
    accounts,
    people,
    settings,
  ] = await Promise.all([
    getPendingReceivables(userId),
    getSettledReceivables(userId),
    getDebts(userId),
    getDebtSeries(userId, range, granularity),
    getDebtByCreditor(userId),
    getPayoffProjection(userId),
    getDebtPaidInRange(userId, range),
    getAccountsWithBalances(userId),
    getPeople(userId),
    getSettings(userId),
  ]);

  return (
    <>
      <PageHeader
        title="Deudas"
        description="Lo que te deben por cuotas de gastos compartidos, y lo que tú debes."
      />

      <DebtsTabs
        activeTab={tab}
        selection={selection}
        range={range}
        granularity={granularity}
        receivableGroups={groupByPerson(pending)}
        settledReceivables={settled.slice(0, 20)}
        debts={debts}
        debtSeries={debtSeries}
        byCreditor={byCreditor}
        projection={projection}
        paidInRange={paidInRange}
        accounts={accounts}
        people={people}
        settings={settings}
      />
    </>
  );
}
