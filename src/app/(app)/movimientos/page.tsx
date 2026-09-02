import { requireUserId } from "@/auth";
import {
  countTransactions,
  getTransactions,
  type TransactionFilters,
} from "@/lib/queries/transactions";
import { getCategories } from "@/lib/queries/lookups";
import { getAccountsWithBalances } from "@/lib/queries/balances";
import { isRangePreset, resolveRange, type RangePreset } from "@/lib/periods";
import type { TransactionType } from "@/db/schema";
import { PageHeader, Panel } from "@/components/shell";
import { TransactionList } from "@/components/transactions/transaction-list";
import { TransactionFiltersBar } from "@/components/transactions/filters-bar";
import { Pagination } from "@/components/pagination";

export const metadata = { title: "Movimientos" };

const PAGE_SIZE = 40;

const TYPES: TransactionType[] = [
  "income",
  "expense",
  "transfer",
  "debt_payment",
  "debt_disbursement",
];

export default async function MovimientosPage(props: PageProps<"/movimientos">) {
  const userId = await requireUserId();
  const params = await props.searchParams;

  const rangePreset: RangePreset = isRangePreset(params.rango)
    ? params.rango
    : "last-3-months";
  const range = resolveRange(rangePreset);

  const typeParam = typeof params.tipo === "string" ? params.tipo : undefined;
  const categoryParam = typeof params.categoria === "string" ? params.categoria : undefined;
  const accountParam = typeof params.cuenta === "string" ? params.cuenta : undefined;
  const search = typeof params.q === "string" ? params.q : undefined;
  const page = Math.max(1, Number(params.pagina) || 1);

  const filters: TransactionFilters = {
    from: range.from,
    to: range.to,
    types:
      typeParam && TYPES.includes(typeParam as TransactionType)
        ? [typeParam as TransactionType]
        : undefined,
    categoryIds: categoryParam ? [categoryParam] : undefined,
    accountIds: accountParam ? [accountParam] : undefined,
    search,
  };

  const [items, total, categories, accounts] = await Promise.all([
    getTransactions(userId, filters, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    countTransactions(userId, filters),
    getCategories(userId),
    getAccountsWithBalances(userId, { includeArchived: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Movimientos"
        description={`${total} movimiento${total === 1 ? "" : "s"} en el periodo`}
      />

      <TransactionFiltersBar
        categories={categories}
        accounts={accounts}
        range={rangePreset}
        type={typeParam}
        categoryId={categoryParam}
        accountId={accountParam}
        search={search}
      />

      <Panel className="mt-4">
        <TransactionList items={items} />
      </Panel>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}
