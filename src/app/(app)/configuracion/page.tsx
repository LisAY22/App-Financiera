import { requireUserId } from "@/auth";
import { getCategories, getPeople, getSettings } from "@/lib/queries/lookups";
import { PageHeader } from "@/components/shell";
import { SettingsForm } from "@/components/settings/settings-form";
import { CategoryManager } from "@/components/settings/category-manager";
import { PeopleManager } from "@/components/settings/people-manager";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const userId = await requireUserId();

  const [categories, people, settings] = await Promise.all([
    getCategories(userId, { includeArchived: true }),
    getPeople(userId),
    getSettings(userId),
  ]);

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Moneda, categorías y las personas con las que compartes gastos."
      />

      <div className="space-y-4">
        <SettingsForm settings={settings} />
        <CategoryManager categories={categories} />
        <PeopleManager people={people} />
      </div>
    </>
  );
}
