import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, unauthorized, serverError } from "@/lib/api-helpers";

// GET /api/export?format=csv|pdf
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "csv";

  try {
    const tasks = await prisma.task.findMany({
      include: {
        location: { select: { name: true, color: true } },
        sprint: { select: { label: true, year: true, month: true } },
        creator: { select: { name: true } },
      },
      orderBy: [
        { sprint: { year: "asc" } },
        { sprint: { month: "asc" } },
        { location: { name: "asc" } },
        { priority: "asc" },
      ],
    });

    if (format === "csv") {
      const header = [
        "ID",
        "Titel",
        "Beschreibung",
        "Status",
        "Action Points",
        "Priorität",
        "Standort",
        "Sprint",
        "Ticket-ID",
        "Erstellt von",
      ].join(";");

      const rows = tasks.map((t) => [
        t.id,
        `"${(t.title ?? "").replace(/"/g, '""')}"`,
        `"${(t.description ?? "").replace(/"/g, '""')}"`,
        t.status,
        t.action_points,
        t.priority,
        t.location.name,
        t.sprint.label,
        t.external_ticket_id ?? "",
        t.creator?.name ?? "",
      ].join(";"));

      const csv = [header, ...rows].join("\n");
      const bom = "\uFEFF"; // UTF-8 BOM for Excel

      return new NextResponse(bom + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="sprintboard-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // HTML/PDF report
    const locationColors = new Map<string, string>();
    tasks.forEach((t) => locationColors.set(t.location.name, t.location.color));

    const statusLabel: Record<string, string> = {
      open: "Offen",
      in_progress: "In Bearbeitung",
      completed: "Abgeschlossen",
    };

    const apColor: Record<number, string> = {
      1: "#22C55E",
      2: "#EAB308",
      3: "#EF4444",
    };

    // Group tasks by sprint
    const bySprint = new Map<string, typeof tasks>();
    tasks.forEach((t) => {
      if (!bySprint.has(t.sprint.label)) bySprint.set(t.sprint.label, []);
      bySprint.get(t.sprint.label)!.push(t);
    });

    const totalOpen = tasks.filter((t) => t.status === "open").length;
    const totalInProgress = tasks.filter((t) => t.status === "in_progress").length;
    const totalCompleted = tasks.filter((t) => t.status === "completed").length;
    const totalAP = tasks.reduce((s, t) => s + t.action_points, 0);

    const sprintSections = Array.from(bySprint.entries())
      .map(([sprint, sprintTasks]) => {
        const rows = sprintTasks
          .map(
            (t) => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">${t.id}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">${escapeHtml(t.title)}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">
              <span style="display:inline-flex;align-items:center;gap:5px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${t.location.color};display:inline-block;"></span>
                ${escapeHtml(t.location.name)}
              </span>
            </td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">${statusLabel[t.status] ?? t.status}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center;">
              <span style="background:${apColor[t.action_points] ?? "#6B7280"};color:white;border-radius:9999px;padding:1px 8px;font-size:12px;font-weight:600;">${t.action_points}</span>
            </td>
            <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#9ca3af;">${t.external_ticket_id ?? "–"}</td>
          </tr>`
          )
          .join("");

        return `
        <div style="margin-bottom:28px;">
          <h2 style="font-size:15px;font-weight:700;color:#374151;margin:0 0 10px 0;padding-bottom:6px;border-bottom:2px solid #e5e7eb;">${escapeHtml(sprint)}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:7px 10px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">ID</th>
                <th style="padding:7px 10px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Titel</th>
                <th style="padding:7px 10px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Standort</th>
                <th style="padding:7px 10px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Status</th>
                <th style="padding:7px 10px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;">AP</th>
                <th style="padding:7px 10px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Ticket</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ressourcify – Report ${new Date().toLocaleDateString("de-DE")}</title>
  <style>
    @media print { body { margin: 0; } .no-print { display: none; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; margin: 0; padding: 0; background: #f9fafb; }
    .container { max-width: 960px; margin: 0 auto; padding: 32px 24px; background: white; min-height: 100vh; }
  </style>
</head>
<body>
<div class="container">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:1px solid #e5e7eb;">
    <div>
      <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0;">ressourcify – Report</h1>
      <p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">Erstellt am ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}</p>
    </div>
    <button class="no-print" onclick="window.print()" style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;cursor:pointer;">Drucken / PDF</button>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:32px;">
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">Gesamt Aufgaben</p>
      <p style="font-size:26px;font-weight:800;color:#111827;margin:0;">${tasks.length}</p>
    </div>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">Offen</p>
      <p style="font-size:26px;font-weight:800;color:#374151;margin:0;">${totalOpen}</p>
    </div>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">In Bearbeitung</p>
      <p style="font-size:26px;font-weight:800;color:#2563eb;margin:0;">${totalInProgress}</p>
    </div>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 4px;">Abgeschlossen</p>
      <p style="font-size:26px;font-weight:800;color:#16a34a;margin:0;">${totalCompleted}</p>
    </div>
  </div>
  <div style="background:#eff6ff;border-radius:10px;padding:12px 16px;margin-bottom:32px;display:inline-block;">
    <span style="font-size:13px;color:#1d4ed8;font-weight:600;">Gesamt Action Points: ${totalAP} AP</span>
  </div>

  ${sprintSections}
</div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="sprintboard-report-${new Date().toISOString().slice(0, 10)}.html"`,
      },
    });
  } catch {
    return serverError();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
