import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

/**
 * Tarjeta de dato suelto (patrimonio, gasto del mes, tasa de ahorro).
 *
 * El número manda: etiqueta pequeña arriba, cifra grande con números
 * tabulares, y una nota discreta debajo para el contexto. Nada más.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "primary";
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 sm:p-4",
        tone === "primary"
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-xs font-medium",
            tone === "primary" ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {icon}
      </div>
      {/* `text-lg` en teléfono no es solo densidad: con dos columnas a 360 px
          una cifra como −$12,345.67 no cabe a 20 px y se parte en dos líneas,
          desalineando toda la fila de tarjetas. */}
      <p className="tabular mt-1.5 text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">
        {value}
      </p>
      {hint && (
        <p
          className={cn(
            "mt-1 text-xs",
            tone === "primary" ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-4",
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:mb-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
