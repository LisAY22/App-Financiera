import Link from "next/link";
import { ArrowRight, Banknote, HandCoins, PiggyBank, Wallet } from "lucide-react";
import { requireUserId } from "@/auth";
import { getAccountsWithBalances, getNetWorth } from "@/lib/queries/balances";
import { getCategoryBreakdown, getKpis } from "@/lib/queries/analytics";
import { getPendingReceivablesTotal } from "@/lib/queries/receivables";
import { getDebts } from "@/lib/queries/debts";
import { getTransactions } from "@/lib/queries/transactions";
import { getSettings } from "@/lib/queries/lookups";
import { previousRange, resolveRange } from "@/lib/periods";
import { formatMoney } from "@/lib/money";
import type { AccountType } from "@/db/schema";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/shell";
import { Amount } from "@/components/amount";
import { CategoryBreakdown } from "@/components/charts/category-chart";
import { TransactionList } from "@/components/transactions/transaction-list";
import { Button } from "@/components/ui/button";

const ACCOUNT_ICON: Record<AccountType, typeof Wallet> = {
  bank: Banknote,
  cash: Wallet,
  savings: PiggyBank,
};

const ACCOUNT_LABEL: Record<AccountType, string> = {
  bank: "Banco",
  cash: "Efectivo",
  savings: "Ahorro",
};

export default async function DashboardPage() {
  const userId = await requireUserId();
  const range = resolveRange("this-month");

  const [accounts, netWorth, kpis, categories, receivable, debts, recent, settings] =
    await Promise.all([
      getAccountsWithBalances(userId),
      getNetWorth(userId),
      getKpis(userId, range, "month"),
      getCategoryBreakdown(userId, range, previousRange(range), "expense"),
      getPendingReceivablesTotal(userId),
      getDebts(userId),
      getTransactions(userId, {}, { limit: 6 }),
      getSettings(userId),
    ]);

  const money = (cents: number) => formatMoney(cents, settings);
  const owed = debts.filter((d) => !d.settled).reduce((sum, d) => sum + d.remaining, 0);

  // Lo que queda fuera del disponible, dicho con su monto. Nombrarlo evita la
  // duda de «¿y dónde está el resto?» al comparar con el patrimonio neto.
  const outOfReach = [
    netWorth.savings > 0 ? `${money(netWorth.savings)} de ahorro` : null,
    owed > 0 ? `${money(owed)} que debes` : null,
  ].filter((part): part is string => part !== null);

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader
          title="Bienvenida"
          description="Primero registra tus cuentas: los dos bancos, el efectivo y el ahorro."
        />
        <EmptyState
          icon={<Wallet className="size-8" />}
          title="Aún no tienes cuentas"
          description="Cada movimiento sale o entra de una cuenta, así que este es el primer paso. Puedes poner el saldo que tienen hoy y empezar desde ahí."
          action={
            <Button nativeButton={false} render={<Link href="/cuentas" />}>
              Crear mi primera cuenta
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Resumen" description="Cómo estás este mes." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {/* La liquidez va primero y es la tarjeta destacada: el patrimonio neto
            cuenta ahorro que no puedes tocar, así que responde «cuánto valgo»,
            no «cuánto puedo gastar hoy», que es la pregunta del día a día. */}
        <StatCard
          tone="primary"
          label="Disponible ahora"
          value={money(netWorth.liquid)}
          hint={
            outOfReach.length > 0
              ? `No incluye ${outOfReach.join(" ni ")}`
              : "Banco y efectivo"
          }
        />
        <StatCard
          label="Patrimonio neto"
          value={money(netWorth.net)}
          hint={
            owed > 0
              ? `${money(netWorth.assets)} en cuentas − ${money(owed)} que debes`
              : `${money(netWorth.assets)} repartidos en tus cuentas`
          }
        />
        <StatCard
          label="Ingresos del mes"
          value={<Amount cents={kpis.totalIncome} />}
          hint={kpis.totalIncome === 0 ? "Sin ingresos registrados" : undefined}
        />
        <StatCard
          label="Gastos del mes"
          value={<Amount cents={kpis.totalExpense} />}
          hint="Neto de lo que otras personas te reembolsan"
        />
        <StatCard
          className="max-lg:col-span-2"
          label="Balance del mes"
          value={<Amount cents={kpis.net} signed />}
          hint={
            kpis.totalIncome > 0
              ? `Tasa de ahorro ${kpis.savingsRate.toFixed(0)} %`
              : undefined
          }
        />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tus cuentas</h2>
          <Link
            href="/cuentas"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Administrar <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {accounts.map((account) => {
            const Icon = ACCOUNT_ICON[account.type];
            return (
              <Link
                key={account.id}
                href={`/cuentas/${account.id}`}
                className="min-w-0 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/40 sm:p-4"
              >
                {/* Envuelve en vez de recortar: a dos columnas en el teléfono
                    el tipo y la insignia no caben en la misma línea, y la
                    insignia recortada («Con inter…») no dice nada. */}
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{ACCOUNT_LABEL[account.type]}</span>
                  </span>
                  {account.interestEnabled && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                      Con intereses
                    </span>
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium">{account.name}</p>
                <p className="tabular mt-0.5 text-lg font-semibold">
                  <Amount cents={account.balance} signed={account.balance < 0} />
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {(receivable > 0 || owed > 0) && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {receivable > 0 && (
            <Link
              href="/deudas"
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="text-xs text-muted-foreground">Te deben</p>
                <p className="tabular mt-0.5 text-lg font-semibold">{money(receivable)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cuotas que aún no te pagan
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )}
          {owed > 0 && (
            <Link
              href="/deudas?tab=debo"
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <HandCoins className="size-3.5 text-[var(--debt-ink)]" />
                  Tú debes
                </p>
                <p className="tabular mt-0.5 text-lg font-semibold">{money(owed)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {debts.filter((d) => !d.settled).length} deuda(s) abierta(s)
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel
          title="En qué gastaste este mes"
          description="Montos netos, sin transferencias"
          action={
            <Link
              href="/analisis"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver análisis <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {/* Cinco y no ocho: en el teléfono la tarjeta pasaba de la pantalla
              entera. El desglose completo vive en Análisis, que es a donde
              lleva el enlace de arriba. */}
          <CategoryBreakdown slices={categories} maxItems={5} />
        </Panel>

        <Panel
          title="Últimos movimientos"
          action={
            <Link
              href="/movimientos"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <TransactionList items={recent} compact />
        </Panel>
      </div>
    </>
  );
}
