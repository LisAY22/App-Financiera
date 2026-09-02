"use client";

import { useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Sparkles } from "lucide-react";
import type { Compounding } from "@/db/schema";
import type { Cents } from "@/lib/money";
import type { ProjectionPoint } from "@/lib/interest";
import { COMPOUNDING_LABELS } from "@/lib/interest";
import { todayIso, formatDateLabel } from "@/lib/periods";
import { recordInterest } from "@/actions/accounts";
import { axisProps, gridProps } from "@/lib/chart-theme";
import { useMoneyFormatter } from "@/components/settings-provider";
import { Panel, StatCard } from "@/components/shell";
import { ChartLegend, ChartTooltip, LINE_WIDTH, useAxisFormatter } from "@/components/charts/primitives";
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
import { toast } from "sonner";

export function InterestPanel({
  accountId,
  balance,
  rateLabel,
  compounding,
  startDate,
  accrued,
  projection,
}: {
  accountId: string;
  balance: Cents;
  rateLabel: string;
  compounding: Compounding;
  startDate: string | null;
  accrued: Cents;
  projection: ProjectionPoint[];
}) {
  const format = useMoneyFormatter();
  const axisFormat = useAxisFormatter();

  const inTen = projection.at(-1);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Tasa anual"
          value={rateLabel}
          hint={`Capitalización ${COMPOUNDING_LABELS[compounding].toLowerCase()}`}
        />
        <StatCard
          label="Interés devengado"
          value={format(accrued)}
          hint={
            startDate
              ? `Estimado desde ${formatDateLabel(startDate)}`
              : "Estimado"
          }
        />
        <StatCard
          label="En 10 años"
          value={inTen ? format(inTen.withInterest) : "—"}
          hint={
            inTen ? `${format(inTen.withInterest - inTen.flat)} solo de intereses` : undefined
          }
        />
      </div>

      <Panel
        title="Proyección del ahorro"
        description="Comparada contra dejarlo quieto sin intereses"
        action={<RecordInterestDialog accountId={accountId} suggested={accrued} />}
      >
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projection} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="year"
                {...axisProps}
                tickFormatter={(value: number) => (value === 0 ? "Hoy" : `${value} a`)}
              />
              <YAxis {...axisProps} tickFormatter={axisFormat} width={64} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as ProjectionPoint;
                  return (
                    <ChartTooltip
                      title={label === 0 ? "Hoy" : `En ${label} año(s)`}
                      rows={[
                        {
                          label: "Con intereses",
                          value: format(point.withInterest),
                          color: "var(--chart-1)",
                          emphasis: true,
                        },
                        {
                          label: "Sin intereses",
                          value: format(point.flat),
                          color: "var(--transfer)",
                        },
                        {
                          label: "Ganancia",
                          value: format(point.withInterest - point.flat),
                        },
                      ]}
                    />
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="withInterest"
                name="Con intereses"
                stroke="var(--chart-1)"
                strokeWidth={LINE_WIDTH}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
              <Line
                type="monotone"
                dataKey="flat"
                name="Sin intereses"
                stroke="var(--transfer)"
                strokeWidth={LINE_WIDTH}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ChartLegend
          items={[
            { label: "Con intereses", color: "var(--chart-1)" },
            { label: "Sin intereses", color: "var(--transfer)" },
          ]}
        />

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Proyección sobre el saldo actual de {format(balance)}. Es una estimación:
          si metes o sacas dinero, cambia. La app nunca suma estos intereses sola —
          los registras tú cuando el banco te los abone, para que tu saldo siempre
          cuadre con el suyo.
        </p>
      </Panel>
    </div>
  );
}

/**
 * El paso que convierte una proyección en dinero real.
 *
 * El monto viene precargado con la estimación pero es editable, porque el banco
 * casi nunca paga exactamente lo calculado y lo que debe quedar registrado es
 * lo que de verdad abonó.
 */
function RecordInterestDialog({
  accountId,
  suggested,
}: {
  accountId: string;
  suggested: Cents;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState((suggested / 100).toFixed(2));
  const [date, setDate] = useState(todayIso());

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await recordInterest({ accountId, amount, date });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Interés registrado como ingreso");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Sparkles className="size-4" />
        Registrar interés recibido
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar interés recibido</DialogTitle>
          <DialogDescription>
            Se guardará como un ingreso en la categoría «Intereses» hacia esta cuenta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Monto que te abonó el banco
            </Label>
            <Input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular"
            />
            <p className="text-xs text-muted-foreground">
              Viene precargado con la estimación; ajústalo a lo que realmente recibiste.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Guardando…" : "Registrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
