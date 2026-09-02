"use client";

import { useState, useTransition } from "react";
import { Plus, UserRound } from "lucide-react";
import type { Person } from "@/db/schema";
import { savePerson } from "@/actions/misc";
import { Panel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function PeopleManager({ people }: { people: Person[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      const result = await savePerson({ name });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Persona añadida");
      setName("");
    });
  }

  return (
    <Panel
      title="Personas"
      description="Quienes te reembolsan cuotas y a quienes les debes. También puedes crearlas sobre la marcha al registrar un gasto."
    >
      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          <Plus className="size-4" />
          Añadir
        </Button>
      </form>

      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no has añadido a nadie.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <UserRound className="size-3.5 text-muted-foreground" />
              {person.name}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
