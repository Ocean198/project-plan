import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ActivityClient } from "./ActivityClient";

export default async function ActivityPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <ActivityClient />;
}
