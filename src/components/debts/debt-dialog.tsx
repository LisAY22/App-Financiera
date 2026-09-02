"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Link2, Plus } from "lucide-react";
import type { DebtOrigin, Person } from "@/db/schema";
import type { AccountWithBalance } from "@/lib/queries/balances";
import type { DuplicateCandidate } from "@/lib/queries/debts";
import { DEBT_ORIGIN_OPTIONS } from "@/lib/debt-rules";
import { checkForDuplicateExpense, saveDebt } from "@/actions/debts";
import { parseMoney } from "@/lib/money";
import { formatDateLabel, todayIso } from "@/lib/periods";
import { useMoneyFormatter } from "@/components/settings-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function DebtDialog({
  accounts,
  people,
}: {
  accounts: AccountWithBalance[];
  people: Person[];
}) {
  const format = useMoneyFormatter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [description, setDescription] = useState("");
  const [creditorName, setCreditorName] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState("");
  const [origin, setOrigin] = useState<DebtOrigin>("purchase_untracked");
  const [disbursementAccountId, setDisbursementAccountId] = useState("");

  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [linkedTransactionId, setLinkedTransactionId] = useState<string | null>(null);

  const originMeta = DEBT_ORIGIN_OPTIONS.find((o) => o.value === origin)!;

  /*
    Detector de duplicados en vivo.

    La forma más fácil de arruinar el análisis es registrar la compra como gasto
    y además crear la deuda: el mismo dinero contaría dos veces. En cuanto el
    monto se estabiliza, la app busca un egreso parecido y lo pone sobre la mesa
    en vez de esperar a que te acuerdes tú.
  */
  useEffect(() => {
    const cents = parseMoney(amount);
    let cancelled = false;

    // Todo pasa por el temporizador, incluido el limpiado: así no hay un
    // setState síncrono en el efecto y la lista no parpadea mientras tecleas.
    const timer = setTimeout(async () => {
      if (!cents || cents <= 0) {
        if (!cancelled) setCandidates([]);
        return;
      }
      const found = await checkForDuplicateExpense(cents);
      if (!cancelled) setCandidates(found);
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [amount]);

  function linkCandidate(candidate: DuplicateCandidate) {
    setLinkedTransactionId(candidate.transactionId);
    // Vincular cambia el origen SOLO: de ahí se deriva que los pagos ya no
    // cuenten como egreso. No hay una casilla aparte que pueda quedar
    // desalineada con esta decisión.
    setOrigin("purchase_tracked");
    if (!description) setDescription(candidate.description);
    toast.success("Vinculado: sus pagos ya no contarán como gasto");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await saveDebt({
        description,
        creditorName,
        originalAmount: amount,
        startDate,
        dueDate: dueDate || undefined,
        origin,
        originTransactionId: linkedTransactionId ?? undefined,
        disbursementAccountId:
          origin === "cash_loan" && disbursementAccountId
            ? disbursementAccountId
            : undefined,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success("Deuda registrada");
      setOpen(false);
      setDescription("");
      setCreditorName("");
      setAmount("");
      setDueDate("");
      setLinkedTransactionId(null);
      setCandidates([]);
      setOrigin("purchase_untracked");
    });
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Nueva deuda
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva deuda</DialogTitle>
          <DialogDescription>
            Registrarla no toca ninguna cuenta: solo empieza a moverse cuando pagues.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">¿De qué es?</Label>
              <Input
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Laptop, préstamo…"
              />
              {fieldError("description") && (
                <p className="text-xs text-destructive">{fieldError("description")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">¿A quién le debes?</Label>
              <Input
                list="acreedores"
                value={creditorName}
                onChange={(e) => setCreditorName(e.target.value)}
                placeholder="Nombre o banco"
              />
              <datalist id="acreedores">
                {people.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
              {fieldError("creditorName") && (
                <p className="text-xs text-destructive">{fieldError("creditorName")}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Monto</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="tabular"
              />
              {fieldError("originalAmount") && (
                <p className="text-xs text-destructive">{fieldError("originalAmount")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vence (opcional)</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {candidates.length > 0 && !linkedTransactionId && (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                <p className="mb-2 text-sm font-medium text-foreground">
                  ¿Alguno de estos es la compra que originó la deuda?
                </p>
                <ul className="space-y-1.5">
                  {candidates.map((candidate) => (
                    <li
                      key={candidate.transactionId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                    >
                      <span className="min-w-0 text-xs">
                        <span className="block truncate font-medium text-foreground">
                          {candidate.description || "Sin descripción"}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDateLabel(candidate.date)}
                          {candidate.categoryName && ` · ${candidate.categoryName}`}
                          {" · "}
                          {format(candidate.amount)}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => linkCandidate(candidate)}
                      >
                        <Link2 className="size-3.5" />
                        Sí, es esa
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">
                  Si vinculas una, los pagos de esta deuda dejarán de contar como
                  gasto para no contar el mismo dinero dos veces.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {linkedTransactionId && (
            <Alert>
              <Link2 className="size-4" />
              <AlertDescription className="flex items-center justify-between gap-2">
                <span className="text-xs">
                  Vinculada a un gasto ya registrado. Sus pagos solo moverán saldo.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setLinkedTransactionId(null);
                    setOrigin("purchase_untracked");
                  }}
                >
                  Deshacer
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">
              ¿Cómo se originó esta deuda?
            </legend>
            {DEBT_ORIGIN_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                  origin === option.value
                    ? "border-primary bg-accent/50"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="origin"
                  className="mt-0.5 accent-[var(--primary)]"
                  checked={origin === option.value}
                  onChange={() => {
                    setOrigin(option.value);
                    if (option.value !== "purchase_tracked") setLinkedTransactionId(null);
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {origin === "cash_loan" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                ¿A qué cuenta entró el dinero? (opcional)
              </Label>
              <Select
                items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
                value={disbursementAccountId}
                onValueChange={(v) => setDisbursementAccountId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Ninguna / fue en efectivo aparte" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si la eliges, el saldo de esa cuenta sube. No cuenta como ingreso:
                que te presten dinero no es ganarlo.
              </p>
            </div>
          )}

          <div
            className={cn(
              "rounded-xl px-3 py-2.5 text-xs",
              originMeta.countsAsExpense ? "bg-[var(--debt-soft)]" : "bg-muted",
            )}
          >
            <span className="font-medium">
              {originMeta.countsAsExpense
                ? "Los pagos de esta deuda contarán como egreso."
                : "Los pagos de esta deuda no contarán como egreso."}
            </span>{" "}
            {originMeta.help}
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando…" : "Registrar deuda"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
