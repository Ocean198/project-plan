import { prisma } from './prisma';

export const PERMISSION_DEFS = {
  'board.move_tasks':           { label: 'Tasks verschieben (Drag & Drop)', group: 'Board' },
  'board.change_status':        { label: 'Task-Status ändern',              group: 'Board' },
  'board.edit_story_points':    { label: 'Story Points bearbeiten',         group: 'Board' },
  'board.change_location':      { label: 'Standort eines Tasks ändern',     group: 'Board' },
  'board.create_tasks':         { label: 'Tasks erstellen',                 group: 'Board' },
  'board.delete_tasks':         { label: 'Task löschen',                    group: 'Board' },
  'board.reopen_tasks':         { label: 'Abgeschlossene Tasks wieder öffnen', group: 'Board' },
  'sprints.lock_unlock':        { label: 'Sprint sperren / entsperren',     group: 'Sprints' },
  'sprints.archive':            { label: 'Sprint archivieren',              group: 'Sprints' },
  'settings.access':            { label: 'Settings-Menü aufrufen',          group: 'Settings' },
  'settings.manage_users':      { label: 'Benutzer verwalten',              group: 'Settings' },
  'settings.manage_locations':  { label: 'Standorte verwalten',             group: 'Settings' },
  'settings.manage_webhooks':   { label: 'Webhooks verwalten',              group: 'Settings' },
  'settings.view_activity':     { label: 'Aktivitätslog einsehen',          group: 'Settings' },
} as const;

export type PermissionKey = keyof typeof PERMISSION_DEFS;
export type RolePermissions = Record<PermissionKey, string[]>;

export const DEFAULT_PERMISSIONS: RolePermissions = {
  'board.move_tasks':           ['sales'],
  'board.change_status':        ['sales'],
  'board.edit_story_points':    ['viewer'],
  'board.change_location':      ['sales'],
  'board.create_tasks':         ['sales'],
  'board.delete_tasks':         [],
  'board.reopen_tasks':         [],
  'sprints.lock_unlock':        [],
  'sprints.archive':            [],
  'settings.access':            [],
  'settings.manage_users':      [],
  'settings.manage_locations':  [],
  'settings.manage_webhooks':   [],
  'settings.view_activity':     [],
};

export function can(role: string, permission: PermissionKey, permissions: RolePermissions): boolean {
  if (role === 'admin') return true;
  return permissions[permission]?.includes(role) ?? false;
}

// Server-side: 30s in-memory cache
let _cached: RolePermissions | null = null;
let _cachedAt = 0;

export async function getPermissions(): Promise<RolePermissions> {
  const now = Date.now();
  if (_cached && now - _cachedAt < 30_000) return _cached;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: 'role_permissions' } });
    _cached = row
      ? { ...DEFAULT_PERMISSIONS, ...JSON.parse(row.value) }
      : { ...DEFAULT_PERMISSIONS };
  } catch {
    _cached = { ...DEFAULT_PERMISSIONS };
  }
  _cachedAt = now;
  return _cached!;
}

export function invalidatePermissionsCache() {
  _cached = null;
}
