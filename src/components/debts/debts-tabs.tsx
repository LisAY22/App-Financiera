"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Check, HandCoins, Undo2, Users } from "lucide-react";
import type { Person } from "@/db/schema";
import type { AccountWithBalance } from "@/lib/queries/balances";
import type {
  CreditorSlice,
  DebtBalancePoint,
  DebtWithProgress,
  PayoffProjection,
} from "@/lib/queries/debts";
import type { PersonDebtGroup, Receivable } from "@/lib/queries/receivables";
import type { Settings } from "@/lib/queries/lookups";
import { formatDateLabel, todayIso, type Granularity, type RangePreset } from "@/lib/periods";
import { settleSplit, unsettleSplit } from "@/actions/misc";
import { seriesColor } from "@/lib/chart-theme";
import { useMoneyFormatter } from "@/components/settings-provider";
import { EmptyState, Panel, StatCard } from "@/components/shell";
import { PeriodControls } from "@/components/period-controls";
import {
  DebtOutstandingChart,
  DebtPaymentsChart,
} from "@/components/charts/trend-charts";
import { DebtDialog } from "./debt-dialog";
import { PayDebtDialog } from "./pay-debt-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  activeTab: "me-deben" | "debo";
  range: RangePreset;
  granularity: Granularity;
  receivableGroups: PersonDebtGroup[];
  settledReceivables: Receivable[];
  debts: DebtWithProgress[];
  debtSeries: DebtBalancePoint[];
  byCreditor: CreditorSlice[];
  projection: PayoffProjection;
  paidInRange: number;
  accounts: AccountWithBalance[];
  people: Person[];
  settings: Settings;
};

export function DebtsTabs(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const pendingTotal = props.receivableGroups.reduce((sum, g) => sum + g.total, 0);
  const owed = props.debts.filter((d) => !d.settled).reduce((s, d) => s + d.remaining, 0);

  return (
    <Tabs value={props.activeTab} onValueChange={setTab}>
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="me-deben">Me deben</TabsTrigger>
        <TabsTrigger value="debo">Yo debo</TabsTrigger>
      </TabsList>

      <TabsContent value="me-deben" className="mt-5">
        <ReceivablesTab
          groups={props.receivableGroups}
          settled={props.settledReceivables}
          accounts={props.accounts}
          total={pendingTotal}
        />
      </TabsContent>

      <TabsContent value="debo" className="mt-5">
        <MyDebtsTab {...props} owed={owed} />
      </TabsContent>
    </Tabs>
  );
}

/* ==================================================================== *
 * Me deben
 * ==================================================================== */

