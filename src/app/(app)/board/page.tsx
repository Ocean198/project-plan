import { auth } from "@/lib/auth";
import { KanbanBoard } from "@/components/board/KanbanBoard";
import { BoardTitle } from "@/components/board/BoardTitle";
import { getPermissions } from "@/lib/permissions";

export default async function BoardPage() {
  const [session, permissions] = await Promise.all([auth(), getPermissions()]);
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <BoardTitle />
        <p className="text-sm text-gray-400 mt-0.5">Aufgaben nach Sprint und Standort</p>
      </div>
      <KanbanBoard userRole={session!.user.role} permissions={permissions} />
    </div>
  );
}
