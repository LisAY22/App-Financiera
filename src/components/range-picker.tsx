"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { es } from "react-day-picker/locale";
import type { DateRange as DayPickerRange } from "react-day-picker";
import {
  formatRangeLabel,
  fromIso,
  RANGE_LABELS,
  RANGE_PRESETS,
  toIso,
  type DateRange,
  type RangeSelection,
} from "@/lib/periods";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Cambios de URL que pide el selector. `undefined` borra el parámetro. */
export type RangeParamUpdate = {
  rango?: string;
  desde?: string;
  hasta?: string;
};

const SELECT_ITEMS: Record<RangeSelection, string> = {
  ...RANGE_LABELS,
  custom: "Personalizado",
};

/**
 * Selector de periodo: los presets de siempre más un calendario para elegir
 * de cuándo a cuándo.
 *
 * Elegir un preset borra `desde`/`hasta`; aplicar un rango del calendario
 * borra `rango`. Así la URL nunca tiene las dos cosas a la vez y no hay que
 * decidir cuál gana.
 */
export function RangePicker({
  selection,
  range,
  onChange,
  size = "default",
}: {
  selection: RangeSelection;
  range: DateRange;
  onChange: (update: RangeParamUpdate) => void;
  size?: "sm" | "default";
}) {
  const isCustom = selection === "custom";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerRange | undefined>(
    isCustom ? { from: fromIso(range.from), to: fromIso(range.to) } : undefined,
  );

  const today = new Date();

  function openPicker(next: boolean) {
    // Al abrir, el calendario parte de lo que estás viendo, no de un borrador
    // que dejaste a medias la vez anterior.
    if (next) {
      setDraft(isCustom ? { from: fromIso(range.from), to: fromIso(range.to) } : undefined);
    }
    setOpen(next);
  }

  function apply() {
    if (!draft?.from) return;
    const from = toIso(draft.from);
    // Un solo clic es un rango de un día: no obligamos a hacer clic dos veces.
    const to = toIso(draft.to ?? draft.from);
    onChange({ rango: undefined, desde: from, hasta: to });
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={SELECT_ITEMS}
        value={selection}
        onValueChange={(value) => {
          if (value === "custom") {
            openPicker(true);
            return;
          }
          if (value) onChange({ rango: value, desde: undefined, hasta: undefined });
        }}
      >
        <SelectTrigger size={size} className="w-auto min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {RANGE_LABELS[preset]}
            </SelectItem>
          ))}
          <SelectItem value="custom">Personalizado…</SelectItem>
        </SelectContent>
      </Select>

      <Popover open={open} onOpenChange={(next) => openPicker(next)}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size={size}
              className={cn("font-normal", !isCustom && "text-muted-foreground")}
            />
          }
        >
          <CalendarDays className="size-4" />
          {isCustom ? formatRangeLabel(range) : "Elegir fechas"}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            mode="range"
            locale={es}
            weekStartsOn={1}
            selected={draft}
            onSelect={setDraft}
            defaultMonth={draft?.from ?? today}
            captionLayout="dropdown"
            startMonth={new Date(2015, 0)}
            endMonth={new Date(today.getFullYear() + 1, 11)}
            resetOnSelect
          />
          <div className="flex items-center justify-between gap-2 border-t border-border px-1 pt-2">
            <p className="text-xs text-muted-foreground">
              {draft?.from
                ? formatRangeLabel({
                    from: toIso(draft.from),
                    to: toIso(draft.to ?? draft.from),
                  })
                : "Elige el día de inicio y el de fin"}
            </p>
            <Button size="sm" onClick={apply} disabled={!draft?.from}>
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
