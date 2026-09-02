"use client";

import { useState, useTransition } from "react";
import type { AccountWithBalance } from "@/lib/queries/balances";
import type { DebtWithProgress } from "@/lib/queries/debts";
import { payDebt } from "@/actions/debts";
import { todayIso } from "@/lib/periods";
import { useMoneyFormatter } from "@/components/settings-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function PayDebtDialog({
  debt,
  accounts,
}: {
  debt: DebtWithProgress;
  accounts: AccountWithBalance[];
}) {
  const format = useMoneyFormatter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [amount, setAmount] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [date, setDate] = useState(todayIso());

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await payDebt({
        debtId: debt.id,
        amount,
        fromAccountId,
        date,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success("Pago registrado");
      setOpen(false);
      setAmount("");
    });
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Pagar</DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar {debt.description}</DialogTitle>
          <DialogDescription>
            Te faltan {format(debt.remaining)} de {format(debt.originalAmount)}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Monto</Label>
            <div className="flex gap-2">
              <Input
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="tabular"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setAmount((debt.remaining / 100).toFixed(2))}
              >
                Todo
              </Button>
            </div>
            {fieldError("amount") && (
              <p className="text-xs text-destructive">{fieldError("amount")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">¿De qué cuenta sale?</Label>
            <Select
              items={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
              value={fromAccountId}
              onValueChange={(v) => setFromAccountId(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elige una" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {format(a.balance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldError("fromAccountId") && (
              <p className="text-xs text-destructive">{fieldError("fromAccountId")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/*
            Se dice explícitamente si este pago entra o no al análisis, porque
            depende del origen que elegiste al crear la deuda y no hay forma de
            adivinarlo desde aquí.
          */}
          <p className="rounded-xl bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            {debt.countsAsExpense
              ? "Este pago bajará el saldo de la cuenta y contará como egreso del mes."
              : "Este pago solo bajará el saldo de la cuenta: no contará como egreso, porque la compra ya se registró en su fecha."}
          </p>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando…" : "Registrar pago"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
