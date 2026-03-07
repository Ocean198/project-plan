import { auth } from "@/lib/auth";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  const canExport = session?.user.role === "admin" || session?.user.role === "sales";
  return <DashboardClient canExport={canExport} />;
}
