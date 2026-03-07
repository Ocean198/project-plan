import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ListClient } from "./ListClient";

export default async function ListPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <ListClient canExport={true} />;
}
