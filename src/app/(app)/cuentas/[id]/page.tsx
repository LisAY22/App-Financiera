import { notFound } from "next/navigation";
import { requireUserId } from "@/auth";
import { getAccountWithBalance } from "@/lib/queries/balances";
import { getTransactions } from "@/lib/queries/transactions";
import { getSettings } from "@/lib/queries/lookups";
import { formatMoney } from "@/lib/money";
import { accruedInterest, formatRate, parseRate, projectionSeries } from "@/lib/interest";
import { todayIso } from "@/lib/periods";
import { PageHeader, Panel, StatCard } from "@/components/shell";
import { TransactionList } from "@/components/transactions/transaction-list";
import { AccountDialog } from "@/components/accounts/account-dialog";
import { AccountActions } from "@/components/accounts/account-actions";
import { InterestPanel } from "@/components/accounts/interest-panel";

export default async function CuentaPage(props: PageProps<"/cuentas/[id]">) {
  const userId = await requireUserId();
  const { id } = await props.params;

  const account = await getAccountWithBalance(userId, id);
  if (!account) notFound();

  const [movements, settings] = await Promise.all([
    getTransactions(userId, { accountIds: [id] }, { limit: 25 }),
    getSettings(userId),
  ]);

  const money = (cents: number) => formatMoney(cents, settings);
  const rate = parseRate(account.interestAnnualRate);
  const hasInterest =
    account.interestEnabled &&
    rate !== null &&
    rate > 0 &&
    account.interestCompounding !== null;

  const interestConfig = hasInterest
    ? { annualRate: rate, compounding: account.interestCompounding! }
    : null;

  const accrued =
    interestConfig && account.interestStartDate
      ? accruedInterest(
          account.balance,
          interestConfig,
          account.interestStartDate,
          todayIso(),
        )
      : 0;

  const projection = interestConfig
    ? projectionSeries(account.balance, interestConfig, 10)
    : [];

  return (
    <>
      <PageHeader
        title={account.name}
        description={
          account.institution ??
          (account.type === "savings"
            ? "Cuenta de ahorro"
            : account.type === "cash"
              ? "Efectivo"
              : "Cuenta de banco")
        }
        action={
          <div className="flex gap-2">
            <AccountDialog account={account} />
            <AccountActions account={account} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard tone="primary" label="Saldo actual" value={money(account.balance)} />
        <StatCard
          label="Saldo inicial"
          value={money(account.initialBalance)}
          hint="Con el que empezaste a usar la app"
        />
        <StatCard
          label="Movimiento neto"
          value={money(account.balance - account.initialBalance)}
          hint="Todo lo que ha entrado y salido desde entonces"
        />
      </div>

      {hasInterest && interestConfig && (
        <InterestPanel
          accountId={account.id}
          balance={account.balance}
          rateLabel={formatRate(interestConfig.annualRate, settings.locale)}
          compounding={interestConfig.compounding}
          startDate={account.interestStartDate}
          accrued={accrued}
          projection={projection}
        />
      )}

      {account.type === "savings" && !account.interestEnabled && (
        <Panel className="mt-4" title="¿Este ahorro va a generar intereses?">
          <p className="text-sm text-muted-foreground">
            Hoy está como ahorro estático. Cuando lo pases a una cuenta que sí
            pague, activa los intereses al editar la cuenta: la app te mostrará la
            proyección y podrás registrar lo que el banco te abone.
          </p>
        </Panel>
      )}

      <Panel className="mt-4" title="Movimientos de esta cuenta">
        <TransactionList items={movements} />
      </Panel>
    </>
  );
}
