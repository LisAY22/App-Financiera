"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import type { Category } from "@/db/schema";
import type { AccountWithBalance } from "@/lib/queries/balances";
import { RANGE_LABELS, RANGE_PRESETS, type RangePreset } from "@/lib/periods";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

const TYPE_OPTIONS = [
  { value: "expense", label: "Egresos" },
  { value: "income", label: "Ingresos" },
  { value: "transfer", label: "Transferencias" },
  { value: "debt_payment", label: "Pagos de deuda" },
  { value: "debt_disbursement", label: "Préstamos recibidos" },
];

export function TransactionFiltersBar({
  categories,
  accounts,
  range,
  type,
  categoryId,
  accountId,
  search,
}: {
  categories: Category[];
  accounts: AccountWithBalance[];
  range: RangePreset;
  type?: string;
  categoryId?: string;
  accountId?: string;
  search?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(search ?? "");

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
      // Cambiar un filtro siempre vuelve a la primera página: quedarse en la 5
      // de un resultado que ahora tiene 2 muestra una lista vacía sin razón.
      params.delete("pagina");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // La búsqueda espera a que dejes de teclear en vez de consultar por letra.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search ?? "") !== query) setParam("q", query || undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, search, setParam]);

  const hasFilters = Boolean(type || categoryId || accountId || search);

  // Base UI pinta la clave cruda en el botón cerrado si no le damos el mapa de
  // etiquetas, así que cada selector construye el suyo.
  const typeItems = {
    [ALL]: "Todos los tipos",
    ...Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label])),
  };
  const categoryItems = {
    [ALL]: "Todas las categorías",
    ...Object.fromEntries(categories.map((c) => [c.id, c.name])),
  };
  const accountItems = {
    [ALL]: "Todas las cuentas",
    ...Object.fromEntries(accounts.map((a) => [a.id, a.name])),
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por descripción"
          className="pl-9"
          aria-label="Buscar movimientos"
        />
      </div>

      <Select items={RANGE_LABELS} value={range} onValueChange={(v) => setParam("rango", v ?? undefined)}>
        <SelectTrigger className="w-auto min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {RANGE_LABELS[preset]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select items={typeItems} value={type ?? ALL} onValueChange={(v) => setParam("tipo", v ?? undefined)}>
        <SelectTrigger className="w-auto min-w-32">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los tipos</SelectItem>
          {TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={categoryItems}
        value={categoryId ?? ALL}
        onValueChange={(v) => setParam("categoria", v ?? undefined)}
      >
        <SelectTrigger className="w-auto min-w-36">
          <SelectValue placeholder="Categoría" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las categorías</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select items={accountItems} value={accountId ?? ALL} onValueChange={(v) => setParam("cuenta", v ?? undefined)}>
        <SelectTrigger className="w-auto min-w-32">
          <SelectValue placeholder="Cuenta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las cuentas</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            router.replace(pathname, { scroll: false });
          }}
        >
          <X className="size-4" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
