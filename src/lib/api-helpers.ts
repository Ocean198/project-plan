/**
 * Gemeinsame Hilfsfunktionen für API-Routes:
 * - Session-Prüfung mit Rollen-Check
 * - Einheitliche Error-Responses
 */

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

export type ApiSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    locale: string;
  };
};

/** Liest die aktuelle Session. Gibt null zurück, wenn nicht eingeloggt. */
export async function getSession(): Promise<ApiSession | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session as ApiSession;
}

/** Prüft, ob der User mindestens eine der erlaubten Rollen hat. */
export function hasRole(session: ApiSession, ...roles: UserRole[]): boolean {
  return roles.includes(session.user.role);
}

/** 401 – Nicht authentifiziert */
export function unauthorized(message = "Nicht authentifiziert") {
  return NextResponse.json({ error: message }, { status: 401 });
}

/** 403 – Keine Berechtigung */
export function forbidden(message = "Keine Berechtigung") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** 400 – Ungültige Anfrage */
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** 404 – Nicht gefunden */
export function notFound(message = "Nicht gefunden") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** 409 – Konflikt */
export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

/** 500 – Interner Fehler */
export function serverError(message = "Interner Serverfehler") {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Parst den Request-Body als JSON; gibt null zurück bei Fehler */
export async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
