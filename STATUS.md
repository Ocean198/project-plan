# SprintBoard – Projektstatus

## Übersicht

| Phase | Titel | Status |
|-------|-------|--------|
| Phase 1 | Fundament | ✅ Abgeschlossen |
| Phase 2 | Kern-Logik | ✅ Abgeschlossen |
| Phase 3 | Kanban-Board UI | ✅ Abgeschlossen |
| Phase 4 | Navigation & Suche | ✅ Abgeschlossen |
| Phase 5 | Dashboard & Listen | ✅ Abgeschlossen |
| Phase 6 | Admin & Integration | ✅ Abgeschlossen |
| Phase 7 | Internationalisierung & Polish | ✅ Abgeschlossen |

---

## Phase 1 – Fundament ✅

**Abgeschlossen am:** 06.03.2026

### Erledigte Aufgaben

#### 1. Next.js-Projekt aufgesetzt
- Next.js 16 mit App Router und Turbopack
- TypeScript (strict mode)
- Tailwind CSS 3
- ESLint
- Konfigurationsdateien: `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `tsconfig.json`

#### 2. Prisma-Schema definiert und Datenbank migriert
- ORM: Prisma 6, Datenbank: MySQL (`mysql://sprintboard:***@localhost:3306/sprintboard`)
- Schema-Datei: `prisma/schema.prisma`
- Synchronisiert via `prisma db push` (Shadow-DB-Rechte nicht verfügbar, daher kein `migrate dev`)
- Alle 9 Tabellen angelegt:
  - `locations` – Standorte mit Farbcode und AP-Budget
  - `sprints` – Monatliche Sprints mit Lock-Status
  - `sprint_capacities` – AP-Budget pro Standort pro Sprint
  - `tasks` – Aufgaben mit Status, Priorität, AP-Wert
  - `users` – User mit Rollen und Locale
  - `user_locations` – Zuordnung User ↔ Standorte
  - `notifications` – In-App-Benachrichtigungen
  - `activity_log` – Aktivitätsprotokoll (polymorpher `target_id`)
  - `webhook_endpoints` – Webhook-Konfiguration
- Alle Enums definiert: `SprintLockStatus`, `TaskStatus`, `UserRole`, `UserLocale`, `NotificationType`, `ActivityAction`, `ActivityTargetType`, `WebhookStatus`

