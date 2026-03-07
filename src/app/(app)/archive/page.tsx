import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArchiveView } from "./ArchiveView";

export default async function ArchivePage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/board");

  return (
    <div className="px-6 py-6 max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Archiv</h1>
        <p className="text-sm text-gray-400 mt-0.5">Archivierte Sprints – neueste zuerst</p>
      </div>
      <ArchiveView />
    </div>
  );
}