function ReceivablesTab({
  groups,
  settled,
  accounts,
  total,
}: {
  groups: PersonDebtGroup[];
  settled: Receivable[];
  accounts: AccountWithBalance[];
  total: number;
}) {
  const format = useMoneyFormatter();

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-8" />}
        title="Nadie te debe nada"
        description="Cuando pagues algo compartido, agrega las cuotas de cada persona en el formulario del gasto y aparecerán aquí hasta que te paguen."
      />
    );
  }

  return (
    <div className="space-y-4">
      <StatCard
        tone="primary"
        label="Total por cobrar"
        value={format(total)}
        hint={`${groups.length} persona(s)`}
        className="sm:max-w-xs"
      />

      {groups.map((group) => (
        <Panel
          key={group.personId}
          title={group.personName}
          description={`${group.items.length} cuota(s) pendiente(s)`}
          action={<span className="tabular text-base font-semibold">{format(group.total)}</span>}
        >
          <ul className="divide-y divide-border">
            {group.items.map((item) => (
              <li key={item.splitId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.transactionDescription || "Gasto compartido"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateLabel(item.transactionDate)}
                    {item.categoryName && ` · ${item.categoryName}`}
                    {" · de "}
                    {format(item.transactionAmount)} en total
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm font-medium">
                  {format(item.amount)}
                </span>
                <SettleButton splitId={item.splitId} accounts={accounts} />
              </li>
            ))}
          </ul>
        </Panel>
      ))}

      {settled.length > 0 && (
        <Panel title="Ya cobradas" description="Últimas cuotas que te pagaron">
          <ul className="divide-y divide-border">
            {settled.map((item) => (
              <li key={item.splitId} className="flex items-center gap-3 py-2.5">
                <Check className="size-4 shrink-0 text-[var(--income-ink)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {item.personName} · {item.transactionDescription || "Gasto compartido"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.settledDate && formatDateLabel(item.settledDate)}
                    {item.settledAccountName && ` → ${item.settledAccountName}`}
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm">{format(item.amount)}</span>
                <UnsettleButton splitId={item.splitId} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/**
 * Marcar una cuota como cobrada pide la cuenta destino, porque el dinero entra
 * a algún lado y el saldo tiene que reflejarlo. El análisis no cambia: ese
 * gasto ya contaba neto desde que se registró.
 */
function SettleButton({
  splitId,
  accounts,
}: {
  splitId: string;
  accounts: AccountWithBalance[];
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSettle() {
    startTransition(async () => {
      const result = await settleSplit({
        splitId,
        settledAccountId: accountId,
        settledDate: todayIso(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Cuota cobrada");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Ya me pagó
      </Button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Select
        items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
        value={accountId}
        onValueChange={(v) => setAccountId(v ?? "")}
      >
        <SelectTrigger size="sm" className="min-w-36 flex-1">
          <SelectValue placeholder="¿A qué cuenta?" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!accountId || pending} onClick={handleSettle}>
        {pending ? "…" : "Cobrar"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </div>
  );
}

function UnsettleButton({ splitId }: { splitId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Marcar como no cobrada"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await unsettleSplit(splitId);
          toast.success("Cuota marcada como pendiente");
        })
      }
    >
      <Undo2 className="size-4" />
    </Button>
  );
}

/* ==================================================================== *
 * Yo debo
 * ==================================================================== */

function MyDebtsTab({
  debts,
  debtSeries,
  byCreditor,
  projection,
  paidInRange,
  accounts,
  people,
  range,
  granularity,
  owed,
}: Props & { owed: number }) {
  const format = useMoneyFormatter();

  const open = debts.filter((d) => !d.settled);
  const closed = debts.filter((d) => d.settled);
  const nextDue = open
    .filter((d) => d.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0];

  if (debts.length === 0) {
    return (
      <EmptyState
        icon={<HandCoins className="size-8" />}
        title="No tienes deudas registradas"
        description="Registra lo que debes para verlo aquí. No toca ninguna cuenta hasta que pagues: solo aparece para que lo tengas presente."
        action={<DebtDialog accounts={accounts} people={people} />}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodControls range={range} granularity={granularity} />
        <DebtDialog accounts={accounts} people={people} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard tone="primary" label="Total que debes" value={format(owed)} />
        <StatCard
          label="Pagado en el periodo"
          value={format(paidInRange)}
          hint={
            projection.avgMonthlyPayment > 0
              ? `Promedio ${format(projection.avgMonthlyPayment)} al mes`
              : undefined
          }
        />
        <StatCard
          label="Quedarías libre"
          value={
            projection.monthsToFree === null
              ? "—"
              : projection.monthsToFree === 0
                ? "Ya"
                : `${projection.monthsToFree} mes(es)`
          }
          hint={
            projection.estimatedDate
              ? `Hacia ${formatDateLabel(projection.estimatedDate)}`
              : "Registra pagos para proyectarlo"
          }
          icon={<CalendarClock className="size-4 text-muted-foreground" />}
        />
      </div>

      <ul className="space-y-3">
        {open.map((debt) => (
          <DebtCard key={debt.id} debt={debt} accounts={accounts} />
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Cuánto debes en el tiempo"
          description="Baja conforme pagas; sube al registrar una deuda nueva"
        >
          <DebtOutstandingChart data={debtSeries} granularity={granularity} />
        </Panel>

        <Panel title="Cuánto destinas a pagar deudas">
          <DebtPaymentsChart data={debtSeries} granularity={granularity} />
        </Panel>
      </div>

      {byCreditor.length > 0 && (
        <Panel title="A quién le debes">
          <ul className="space-y-3">
            {byCreditor.map((slice, index) => (
              <li key={slice.name}>
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
                    <span className="tabular text-sm font-medium">
                      {format(slice.remaining)}
                    </span>
                    <span className="tabular w-10 text-right text-xs text-muted-foreground">
                      {slice.share.toFixed(0)} %
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${slice.share}%`,
                      background: seriesColor(index),
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {closed.length > 0 && (
        <Panel title="Liquidadas" description="Deudas que ya terminaste de pagar">
          <ul className="divide-y divide-border">
            {closed.map((debt) => (
              <li key={debt.id} className="flex items-center gap-3 py-2.5">
                <Check className="size-4 shrink-0 text-[var(--income-ink)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{debt.description}</p>
                  <p className="text-xs text-muted-foreground">{debt.creditorName}</p>
                </div>
                <span className="tabular shrink-0 text-sm text-muted-foreground">
                  {format(debt.originalAmount)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {nextDue?.dueDate && (
        <p className="text-center text-xs text-muted-foreground">
          Tu próximo vencimiento es {nextDue.description} el{" "}
          {formatDateLabel(nextDue.dueDate)}.
        </p>
      )}
    </div>
  );
}

function DebtCard({
  debt,
  accounts,
}: {
  debt: DebtWithProgress;
  accounts: AccountWithBalance[];
}) {
  const format = useMoneyFormatter();
  const overdue = debt.daysUntilDue !== null && debt.daysUntilDue < 0;
  const soon = debt.daysUntilDue !== null && debt.daysUntilDue >= 0 && debt.daysUntilDue <= 7;

  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{debt.description}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A {debt.creditorName}
            {debt.dueDate && (
              <span
                className={cn(
                  "ml-1",
                  overdue && "font-medium text-destructive",
                  soon && "font-medium text-[var(--debt-ink)]",
                )}
              >
                · {overdue ? "venció" : "vence"} {formatDateLabel(debt.dueDate)}
              </span>
            )}
          </p>
          {!debt.countsAsExpense && (
            <p className="mt-1 text-xs text-muted-foreground">
              Sus pagos no cuentan como egreso: el gasto ya se registró antes.
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="tabular text-lg font-semibold">{format(debt.remaining)}</p>
          <p className="text-xs text-muted-foreground">
            de {format(debt.originalAmount)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Progress value={debt.progress} className="h-1.5 flex-1" />
        <span className="tabular shrink-0 text-xs text-muted-foreground">
          {debt.progress.toFixed(0)} %
        </span>
        <PayDebtDialog debt={debt} accounts={accounts} />
      </div>
    </li>
  );
}
