import { PrismaClient, UserRole, TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_AP_BUDGET = parseInt(process.env.DEFAULT_AP_BUDGET ?? "50");

function getSprintLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

async function main() {
  console.log("Starte Seed...");

  // 1. Admin-User anlegen
  const hashedPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@sprintboard.local" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@sprintboard.local",
      password: hashedPassword,
      role: UserRole.admin,
      locale: "de",
    },
  });
  console.log(`✓ Admin-User erstellt: ${admin.email}`);

  // Beispiel-User: Sales und Viewer
  const salesHash = await bcrypt.hash("sales123", 12);
  const salesUser = await prisma.user.upsert({
    where: { email: "sales@sprintboard.local" },
    update: {},
    create: {
      name: "Anna Müller",
      email: "sales@sprintboard.local",
      password: salesHash,
      role: UserRole.sales,
      locale: "de",
    },
  });
  console.log(`✓ Sales-User erstellt: ${salesUser.email}`);

  const viewerHash = await bcrypt.hash("viewer123", 12);
  const viewerUser = await prisma.user.upsert({
    where: { email: "viewer@sprintboard.local" },
    update: {},
    create: {
      name: "Max Berger",
      email: "viewer@sprintboard.local",
      password: viewerHash,
      role: UserRole.viewer,
      locale: "de",
    },
  });
  console.log(`✓ Viewer-User erstellt: ${viewerUser.email}`);

  // 2. Standorte anlegen
  const locationsData = [
    { name: "Berlin", color: "#3B82F6", default_action_points: 50 },
    { name: "München", color: "#EF4444", default_action_points: 45 },
    { name: "Hamburg", color: "#10B981", default_action_points: 40 },
    { name: "Frankfurt", color: "#F59E0B", default_action_points: 35 },
  ];

  const locations = [];
  for (const loc of locationsData) {
    const existing = await prisma.location.findFirst({ where: { name: loc.name } });
    const location = existing
      ? await prisma.location.update({
          where: { id: existing.id },
          data: { color: loc.color, default_action_points: loc.default_action_points },
        })
      : await prisma.location.create({ data: loc });
    locations.push(location);
    console.log(`✓ Standort erstellt: ${location.name}`);
  }

  // 3. User-Location-Zuordnungen (Admin → alle Standorte, Sales → Berlin + München)
  for (const location of locations) {
    await prisma.userLocation.upsert({
      where: {
        user_id_location_id: { user_id: admin.id, location_id: location.id },
      },
      update: {},
      create: { user_id: admin.id, location_id: location.id },
    });
  }
  for (const location of locations.slice(0, 2)) {
    await prisma.userLocation.upsert({
      where: {
        user_id_location_id: { user_id: salesUser.id, location_id: location.id },
      },
      update: {},
      create: { user_id: salesUser.id, location_id: location.id },
    });
  }
  console.log("✓ User-Location-Zuordnungen erstellt");

  // 4. Sprints für die nächsten 6 Monate
  const now = new Date();
  const sprints = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const label = getSprintLabel(year, month);

    const sprint = await prisma.sprint.upsert({
      where: { year_month_week: { year, month, week: 0 } },
      update: { label },
      create: { year, month, week: 0, label },
    });
    sprints.push(sprint);

    // Sprint-Kapazitäten für jeden Standort
    for (const location of locations) {
      const maxAP = location.default_action_points ?? DEFAULT_AP_BUDGET;
      await prisma.sprintCapacity.upsert({
        where: {
          sprint_id_location_id: { sprint_id: sprint.id, location_id: location.id },
        },
        update: { max_action_points: maxAP },
        create: {
          sprint_id: sprint.id,
          location_id: location.id,
          max_action_points: maxAP,
        },
      });
    }
    console.log(`✓ Sprint erstellt: ${label}`);
  }

  // 5. Beispiel-Aufgaben verteilt über die ersten 3 Sprints
  type TaskInput = {
    title: string;
    description: string;
    action_points: number;
    location_name: string;
    sprint_offset: number;
    status: TaskStatus;
    priority: number;
    external_ticket_id?: string;
  };

  const taskTemplates: TaskInput[] = [
    {
      title: "Server-Migration Rechenzentrum",
      description: "Migration aller Server auf neue Hardware im Rechenzentrum",
      action_points: 3,
      location_name: "Berlin",
      sprint_offset: 0,
      status: TaskStatus.in_progress,
      priority: 1,
      external_ticket_id: "TICKET-001",
    },
    {
      title: "Firewall-Regelwerk aktualisieren",
      description: "Überprüfung und Aktualisierung aller Firewall-Regeln",
      action_points: 2,
      location_name: "Berlin",
      sprint_offset: 0,
      status: TaskStatus.open,
      priority: 2,
      external_ticket_id: "TICKET-002",
    },
    {
      title: "Netzwerk-Monitoring einrichten",
      description: "Grafana/Prometheus für Netzwerk-Monitoring aufsetzen",
      action_points: 2,
      location_name: "Berlin",
      sprint_offset: 0,
      status: TaskStatus.open,
      priority: 3,
    },
    {
      title: "VPN-Tunnel konfigurieren",
      description: "Site-to-Site VPN zwischen Berlin und München",
      action_points: 1,
      location_name: "München",
      sprint_offset: 0,
      status: TaskStatus.completed,
      priority: 1,
      external_ticket_id: "TICKET-003",
    },
    {
      title: "Backup-Strategie überarbeiten",
      description: "3-2-1 Backup-Strategie für alle kritischen Systeme",
      action_points: 3,
      location_name: "München",
      sprint_offset: 0,
      status: TaskStatus.open,
      priority: 2,
    },
    {
      title: "SSL-Zertifikate erneuern",
      description: "Ablaufende SSL-Zertifikate rechtzeitig erneuern",
      action_points: 1,
      location_name: "Hamburg",
      sprint_offset: 0,
      status: TaskStatus.open,
      priority: 1,
      external_ticket_id: "TICKET-004",
    },
    {
      title: "Datenbank-Optimierung",
      description: "Slow Queries analysieren und Indizes optimieren",
      action_points: 2,
      location_name: "Hamburg",
      sprint_offset: 0,
      status: TaskStatus.in_progress,
      priority: 2,
    },
    {
      title: "IT-Sicherheitsaudit",
      description: "Jährliches Sicherheitsaudit nach BSI-Grundschutz",
      action_points: 3,
      location_name: "Frankfurt",
      sprint_offset: 0,
      status: TaskStatus.open,
      priority: 1,
      external_ticket_id: "TICKET-005",
    },
    {
      title: "Load-Balancer Setup",
      description: "HAProxy Load-Balancer für Webdienste konfigurieren",
      action_points: 2,
      location_name: "Berlin",
      sprint_offset: 1,
      status: TaskStatus.open,
      priority: 1,
      external_ticket_id: "TICKET-006",
    },
    {
      title: "Container-Orchestrierung evaluieren",
      description: "Kubernetes vs. Docker Swarm für interne Anwendungen",
      action_points: 3,
      location_name: "München",
      sprint_offset: 1,
      status: TaskStatus.open,
      priority: 1,
    },
    {
      title: "E-Mail-Server Migration",
      description: "Exchange Server auf neuere Version migrieren",
      action_points: 3,
      location_name: "Hamburg",
      sprint_offset: 1,
      status: TaskStatus.open,
      priority: 1,
      external_ticket_id: "TICKET-007",
    },
    {
      title: "Active Directory Bereinigung",
      description: "Inaktive Konten deaktivieren, GPOs überarbeiten",
      action_points: 2,
      location_name: "Frankfurt",
      sprint_offset: 1,
      status: TaskStatus.open,
      priority: 1,
    },
    {
      title: "WLAN-Infrastruktur modernisieren",
      description: "Wi-Fi 6 Access Points in allen Büros installieren",
      action_points: 3,
      location_name: "Berlin",
      sprint_offset: 2,
      status: TaskStatus.open,
      priority: 1,
      external_ticket_id: "TICKET-008",
    },
    {
      title: "Disaster-Recovery-Plan erstellen",
      description: "Vollständigen DR-Plan dokumentieren und testen",
      action_points: 2,
      location_name: "München",
      sprint_offset: 2,
      status: TaskStatus.open,
      priority: 1,
    },
  ];

  const locationMap = new Map(locations.map((l) => [l.name, l]));

  let taskPriority = 100;
  for (const template of taskTemplates) {
    const location = locationMap.get(template.location_name);
    if (!location) continue;

    const sprint = sprints[template.sprint_offset];
    if (!sprint) continue;

    const completedAt =
      template.status === TaskStatus.completed ? new Date() : null;

    await prisma.task.create({
      data: {
        title: template.title,
        description: template.description,
        action_points: template.action_points,
        location_id: location.id,
        sprint_id: sprint.id,
        status: template.status,
        priority: template.priority,
        external_ticket_id: template.external_ticket_id ?? null,
        completed_at: completedAt,
        created_by: admin.id,
      },
    });
    taskPriority++;
  }
  console.log(`✓ ${taskTemplates.length} Beispiel-Aufgaben erstellt`);

  // Activity-Log-Einträge für die erstellten Aufgaben
  await prisma.activityLog.create({
    data: {
      user_id: admin.id,
      action: "user_created",
      target_type: "user",
      target_id: admin.id,
      details: { name: admin.name, role: admin.role },
    },
  });

  console.log("\n✅ Seed erfolgreich abgeschlossen!");
  console.log("\n--- Test-Zugangsdaten ---");
  console.log("Admin:  admin@sprintboard.local  / admin123");
  console.log("Sales:  sales@sprintboard.local  / sales123");
  console.log("Viewer: viewer@sprintboard.local / viewer123");
  console.log("\n⚠️  Bitte Passwörter nach dem ersten Login ändern!");
}

main()
  .catch((e) => {
    console.error("Seed-Fehler:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
