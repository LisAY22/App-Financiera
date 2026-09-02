"use client";

import { useState, useTransition } from "react";
import { Archive, Plus } from "lucide-react";
import type { Category, CategoryKind } from "@/db/schema";
import { deleteCategory, saveCategory } from "@/actions/misc";
import { seriesColor } from "@/lib/chart-theme";
import { Panel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [kind, setKind] = useState<CategoryKind>("expense");

  return (
    <Panel
      title="Categorías"
      description="Una categoría con movimientos se archiva en vez de borrarse, para que el análisis de meses pasados siga cuadrando."
    >
      <Tabs value={kind} onValueChange={(v) => setKind(v as CategoryKind)}>
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="expense">Egresos</TabsTrigger>
          <TabsTrigger value="income">Ingresos</TabsTrigger>
        </TabsList>

        <TabsContent value="expense" className="mt-4">
          <CategoryList categories={categories.filter((c) => c.kind === "expense")} kind="expense" />
        </TabsContent>
        <TabsContent value="income" className="mt-4">
          <CategoryList categories={categories.filter((c) => c.kind === "income")} kind="income" />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function CategoryList({
  categories,
  kind,
}: {
  categories: Category[];
  kind: CategoryKind;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      const result = await saveCategory({ name, kind });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Categoría creada");
      setName("");
    });
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Categoría archivada o eliminada");
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "expense" ? "Mascotas, Regalos…" : "Bonos, Renta…"}
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          <Plus className="size-4" />
          Añadir
        </Button>
      </form>

      <ul className="flex flex-wrap gap-2">
        {active.map((category, index) => (
          <li
            key={category.id}
            className="group flex items-center gap-2 rounded-full border border-border py-1 pl-3 pr-1.5 text-sm"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: seriesColor(index % 8) }}
            />
            {category.name}
            <button
              type="button"
              aria-label={`Archivar ${category.name}`}
              disabled={pending}
              onClick={() => handleArchive(category.id)}
              className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Archive className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Archivadas</p>
          <ul className="flex flex-wrap gap-2">
            {archived.map((category) => (
              <li
                key={category.id}
                className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground"
              >
                {category.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
