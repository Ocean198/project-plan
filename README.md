# ressourcify

**Version 1.1** · Standortbasiertes Sprint- und Kapazitätsmanagement-Tool. Ermöglicht Teams, Story Points über mehrere Standorte hinweg zu planen, Sprints zu verwalten und den Fortschritt in Echtzeit zu verfolgen.

---

## Inhaltsverzeichnis

1. [Überblick](#überblick)
2. [Tech-Stack](#tech-stack)
3. [Voraussetzungen](#voraussetzungen)
4. [Installation & Setup](#installation--setup)
5. [Umgebungsvariablen](#umgebungsvariablen)
6. [Datenbank-Setup](#datenbank-setup)
7. [Rollen & Berechtigungen](#rollen--berechtigungen)
8. [Features im Überblick](#features-im-überblick)
9. [CSV-Import](#csv-import)
10. [REST-API (extern)](#rest-api-extern)
11. [Webhooks](#webhooks)
12. [Deployment (Produktion)](#deployment-produktion)

---

## Überblick

ressourcify löst das Problem der standortübergreifenden Kapazitätsplanung: Jeder Standort hat ein eigenes SP-Budget pro Sprint. Wenn ein Sprint voll ist, werden neue Aufgaben automatisch in den nächsten Sprint mit freier Kapazität verschoben (**Cascade-Logik**). Das Tool richtet sich an Projektmanager, Team Leads und Vertriebsteams, die gemeinsam Sprints befüllen.

---

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Framework | Next.js 16 (App Router) |
| Sprache | TypeScript |
| Styling | Tailwind CSS 3 |
| Datenbank | MySQL 8+ |
| ORM | Prisma 6 |
| Auth | NextAuth v5 (beta) – Credentials Provider |
| Drag & Drop | dnd-kit |
| Charts | Recharts |
| Prozessmanager | PM2 (Produktion) |

---

## Voraussetzungen

- **Node.js** ≥ 18
- **MySQL** 8+ (lokal oder remote)
- **npm** ≥ 9

---

## Installation & Setup

```bash
# 1. Repository klonen
git clone <repo-url>
cd sprintboard

# 2. Abhängigkeiten installieren
npm install

# 3. Umgebungsvariablen konfigurieren
cp .env.example .env
# → .env anpassen (siehe Abschnitt unten)

# 4. Datenbank anlegen (MySQL)
mysql -u root -p -e "CREATE DATABASE sprintboard; CREATE USER 'sprintboard'@'localhost' IDENTIFIED BY 'DEIN_PASSWORT'; GRANT ALL ON sprintboard.* TO 'sprintboard'@'localhost';"

# 5. Schema in Datenbank pushen
npm run db:push

# 6. Seed-Daten einspielen (Demo-Daten + Admin-User)
npm run db:seed

# 7. Entwicklungsserver starten
npm run dev
```

Die App ist dann unter `http://localhost:3000` erreichbar.

---

## Umgebungsvariablen

Datei: `.env` (auf Basis von `.env.example`)

| Variable | Beschreibung | Beispiel |
|---|---|---|
| `DATABASE_URL` | MySQL-Verbindungsstring | `mysql://user:pass@localhost:3306/sprintboard` |
| `NEXTAUTH_SECRET` | Zufälliger Secret für JWT-Signierung (≥ 32 Zeichen) | `openssl rand -base64 32` |
| `AUTH_SECRET` | Identisch mit `NEXTAUTH_SECRET` (NextAuth v5 benötigt beide) | — |
| `NEXTAUTH_URL` | Öffentliche URL der App | `https://app.example.com` |
| `API_KEY` | Bearer-Token für den externen Import-Endpunkt | Beliebiger langer zufälliger String |
| `DEFAULT_SP_BUDGET` | Standard-SP-Budget pro Sprint und Standort, wenn kein individuelles Budget gesetzt | `50` |

---

## Datenbank-Setup

### Schema anwenden

```bash
npm run db:push        # Schema auf DB anwenden (kein migrate dev nötig)
npm run db:generate    # Prisma Client neu generieren (nach Schema-Änderungen)
```

> **Hinweis:** `prisma migrate dev` erfordert eine Shadow-Datenbank. Falls der DB-Nutzer keine CREATE-Rechte hat, immer `db:push` verwenden.

### Seed-Daten

```bash
npm run db:seed
```

Legt folgende Testdaten an:

| Rolle | E-Mail | Passwort |
|---|---|---|
| Admin | `admin@sprintboard.local` | `admin123` |
| Sales | `sales@sprintboard.local` | `sales123` |
| User | `viewer@sprintboard.local` | `viewer123` |

Außerdem: 4 Standorte (Berlin, München, Hamburg, Frankfurt), 6 Monate Sprints und 14 Beispiel-Aufgaben.

### Prisma Studio (Datenbank-GUI)

```bash
npm run db:studio
```

---

## Rollen & Berechtigungen

Es gibt drei Rollen:

| Rolle | DB-Wert | Beschreibung |
|---|---|---|
| Admin | `admin` | Vollzugriff auf alle Funktionen und Settings |
| Sales | `sales` | Standardmäßig: Tasks verschieben, Status ändern |
| User | `viewer` | Standardmäßig: Story Points bearbeiten |

### Berechtigungen konfigurieren

Admins können unter **Einstellungen → Berechtigungen** festlegen, welche Rollen welche Aktionen ausführen dürfen. Admins haben immer alle Rechte und können nicht eingeschränkt werden.

| Permission-Key | Beschreibung | Standard (außer Admin) |
|---|---|---|
| `board.move_tasks` | Tasks per Drag & Drop verschieben | Sales |
| `board.change_status` | Task-Status ändern | Sales |
| `board.edit_story_points` | Story Points bearbeiten | User |
| `board.delete_tasks` | Tasks löschen | – |
| `board.reopen_tasks` | Abgeschlossene Tasks wieder öffnen | – |
| `board.change_location` | Standort eines Tasks ändern | Sales |
| `board.create_tasks` | Tasks manuell erstellen | Sales |
| `sprints.lock_unlock` | Sprints sperren / entsperren | – |
| `sprints.archive` | Sprints archivieren | – |
| `settings.access` | Settings-Menü aufrufen | – |
| `settings.manage_users` | Benutzer verwalten | – |
| `settings.manage_locations` | Standorte verwalten | – |
| `settings.manage_webhooks` | Webhooks verwalten | – |
| `settings.view_activity` | Aktivitätslog einsehen | – |

---

## Features im Überblick

### Kanban-Board

- Aufgaben sind per Drag & Drop zwischen Sprints verschiebbar
- Bei Kapazitätsüberschreitung: **Cascade** – andere Aufgaben werden automatisch in den nächsten Sprint verschoben (mit Vorschau-Dialog)
- Tasks mit Status `in_progress` sind gesperrt (kein Drag möglich)
- Beim Ablegen vor einem gesperrten Task: automatisches Einreihen dahinter
- **+ Aufgabe erstellen**-Button in der Filter-Leiste (Sales + Admin): öffnet Modal zur schnellen Task-Erstellung
- Globale Suche (Cmd/Ctrl+K): Klick auf Suchergebnis öffnet direkt das Task-Detail-Modal

### Sprint-Zustände

| Status | Bedeutung |
|---|---|
| `open` | Bearbeitbar, Tasks können hinzugefügt/verschoben werden |
| `soft_locked` | Sichtbar gesperrt, aber noch verschiebbar (Warnung) |
| `hard_locked` | Vollständig gesperrt, keine Änderungen möglich |

### Story Points

- Skala: 1–10
- Farb-Coding: 1–3 grün · 4–6 gelb · 7–10 rot
- Editierbar per Dropdown direkt im Task-Modal (auto-save)

### Task-Status

| Status | Beschreibung |
|---|---|
| `open` | Offen |
| `in_progress` | In Bearbeitung (sperrt Drag & Drop) |
| `completed` | Abgeschlossen |

### Dashboard

- Kapazitäts-Übersicht der nächsten 6 Sprints (Balkendiagramm)
- Velocity-Chart: abgeschlossene SP pro Standort über die letzten 12 Monate
- Sprint-Warnungen bei ≥ 90% Auslastung

### Task-Detail-Modal

Klick auf einen Task öffnet das Detail-Modal mit:
- Standort-Wechsel per Dropdown (direkt neben SP)
- Story Points editierbar per Dropdown (auto-save)
- Status-Änderung mit Buttons
- Kommentarfeld (wird im Aktivitätslog des Tasks gespeichert)
- Mini-Aktivitätslog des Tasks (zeigt Status-, Standort-, Kommentar- und Verschiebeaktionen)

### Aktivitätslog

Protokolliert alle relevanten Aktionen:

| Aktion | Beschreibung |
|---|---|
| `task_created` | Neue Aufgabe angelegt |
| `task_moved` | Aufgabe in anderen Sprint verschoben |
| `task_completed` | Aufgabe abgeschlossen |
| `task_status_changed` | Status geändert (z. B. Offen → In Bearbeitung) |
| `task_location_changed` | Standort geändert |
| `task_commented` | Kommentar hinzugefügt |
| `task_priority_changed` | Priorität geändert |
| `task_imported` | Aufgabe per Import angelegt |
| `cascade_triggered` | Automatische Weiterverschiebung ausgelöst |
| `sprint_locked` / `sprint_unlocked` | Sprint-Status geändert |
| `sprint_created` | Neuer Sprint angelegt |
| `capacity_changed` | SP-Budget eines Sprints geändert |
| `location_created` | Neuer Standort angelegt |
| `user_created` | Neuer Benutzer angelegt |

---

## CSV-Import

Admins können Aufgaben in Bulk über eine CSV-Datei importieren (**Einstellungen → Import**).

### CSV-Format

```csv
title,description,story_points,location_name,external_ticket_id
"Login-Bug beheben","Fehler beim SSO-Login",2,Berlin,JIRA-101
"Dashboard-Redesign",,5,München,
"API-Dokumentation","Swagger aktualisieren",1,Hamburg,JIRA-103
```

| Spalte | Pflicht | Beschreibung |
|---|---|---|
| `title` | ✓ | Aufgabentitel |
| `description` | – | Beschreibung (kann leer sein) |
| `story_points` | – | 1–10, Standard: `1` |
| `location_name` | ✓ | Muss exakt dem Standortnamen in den Einstellungen entsprechen |
| `external_ticket_id` | – | Externe Ticket-ID (z. B. JIRA-123); muss eindeutig sein |

### Ablauf

1. Datei hochladen (Drag & Drop oder Klick)
2. Vorschau-Tabelle prüfen
3. „Importieren" klicken
4. Ergebnisse: jede Zeile mit ✓ (Ziel-Sprint) oder ✗ (Fehlergrund)

Jede Aufgabe wird automatisch dem **frühestmöglichen Sprint mit freier Kapazität** zugewiesen.

Eine Vorlage kann direkt im Import-Tab heruntergeladen werden.

---

## REST-API (extern)

Für die maschinelle Integration (z. B. aus JIRA, GitHub Actions etc.) gibt es einen API-Endpunkt zum Importieren einzelner Tasks.

### `POST /api/tasks/import`

**Authentifizierung:** Bearer Token (`API_KEY` aus `.env`)

```http
POST /api/tasks/import
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

**Request-Body:**

```json
{
  "title": "Login-Bug beheben",
  "description": "Optionale Beschreibung",
  "action_points": 2,
  "location_name": "Berlin",
  "external_ticket_id": "JIRA-101"
}
```

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `title` | string | ✓ | Aufgabentitel |
| `description` | string | – | Beschreibung |
| `action_points` | number | – | 1–3, Standard: `1` |
| `location_id` | number | ✓* | Standort-ID (alternativ zu `location_name`) |
| `location_name` | string | ✓* | Standortname (alternativ zu `location_id`) |
| `external_ticket_id` | string | – | Eindeutige externe Ticket-ID |

*Entweder `location_id` oder `location_name` muss angegeben werden.

**Erfolgreiche Antwort (201):**

```json
{
  "id": 42,
  "title": "Login-Bug beheben",
  "action_points": 2,
  "location": "Berlin",
  "location_id": 1,
  "assigned_sprint": "März 2026",
  "sprint_id": 5,
  "status": "open"
}
```

**Fehler-Codes:**

| Code | Bedeutung |
|---|---|
| 401 | API-Key fehlt oder ungültig |
| 400 | Pflichtfelder fehlen oder ungültige Werte |
| 404 | Standort nicht gefunden oder deaktiviert |
| 409 | `external_ticket_id` existiert bereits |
| 500 | Interner Serverfehler |

---

## Webhooks

Webhooks ermöglichen Echtzeit-Benachrichtigungen an externe Systeme bei bestimmten Ereignissen.

### Konfiguration

Unter **Einstellungen → Webhooks** können Admins (mit entsprechender Berechtigung) Endpoints anlegen:
- URL des Empfängers
- Auswahl der Ereignisse

### Sicherheit

Jeder Request wird mit einem **HMAC-SHA256-Signature-Header** signiert:

```
X-Signature: sha256=<hmac>
```

Zur Verifikation auf Empfängerseite:

```js
const crypto = require('crypto');
const secret = 'dein-webhook-secret';
const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');
// Vergleichen mit req.headers['x-signature'].replace('sha256=', '')
```

### Ereignisse

| Event | Auslöser |
|---|---|
| `task_completed` | Eine Aufgabe wird als abgeschlossen markiert |

**Payload-Beispiel (`task_completed`):**

```json
{
  "event": "task_completed",
  "data": {
    "task": {
      "id": 42,
      "title": "Login-Bug beheben",
      "external_ticket_id": "JIRA-101",
      "action_points": 2,
      "location": "Berlin",
      "sprint": "März 2026",
      "status": "completed",
      "completed_at": "2026-03-13T14:23:00.000Z"
    }
  }
}
```

---

## Deployment (Produktion)

### Mit PM2 (empfohlen)

```bash
# Auf dem Server (einmalig)
npm install
npm run db:push
npm run build
pm2 start npm --name "ressourcify" -- start
pm2 save

# Updates einspielen
git pull origin main
npm run db:push        # falls Schema-Änderungen
npm run build
pm2 restart ressourcify
```

### Nginx-Reverse-Proxy (Beispiel)

```nginx
server {
    listen 80;
    server_name app.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Wichtige Hinweise

- `NEXTAUTH_URL` muss auf die öffentliche URL gesetzt sein (inkl. `https://`)
- `NEXTAUTH_SECRET` und `AUTH_SECRET` müssen identisch und mindestens 32 Zeichen lang sein
- Für SSL: certbot / Let's Encrypt empfohlen
- `prisma migrate dev` erfordert Shadow-DB-Rechte → auf Produktionsservern stets `npm run db:push` verwenden

---

## Lokale Entwicklung

```bash
npm run dev          # Entwicklungsserver (Turbopack)
npm run build        # Produktions-Build
npm run db:studio    # Prisma Studio (Datenbank-GUI) unter localhost:5555
```

---

## Projektstruktur (Auszug)

```
src/
├── app/
│   ├── (app)/              # Geschützte App-Seiten (Board, Dashboard, Admin …)
│   │   ├── board/
│   │   ├── dashboard/
│   │   ├── list/
│   │   ├── activity/
│   │   ├── archive/
│   │   └── admin/
│   │       ├── locations/
│   │       ├── users/
│   │       ├── sprints/
│   │       ├── webhooks/
│   │       ├── permissions/
│   │       └── import/
│   ├── (auth)/             # Login-Seite
│   └── api/                # API-Routen
│       ├── tasks/
│       │   ├── route.ts          # GET / POST Tasks
│       │   ├── [id]/route.ts     # PATCH / DELETE Task
│       │   └── import/
│       │       ├── route.ts      # Externer API-Import (Bearer Token)
│       │       └── csv/route.ts  # CSV-Bulk-Import (Admin-Session)
│       ├── sprints/
│       ├── locations/
│       ├── users/
│       ├── activity/
│       ├── dashboard/
│       ├── settings/
│       └── webhooks/
├── components/
│   ├── board/              # KanbanBoard, TaskCard, TaskDetailModal …
│   ├── dashboard/          # CapacityOverview, VelocityChart …
│   └── shared/             # AppShell, Sidebar, GlobalSearch …
├── lib/
│   ├── auth.ts             # NextAuth-Konfiguration
│   ├── prisma.ts           # Prisma-Singleton
│   ├── capacity.ts         # SP-Logik, Overflow, Cascade
│   ├── permissions.ts      # Rollen & Berechtigungen
│   ├── activity-logger.ts  # Aktivitätslog
│   ├── notification-service.ts
│   ├── sprint-manager.ts
│   └── api-helpers.ts
├── types/
│   ├── board.ts            # BoardTask, BoardSprint …
│   └── index.ts
└── proxy.ts                # Next.js Middleware (Auth-Schutz)
```
