"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import type { Account, AccountType, Compounding } from "@/db/schema";
import { saveAccount } from "@/actions/accounts";
import { COMPOUNDING_LABELS } from "@/lib/interest";
import { todayIso } from "@/lib/periods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

const TYPE_OPTIONS: { value: AccountType; label: string; hint: string }[] = [
  { value: "bank", label: "Banco", hint: "Cuenta corriente o de nómina" },
  { value: "cash", label: "Efectivo", hint: "El dinero que traes encima" },
  { value: "savings", label: "Ahorro", hint: "Puede generar intereses" },
];

export function AccountDialog({
  account,
  trigger,
}: {
  account?: Account;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [initialBalance, setInitialBalance] = useState(
    account ? (account.initialBalance / 100).toFixed(2) : "",
  );
  const [interestEnabled, setInterestEnabled] = useState(account?.interestEnabled ?? false);
  const [rate, setRate] = useState(
    account?.interestAnnualRate ? String(Number(account.interestAnnualRate) * 100) : "",
  );
  const [compounding, setCompounding] = useState<Compounding>(
    account?.interestCompounding ?? "monthly",
  );
  const [startDate, setStartDate] = useState(account?.interestStartDate ?? todayIso());

  const isSavings = type === "savings";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await saveAccount({
        id: account?.id,
        name,
        type,
        institution,
        initialBalance: initialBalance || "0",
        interestEnabled: isSavings && interestEnabled,
        interestAnnualRate: isSavings && interestEnabled ? rate : undefined,
        interestCompounding: isSavings && interestEnabled ? compounding : undefined,
        interestStartDate: isSavings && interestEnabled ? startDate : undefined,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(account ? "Cuenta actualizada" : "Cuenta creada");
      setOpen(false);
    });
  }

  const fieldError = (key: string) => errors[key]?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ? undefined : <Button size="sm" />}>
        {trigger ?? (
          <>
            <Plus className="size-4" />
            Nueva cuenta
          </>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
          <DialogDescription>
            {account
              ? "Los movimientos ya registrados no cambian."
              : "Pon el saldo que tiene hoy y la app calcula el resto desde tus movimientos."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Banco principal"
            />
            {fieldError("name") && (
              <p className="text-xs text-destructive">{fieldError("name")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select
              items={Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label]))}
              value={type}
              onValueChange={(v) => setType((v as AccountType) ?? "bank")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {TYPE_OPTIONS.find((o) => o.value === type)?.hint}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Saldo actual</Label>
              <Input
                inputMode="decimal"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="0.00"
                className="tabular"
              />
              {fieldError("initialBalance") && (
                <p className="text-xs text-destructive">{fieldError("initialBalance")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Banco (opcional)</Label>
              <Input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="BBVA, Nu…"
              />
            </div>
          </div>

          {isSavings && (
            <section className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium">Genera intereses</span>
                  <span className="block text-xs text-muted-foreground">
                    Actívalo cuando pases el ahorro a una cuenta que sí pague.
                  </span>
                </span>
                <Switch checked={interestEnabled} onCheckedChange={setInterestEnabled} />
              </label>

              {interestEnabled && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Tasa anual (%)
                      </Label>
                      <Input
                        inputMode="decimal"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        placeholder="8.5"
                        className="tabular"
                      />
                      {fieldError("interestAnnualRate") && (
                        <p className="text-xs text-destructive">
                          {fieldError("interestAnnualRate")}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Capitaliza</Label>
                      <Select
                        items={COMPOUNDING_LABELS}
                        value={compounding}
                        onValueChange={(v) => setCompounding((v as Compounding) ?? "monthly")}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(COMPOUNDING_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Desde cuándo</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <Alert>
                    <AlertDescription className="text-xs">
                      La app calcula la proyección, pero nunca suma intereses sola. Cuando
                      el banco te los abone, los registras con un botón para que tu saldo
                      siempre cuadre con el suyo.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </section>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando…" : account ? "Guardar cambios" : "Crear cuenta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