#### 3. Seed-Skript erstellt
- Datei: `prisma/seed.ts`
- Ausführen: `npm run db:seed`
- Erstellt beim Ausführen:
  - 3 User (Admin, Sales, Viewer) mit gehashten Passwörtern (bcrypt)
  - 4 Standorte: Berlin (#3B82F6, 50 AP), München (#EF4444, 45 AP), Hamburg (#10B981, 40 AP), Frankfurt (#F59E0B, 35 AP)
  - User-Location-Zuordnungen (Admin → alle, Sales → Berlin + München)
  - 6 Monate Sprints (März–August 2026) mit Sprint-Kapazitäten pro Standort
  - 14 Beispiel-Aufgaben verteilt über die ersten 3 Sprints

**Test-Zugangsdaten:**
| Rolle | E-Mail | Passwort |
|-------|--------|----------|
| Admin | admin@sprintboard.local | admin123 |
| Sales | sales@sprintboard.local | sales123 |
| Viewer | viewer@sprintboard.local | viewer123 |

#### 4. NextAuth eingerichtet
- NextAuth v5 (beta.25) mit Credentials Provider
- Session-Strategie: JWT
- JWT enthält: `id`, `role` (viewer/sales/admin), `locale`
- Konfiguration: `src/lib/auth.ts`
- API-Route: `src/app/api/auth/[...nextauth]/route.ts`
- Login-Seite: `src/app/(auth)/login/page.tsx`
- Route-Schutz via `src/proxy.ts` (Next.js 16: "proxy" statt "middleware")
- Weiterleitung: nicht eingeloggt → `/login`, eingeloggt + `/login` → `/board`

### Projektstruktur nach Phase 1

```
sprintboard/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── api/auth/[...nextauth]/route.ts
│   │   ├── board/page.tsx          (Platzhalter)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                (Redirect → /board)
│   ├── lib/
│   │   ├── auth.ts
│   │   └── prisma.ts
│   ├── proxy.ts                    (Route-Schutz)
│   └── types/
│       └── index.ts
├── .env
├── .env.example
├── .gitignore
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

---

## Phase 2 – Kern-Logik ✅

**Abgeschlossen am:** 06.03.2026

### Erledigte Aufgaben

#### `src/lib/capacity.ts`
- `getUsedAP` / `getMaxAP` / `getRemainingAP` – AP-Summierung pro Sprint/Standort (inkl. abgeschlossene Tasks)
- `findEarliestSprintWithCapacity` – Overflow-Logik: findet frühesten offenen Sprint mit Kapazität, erzeugt neuen bei Bedarf
- `previewCascade` – Dry-Run-Simulation ohne DB-Änderungen; gibt betroffene Tasks und Ziel-Sprints zurück
- `executeCascade` – Verschiebung + Cascade in einer DB-Transaktion; erzeugt neue Sprints wenn nötig; verschiebt niemals abgeschlossene Tasks

#### `src/lib/sprint-manager.ts`
- `createSprint` – Sprint anlegen + automatisch `sprint_capacities` für alle aktiven Standorte
- `ensureMinimumFutureSprints` – Sichert mindestens 3 offene Zukunfts-Sprints
- `setSprintLockStatus` – Lock-Übergang prüfen und ausführen (open ↔ soft_locked ↔ hard_locked)
- `createCapacitiesForNewLocation` – Kapazitäten für neue Standorte in allen offenen Sprints anlegen
- `getSprintsWithCapacity` – Alle Sprints mit berechnetem AP-Verbrauch pro Standort

#### `src/lib/activity-logger.ts`
- Generische `logActivity` + typisierte Convenience-Funktionen für alle 11 Aktionstypen

#### `src/lib/notification-service.ts`
- `notifyLocationUsers` – Benachrichtigt alle zugeordneten User (Admins immer, Sales/Viewer via `user_locations`)
- Spezialisierte Funktionen: `notifyCascade`, `notifySprintLocked`, `notifyCapacityChanged`, `notifyTaskImported`

#### `src/lib/api-helpers.ts`
- Session-Check, Rollen-Prüfung, einheitliche Error-Responses (400/401/403/404/409/500)

#### API-Routes
| Route | Methoden | Beschreibung |
|-------|----------|--------------|
| `/api/tasks` | GET, POST | Task-Liste (gefiltert, paginiert) + Task erstellen |
| `/api/tasks/[id]` | GET, PATCH, DELETE | Einzelner Task: lesen, aktualisieren, löschen (Admin) |
| `/api/tasks/move` | POST | Verschiebung + Cascade + Log + Notifications |
| `/api/tasks/move/preview` | POST | Cascade Dry-Run ohne DB-Änderungen |
| `/api/tasks/import` | POST | Externer Import via API-Key (409 bei doppelter Ticket-ID) |
| `/api/sprints` | GET | Alle Sprints mit AP-Auslastung |
| `/api/sprints/[id]` | GET, PATCH | Sprint-Details + AP-Budget-Anpassung (Admin) |
| `/api/sprints/[id]/lock` | POST | Lock-Status ändern (Admin) + Notifications |
| `/api/search` | GET | Globale Suche (min. 2 Zeichen, max. 10 Ergebnisse) |
| `/api/activity` | GET | Aktivitätslog (gefiltert, paginiert) |
| `/api/notifications` | GET, PATCH | Eigene Notifications + alle als gelesen markieren |
| `/api/notifications/[id]` | PATCH | Einzelne Notification als gelesen markieren |
| `/api/locations` | GET, POST, PATCH | Standorte lesen/anlegen/bearbeiten |
| `/api/users` | GET, POST | User-Verwaltung (Admin) |

---

## Phase 3 – Kanban-Board UI ✅

**Abgeschlossen am:** 06.03.2026

### Erledigte Aufgaben

#### Neue Pakete
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@dnd-kit/modifiers`

#### Neue Typen
- `src/types/board.ts` – `BoardTask`, `BoardSprint`, `SprintCapacityInfo`, `CascadePreview`, `ActiveFilters`

#### Routing & Layout
- `src/app/(app)/layout.tsx` – Auth-Guard + `AppShell` (Sidebar) für alle geschützten Seiten
- `src/app/(app)/board/page.tsx` – Board-Seite (Server Component, gibt Rolle an Client-Board weiter)
- `src/components/shared/AppShell.tsx` – Wrapper mit Sidebar + Main-Content
- `src/components/shared/Sidebar.tsx` – Collapsible Sidebar mit Icons, aktiver Seite, User-Footer, Abmelden

#### Board-Komponenten
- `src/components/board/KanbanBoard.tsx` – Hauptkomponente mit DndContext, Drag-Handlers, Cascade-Flow, Toast
- `src/components/board/SprintColumn.tsx` – Sprint-Spalte mit Header, Lock-Anzeige, Kapazitätsbalken, Droppable
- `src/components/board/TaskCard.tsx` – Aufgabenkarte (Sortable) mit AP-Badge, Standort-Farbstreifen, Status; `TaskCardOverlay` für DragOverlay
- `src/components/board/CapacityBar.tsx` – AP-Balken pro Standort (grün→gelb→orange→rot je Auslastung)
- `src/components/board/FilterBar.tsx` – Standort-Chips (farbig) + Status-Filter-Chips, "Filter zurücksetzen"
- `src/components/board/CascadeConfirmDialog.tsx` – Modal mit aufklappbarer Aufgabenliste, gruppiert nach Ziel-Sprint
- `src/components/board/TaskDetailModal.tsx` – Vollständige Task-Ansicht mit Status-Änderung + Mini-Aktivitätslog

#### Hooks & Daten
- `src/hooks/useBoardData.ts` – Lädt Sprints + Tasks parallel, bietet `refetch()`

#### Implementierte Verhaltensweisen
- Drag & Drop zwischen Sprints → Preview → Cascade-Dialog wenn nötig → Ausführung
- Drag & Drop innerhalb eines Sprints → Priorisierung mit optimistischem Update
- Hard-locked Sprints: kein Drop möglich, gedimmte Darstellung
- Soft-locked Sprints: kein Drop von außen, Schloss-Icon
- Abgeschlossene Tasks: ausgegraut, kein Drag-Handle, durchgestrichen
- Filter: kombinierbar (Standort + Status), aktive Filter visuell hervorgehoben
- Toast-Benachrichtigungen bei Erfolg/Fehler

---

## Phase 4 – Navigation & Suche ✅

**Abgeschlossen am:** 06.03.2026

### Erledigte Aufgaben

#### `src/components/shared/Header.tsx`
- Globales Suchfeld (integriert GlobalSearch)
- Sprach-Umschalter DE/EN (speichert in DB via `PATCH /api/users/me`)
- Benachrichtigungs-Glocke (NotificationBell)
- User-Avatar-Menü mit Rolle, Sprach-Umschalter und Abmelden

#### `src/components/shared/GlobalSearch.tsx`
- Cmd/Ctrl+K öffnet Suche, Escape schließt
- 300ms Debounce, min. 2 Zeichen
- Live-Ergebnisse als Dropdown (max. 10): Titel, Standort-Farbpunkt, Sprint, Status
- Tastatur-Navigation (↑↓ + Enter)
- Klick außerhalb schließt Dropdown

#### `src/components/shared/NotificationBell.tsx`
- Glocken-Icon mit rotem Unread-Badge (Zahl)
- Slide-in-Panel mit letzten 50 Benachrichtigungen
- Auto-Refresh alle 30 Sekunden
- „Alle als gelesen markieren"-Button
- Einzelne Notification als gelesen markieren (blauer Punkt)
- Relative Zeitanzeige (z. B. „vor 5 Min.")

#### `src/app/api/users/me/route.ts`
- `GET /api/users/me` – eigenes Profil abrufen
- `PATCH /api/users/me` – Locale aktualisieren

#### Platzhalter-Seiten (für Phase 5/6/7)
- `/dashboard`, `/list`, `/activity`, `/admin` – je mit „Wird in Phase X implementiert"-Hinweis

---

## Phase 5 – Dashboard & Listen ✅

**Abgeschlossen am:** 06.03.2026

### Neue Pakete
- `recharts` – Diagramm-Bibliothek

### Neue API-Routes
| Route | Methoden | Beschreibung |
|-------|----------|--------------|
| `/api/dashboard` | GET | Kapazitätsübersicht, Velocity, Warnungen, Zusammenfassung |
| `/api/export` | GET | CSV- und HTML/PDF-Export aller Aufgaben |

### Dashboard (`/dashboard`)
- `src/app/(app)/dashboard/page.tsx` + `DashboardClient.tsx`
- Zusammenfassungs-Kacheln: Offene / In Bearbeitung / Abgeschlossene Aufgaben
- Sprint-Warnungen (Banner): alle Standort-Sprint-Kombinationen mit ≥ 90 % Auslastung
- Aktuelle Sprint-Kacheln pro Standort (`CapacitySummaryCards`)
- AP-Auslastungsdiagramm (BarChart, je Standort, nächste 6 Sprints, 90%-Referenzlinie)
- Velocity-Tracking (LineChart, abgeschlossene AP pro Monat, letzte 12 Sprints, 6-Monats-Durchschnitt)
- Export-Buttons für CSV und PDF/HTML (Admin/Sales)

### Listenansicht (`/list`)
- `src/app/(app)/list/page.tsx` + `ListClient.tsx`
- Vollständige Tabelle aller Aufgaben mit Paginierung (25 pro Seite)
- Suche (Debounce, Titel/Beschreibung/Ticket-ID)
- Filter: Status, Standort, Sprint
- Sortierung (klickbare Spalten-Header): Sprint, Priorität, Status, AP, Standort
- Export-Buttons (CSV + HTML-Report)

### Dashboard-Komponenten
- `src/components/dashboard/CapacityOverview.tsx` – BarCharts + Farbskala-Legende
- `src/components/dashboard/SprintWarnings.tsx` – Orange Warnbanner
- `src/components/dashboard/VelocityChart.tsx` – LineChart + Durchschnittskarten

---

## Phase 6 – Admin & Integration ✅

**Abgeschlossen am:** 06.03.2026

### Admin-Bereich (`/admin`)

Tabbed-Navigation mit 4 Bereichen (nur für Admins zugänglich, Redirect für andere Rollen):

#### Standorte (`/admin/locations`)
- Liste aller Standorte mit Farbpunkt, AP-Budget-Info, Aktiv/Inaktiv-Status
- Standort anlegen: Formular mit Farbpicker (Preset-Farben + nativer Color-Input + Hex-Feld)
- Standort bearbeiten: Inline-Formular
- Standort aktivieren/deaktivieren

#### User (`/admin/users`)
- Liste aller User mit Avatar-Initial, Rolle (farbiger Badge), E-Mail, Standort-Punkte
- User anlegen: Name, E-Mail, Passwort, Rolle, Sprache, Standort-Zuordnung (Multi-Select als Chips)
- User bearbeiten: Alle Felder inkl. optionale Passwort-Änderung
- `PATCH /api/users` – neuer Endpoint zum Aktualisieren von Usern

#### Sprints (`/admin/sprints`)
- Liste aller Sprints mit Lock-Status-Badge
- Lock-Buttons: „Soft-Lock" / „Hard-Lock" / „Entsperren" mit Bestätigungs-Dialog
- AP-Budget-Anpassung: aufklappbare Sektion pro Sprint mit Inline-Eingabefeldern je Standort

#### Webhooks (`/admin/webhooks`)
- Liste aller Webhooks mit Name, URL, Events, Last-Status, Letzter Versand
- Webhook anlegen/bearbeiten: Name, URL, Secret (mit Generator), Event-Auswahl als Toggle-Buttons
- Testbutton: sendet Test-Payload, zeigt Ergebnis inline
- Aktivieren/Deaktivieren, Löschen (mit confirm-Dialog)
- Info-Banner: Signatur-Erklärung und Retry-Hinweis

### Neue API-Routes
| Route | Methoden | Beschreibung |
|-------|----------|--------------|
| `/api/users` | PATCH | User aktualisieren (Rolle, Name, Passwort, Standorte) |
| `/api/webhooks` | GET, POST | Webhooks auflisten + anlegen |
| `/api/webhooks/[id]` | PATCH, DELETE | Webhook bearbeiten/löschen |
| `/api/webhooks/[id]/test` | POST | Test-Payload senden |

### `src/lib/webhook.ts`
- `sendWebhook`: Einzelner HTTP-Request mit HMAC-SHA256-Signatur im Header `X-SprintBoard-Signature: sha256=<hash>`
- `sendWithRetry`: 3 Versuche mit exponential Backoff (1s, 5s, 30s), aktualisiert `last_status`
- `triggerWebhooks`: Fire-and-forget; lädt alle aktiven Webhooks, filtert auf abonniertes Event
- Integriert in: `PATCH /api/tasks/[id]` (task_completed), `POST /api/tasks/move` (task_moved + cascade_triggered)

---

## Phase 7 – Internationalisierung & Polish ✅

**Abgeschlossen am:** 06.03.2026

### next-intl (DE + EN)
- `next-intl` installiert und konfiguriert (`next.config.ts` via `createNextIntlPlugin`)
- Locale-Erkennung via Cookie (`locale`) – gesetzt beim Sprach-Wechsel im Header
- `src/i18n/request.ts` – Cookie-basierter Locale-Resolver
- `messages/de.json` + `messages/en.json` – vollständige Übersetzungen für alle UI-Bereiche
- `NextIntlClientProvider` in `(app)/layout.tsx` eingebunden
- Header: Locale-Cookie wird beim Wechsel gesetzt + Seiten-Reload

### Toast-System + Undo
- **Undo-Funktion** nach Task-Verschiebungen: 5-Sekunden-Toast mit „Rückgängig"-Button
- Reverse-Move: Undo ruft `/api/tasks/move` mit original Sprint-ID auf
- Toast schließbar via ✕-Button, Timer resettet bei erneutem Toast
- `useRef` für Timer-Management (kein Memory Leak)

### Aktivitätslog-Seite (`/activity`)
- Vollständige Implementierung: Timeline-Darstellung mit Gruppen nach Datum
- Farbige Icons pro Aktionstyp (12 Aktionen)
- Menschenlesbare Aktionsbeschreibungen mit Details (z.B. „Von März 2026 → April 2026")
- Relative Zeitanzeige mit Tooltip für exaktes Datum
- Filter: Aktionstyp
- Paginierung (30 Einträge pro Seite)
- Skeleton-Loading-States

### Login-Seite (finales Design)
- Split-Layout: linkes Branding-Panel mit Gradient (nur Desktop), rechts Formular
- Feature-Kacheln im Branding-Panel
- Animierter Lade-Spinner im Submit-Button
- Verbessertes Error-Feedback mit Icon
- Mobile: Logo-Header statt Split-Layout

### Willkommens-Screen
- `src/components/shared/WelcomeScreen.tsx` – einmaliges Overlay nach erstem Login
- localStorage-basiert (`sprintboard_welcomed`), nie wieder angezeigt nach Bestätigung
- Erklärt 3 Kern-Features: Kanban, Dashboard, Cmd+K Suche
- Eingebunden in `AppShell`
