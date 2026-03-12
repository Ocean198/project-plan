import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminNav } from "./AdminNav";
import { getPermissions, can } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const permissions = await getPermissions();
  if (!can(session?.user.role ?? '', 'settings.access', permissions)) redirect("/board");

  return (
    <div className="px-6 py-6 max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Administration</h1>
        <p className="text-sm text-gray-400 mt-0.5">Standorte, User, Sprints und Webhooks verwalten</p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
