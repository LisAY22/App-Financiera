"use client";

import { useState, useTransition } from "react";
import type { Settings } from "@/lib/queries/lookups";
import { saveSettings } from "@/actions/misc";
import { formatMoney } from "@/lib/money";
import { Panel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function SettingsForm({ settings }: { settings: Settings }) {
  const [pending, startTransition] = useTransition();
  const [currency, setCurrency] = useState(settings.currency);
  const [locale, setLocale] = useState(settings.locale);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  // Vista previa en vivo: se ve cómo quedarán los montos antes de guardar.
  let preview = "—";
  try {
    preview = formatMoney(123456, { currency, locale });
  } catch {
    preview = "Combinación no válida";
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await saveSettings({ currency, locale });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success("Configuración guardada");
    });
  }

  return (
    <Panel title="Moneda y formato">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Moneda</Label>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="MXN"
              maxLength={3}
              className="uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Código de tres letras: MXN, USD, COP, EUR…
            </p>
            {errors.currency && (
              <p className="text-xs text-destructive">{errors.currency[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Formato regional</Label>
            <Input
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="es-MX"
            />
            <p className="text-xs text-muted-foreground">
              Define separadores de miles y decimales: es-MX, es-CO, es-ES…
            </p>
          </div>
        </div>

        <p className="rounded-xl bg-muted px-3 py-2.5 text-sm">
          Así se verán tus montos:{" "}
          <span className="tabular font-medium">{preview}</span>
        </p>

        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </Panel>
  );
}
