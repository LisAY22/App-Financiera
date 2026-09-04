import Link from "next/link";
import { ArrowRight, Banknote, PiggyBank, Wallet } from "lucide-react";
import { requireUserId } from "@/auth";
import { getAccountsWithBalances, getNetWorth } from "@/lib/queries/balances";
import { getSettings } from "@/lib/queries/lookups";
import { formatMoney } from "@/lib/money";
import { formatRate, parseRate } from "@/lib/interest";
import type { AccountType } from "@/db/schema";
import { PageHeader, StatCard } from "@/components/shell";
import { AccountDialog } from "@/components/accounts/account-dialog";

export const metadata = { title: "Cuentas" };

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

export default async function CuentasPage() {
  const userId = await requireUserId();

  const [accounts, netWorth, settings] = await Promise.all([
    getAccountsWithBalances(userId, { includeArchived: true }),
    getNetWorth(userId),
    getSettings(userId),
  ]);

  const money = (cents: number) => formatMoney(cents, settings);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Tus bancos, el efectivo y el ahorro. El saldo se calcula solo a partir de tus movimientos."
        action={<AccountDialog />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          tone="primary"
          label="Disponible ahora"
          value={money(netWorth.liquid)}
          hint="Banco y efectivo, sin el ahorro"
        />
        <StatCard
          label="En ahorro"
          value={money(netWorth.savings)}
          hint={netWorth.savings === 0 ? "Sin cuentas de ahorro" : "Suma al patrimonio, no al disponible"}
        />
        <StatCard
          label="Lo que debes"
          value={money(netWorth.debt)}
          hint={netWorth.debt === 0 ? "Sin deudas abiertas" : "No sale de ninguna cuenta hasta que pagues"}
        />
        <StatCard
          label="Patrimonio neto"
          value={money(netWorth.net)}
          hint={`${money(netWorth.assets)} en cuentas`}
        />
      </div>

      <ul className="mt-6 space-y-3">
        {active.map((account) => {
          const Icon = ACCOUNT_ICON[account.type];
          const rate = parseRate(account.interestAnnualRate);

          return (
            <li key={account.id}>
              <Link
                href={`/cuentas/${account.id}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{ACCOUNT_LABEL[account.type]}</span>
                    {account.institution && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{account.institution}</span>
                      </>
                    )}
                    {account.interestEnabled && rate !== null && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-[var(--income-ink)]">
                          {formatRate(rate, settings.locale)} anual
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="tabular text-base font-semibold">
                    {money(account.balance)}
                  </p>
                </div>

                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold">Archivadas</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Ya no aparecen al registrar movimientos, pero conservan su historial para
            que el análisis de meses pasados siga cuadrando.
          </p>
          <ul className="space-y-2">
            {archived.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3"
              >
                <span className="truncate text-sm text-muted-foreground">
                  {account.name}
                </span>
                <span className="tabular shrink-0 text-sm text-muted-foreground">
                  {money(account.balance)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
