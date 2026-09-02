"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import type { Category, Person, TransactionType } from "@/db/schema";
import type { AccountWithBalance } from "@/lib/queries/balances";
import { parseMoney, splitEvenly, type Cents } from "@/lib/money";
import { todayIso } from "@/lib/periods";
import { saveTransaction } from "@/actions/transactions";
import { useMoneyFormatter } from "@/components/settings-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SplitRow = {
  key: string;
  personId: string;
  personName: string;
  amount: string;
  settled: boolean;
  settledAccountId: string;
};

type Props = {
  accounts: AccountWithBalance[];
  categories: Category[];
  people: Person[];
  onDone?: () => void;
  defaultType?: TransactionType;
};

const NEW_PERSON = "__new__";

function emptySplit(): SplitRow {
  return {
    key: crypto.randomUUID(),
    personId: "",
    personName: "",
    amount: "",
    settled: false,
    settledAccountId: "",
  };
}

export function TransactionForm({
  accounts,
  categories,
  people,
  onDone,
  defaultType = "expense",
}: Props) {
  const format = useMoneyFormatter();
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<"income" | "expense" | "transfer">(
    defaultType === "income" || defaultType === "transfer" ? defaultType : "expense",
  );
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.kind === (type === "income" ? "income" : "expense")),
    [categories, type],
  );

  const totalCents = parseMoney(amount) ?? 0;
  const splitTotal = splits.reduce((sum, s) => sum + (parseMoney(s.amount) ?? 0), 0);
  const netCents = totalCents - splitTotal;
  const splitsExceed = splitTotal > totalCents && totalCents > 0;

  function updateSplit(key: string, patch: Partial<SplitRow>) {
    setSplits((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /** Reparte el total en partes iguales sin perder centavos por redondeo. */
  function divideEvenly() {
    const people = splits.length + 1; // las cuotas más tú
    if (totalCents <= 0 || splits.length === 0) return;
    const parts = splitEvenly(totalCents, people);
    setSplits((rows) =>
      rows.map((row, i) => ({ ...row, amount: (parts[i + 1] / 100).toFixed(2) })),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    const base = {
      amount,
      date,
      description,
    };

    const payload =
      type === "income"
        ? { ...base, type: "income" as const, toAccountId, categoryId }
        : type === "transfer"
          ? { ...base, type: "transfer" as const, fromAccountId, toAccountId }
          : {
              ...base,
              type: "expense" as const,
              fromAccountId,
              categoryId,
              splits: splits
                .filter((s) => s.amount.trim() !== "")
                .map((s) => ({
                  personId: s.personId && s.personId !== NEW_PERSON ? s.personId : undefined,
                  personName: s.personName || undefined,
                  amount: s.amount,
                  settled: s.settled,
                  settledAccountId: s.settled ? s.settledAccountId : undefined,
                  settledDate: s.settled ? date : undefined,
                })),
            };

    startTransition(async () => {
      const result = await saveTransaction(payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Movimiento registrado");
      setAmount("");
      setDescription("");
      setSplits([]);
      onDone?.();
    });
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Tabs value={type} onValueChange={(v) => setType(v as typeof type)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expense">Egreso</TabsTrigger>
          <TabsTrigger value="income">Ingreso</TabsTrigger>
          <TabsTrigger value="transfer">Transferencia</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monto" error={fieldError("amount")}>
          <Input
            inputMode="decimal"
            autoFocus
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tabular text-lg font-medium"
          />
        </Field>

        <Field label="Fecha" error={fieldError("date")}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      {type === "transfer" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Desde" error={fieldError("fromAccountId")}>
            <AccountSelect
              accounts={accounts}
              value={fromAccountId}
              onChange={setFromAccountId}
            />
          </Field>
          <Field label="Hacia" error={fieldError("toAccountId")}>
            <AccountSelect
              accounts={accounts}
              value={toAccountId}
              onChange={setToAccountId}
              exclude={fromAccountId}
            />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={type === "income" ? "A qué cuenta entra" : "De qué cuenta sale"}
            error={fieldError(type === "income" ? "toAccountId" : "fromAccountId")}
          >
            <AccountSelect
              accounts={accounts}
              value={type === "income" ? toAccountId : fromAccountId}
              onChange={type === "income" ? setToAccountId : setFromAccountId}
            />
          </Field>
          <Field label="Categoría" error={fieldError("categoryId")}>
            <Select
              items={Object.fromEntries(visibleCategories.map((c) => [c.id, c.name]))}
              value={categoryId}
              onValueChange={(v) => setCategoryId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elige una" />
              </SelectTrigger>
              <SelectContent>
                {visibleCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      <Field label="Descripción" error={fieldError("description")}>
        <Input
          placeholder={type === "transfer" ? "Traspaso a ahorro" : "¿En qué fue?"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {type === "transfer" && (
        <Alert>
          <AlertDescription>
            Una transferencia solo mueve dinero entre tus cuentas: no cuenta como
            ingreso ni como egreso en el análisis.
          </AlertDescription>
        </Alert>
      )}

      {type === "expense" && (
        <section className="rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted-foreground" />
              ¿Alguien te reembolsa?
            </h3>
            <div className="flex gap-2">
              {splits.length > 0 && totalCents > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={divideEvenly}>
                  Partes iguales
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSplits((rows) => [...rows, emptySplit()])}
              >
                <Plus className="size-4" />
                Cuota
              </Button>
            </div>
          </div>

          {splits.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Si pagaste algo que no es todo tuyo, agrega la cuota de cada persona.
              El gasto se registrará solo por lo que de verdad gastaste.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {splits.map((split, index) => (
                <li
                  key={split.key}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
                    <PersonPicker
                      people={people}
                      personId={split.personId}
                      personName={split.personName}
                      onChange={(patch) => updateSplit(split.key, patch)}
                      error={fieldError(`splits.${index}.personId`)}
                    />
                    <Input
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Monto de la cuota"
                      value={split.amount}
                      onChange={(e) => updateSplit(split.key, { amount: e.target.value })}
                      className="tabular sm:w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar cuota"
                      onClick={() =>
                        setSplits((rows) => rows.filter((r) => r.key !== split.key))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={split.settled}
                        onCheckedChange={(checked) =>
                          updateSplit(split.key, { settled: checked })
                        }
                      />
                      Ya me pagó
                    </label>

                    {split.settled && (
                      <div className="min-w-40 flex-1">
                        <AccountSelect
                          accounts={accounts}
                          value={split.settledAccountId}
                          onChange={(v) => updateSplit(split.key, { settledAccountId: v })}
                          placeholder="¿A qué cuenta?"
                        />
                        {fieldError(`splits.${index}.settledAccountId`) && (
                          <p className="mt-1 text-xs text-destructive">
                            {fieldError(`splits.${index}.settledAccountId`)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {splits.length > 0 && (
            <SplitSummary
              total={totalCents}
              splitTotal={splitTotal}
              net={netCents}
              exceeds={splitsExceed}
              format={format}
            />
          )}
        </section>
      )}

      {errors._form && (
        <Alert variant="destructive">
          <AlertDescription>{errors._form[0]}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Guardando…" : "Guardar movimiento"}
      </Button>
    </form>
  );
}

/**
 * El resumen en vivo. Es lo que convierte "registré un gasto de 1000" en
 * "gasté 400": la persona ve el neto ANTES de guardar, no después en una
 * gráfica que no cuadra con lo que recuerda haber pagado.
 */
function SplitSummary({
  total,
  splitTotal,
  net,
  exceeds,
  format,
}: {
  total: Cents;
  splitTotal: Cents;
  net: Cents;
  exceeds: boolean;
  format: (cents: Cents) => string;
}) {
  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-xl px-3 py-2.5 text-sm",
        exceeds ? "bg-destructive/10" : "bg-card",
      )}
    >
      <span className="text-muted-foreground">
        Total <span className="tabular text-foreground">{format(total)}</span>
      </span>
      <span className="text-muted-foreground">
        Cuotas <span className="tabular text-foreground">{format(splitTotal)}</span>
      </span>
      <span className="font-medium">
        Tu gasto neto{" "}
        <span
          className={cn("tabular", exceeds ? "text-destructive" : "text-[var(--expense-ink)]")}
        >
          {format(net)}
        </span>
      </span>
      {exceeds && (
        <p className="w-full text-xs text-destructive">
          Las cuotas suman más que el gasto total.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
  exclude,
  placeholder = "Elige una",
}: {
  accounts: AccountWithBalance[];
  value: string;
  onChange: (value: string) => void;
  exclude?: string;
  placeholder?: string;
}) {
  const options = accounts.filter((a) => a.id !== exclude);
  return (
    <Select
      items={Object.fromEntries(options.map((a) => [a.id, a.name]))}
      value={value}
      onValueChange={(v) => onChange(v ?? "")}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Elegir una persona existente o escribir una nueva sin salir del formulario. */
function PersonPicker({
  people,
  personId,
  personName,
  onChange,
  error,
}: {
  people: Person[];
  personId: string;
  personName: string;
  onChange: (patch: Partial<SplitRow>) => void;
  error?: string;
}) {
  const creating = personId === NEW_PERSON || (people.length === 0 && !personId);

  return (
    <div className="space-y-1.5">
      {creating ? (
        <div className="flex gap-2">
          <Input
            placeholder="Nombre"
            aria-label="Nombre de la persona"
            value={personName}
            onChange={(e) => onChange({ personName: e.target.value })}
          />
          {people.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ personId: "", personName: "" })}
            >
              Elegir
            </Button>
          )}
        </div>
      ) : (
        <Select
          items={{
            ...Object.fromEntries(people.map((p) => [p.id, p.name])),
            [NEW_PERSON]: "+ Nueva persona",
          }}
          value={personId}
          onValueChange={(v) =>
            onChange(
              v === NEW_PERSON
                ? { personId: NEW_PERSON, personName: "" }
                : { personId: v ?? "" },
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="¿Quién?" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW_PERSON}>+ Nueva persona</SelectItem>
          </SelectContent>
        </Select>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
