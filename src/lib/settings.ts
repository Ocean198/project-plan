import { prisma } from "@/lib/prisma";

export type SprintMode = "monthly" | "weekly" | "numbered";

export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getSprintMode(): Promise<SprintMode> {
  const value = await getSetting("sprint_mode");
  if (value === "weekly" || value === "numbered") return value;
  return "monthly";
}
