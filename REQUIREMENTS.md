# Projektanforderung: SprintBoard – Standortbasiertes Projektmanagement-Tool

## Projektübersicht

Entwickle eine Fullstack-Webapplikation für standortbasiertes Projektmanagement mit Action-Point-Kapazitätssteuerung. Das Kernkonzept: Aufgaben werden Standorten und monatlichen Sprints zugeordnet. Jeder Standort hat pro Sprint ein begrenztes Budget an Action Points (AP). Ist das Budget erschöpft, fließen neue Aufgaben automatisch in den nächsten Sprint über.

---

## Tech-Stack

| Komponente | Technologie |
|---|---|
| Framework | Next.js (App Router) |
| Sprache | TypeScript |
| Datenbank | MySQL / MariaDB |
| ORM | Prisma |
| Authentifizierung | NextAuth.js (Auth.js) |
| Kanban Drag & Drop | dnd-kit |
| Styling | Tailwind CSS |
| Charts / Diagramme | Recharts |
| Internationalisierung | next-intl (Deutsch + Englisch) |
| API | Next.js API Routes (REST) |

---

## Datenmodell

### Tabelle: `locations` (Standorte)
- `id` – Primary Key (Auto-Increment)
- `name` – String, Name des Standorts (z. B. "Berlin", "München")
- `color` – String, Hex-Farbcode für Farbcodierung im UI (z. B. "#3B82F6")
- `default_action_points` – Ganzzahl, Standard-AP-Budget für neue Sprints an diesem Standort. Falls NULL, greift der globale Standardwert aus `DEFAULT_AP_BUDGET` (.env)
- `is_active` – Boolean (default: true), ob der Standort aktiv ist
- `created_at`, `updated_at` – Zeitstempel

### Tabelle: `sprints` (Monatliche Sprints)
- `id` – Primary Key (Auto-Increment)
- `year` – Ganzzahl, Jahr (z. B. 2026)
- `month` – Ganzzahl, Monat (1–12)
- `label` – String, Anzeigename (z. B. "März 2026")
- `lock_status` – Enum: `open`, `soft_locked`, `hard_locked` (default: `open`)
- `created_at`, `updated_at` – Zeitstempel
- Unique Constraint auf (`year`, `month`)

### Tabelle: `sprint_capacities` (AP-Budget pro Standort pro Sprint)
- `id` – Primary Key (Auto-Increment)
- `sprint_id` – FK → sprints
- `location_id` – FK → locations
- `max_action_points` – Ganzzahl, konfigurierbares AP-Budget für diesen Sprint/Standort
- Unique Constraint auf (`sprint_id`, `location_id`)

### Tabelle: `tasks` (Aufgaben)
- `id` – Primary Key (Auto-Increment)
- `title` – String, Titel der Aufgabe
- `description` – Text, Beschreibung (optional, nullable)
- `action_points` – Ganzzahl: 1, 2 oder 3 (Validierung!)
- `location_id` – FK → locations
- `sprint_id` – FK → sprints
- `status` – Enum: `open`, `in_progress`, `completed` (default: `open`)
- `priority` – Ganzzahl (Sortierreihenfolge innerhalb des Sprints, niedrigere Zahl = höhere Priorität)
- `external_ticket_id` – String, optional, Verweis auf externes Ticket-System (unique wenn gesetzt)
- `completed_at` – DateTime, nullable, Zeitpunkt des Abschlusses
- `created_by` – FK → users
- `created_at`, `updated_at` – Zeitstempel

### Tabelle: `users`
- `id` – Primary Key (Auto-Increment)
- `name` – String, Anzeigename
- `email` – String, E-Mail (unique)
- `password` – String, Gehashtes Passwort (bcrypt)
- `role` – Enum: `viewer`, `sales`, `admin`
- `locale` – Enum: `de`, `en` (default: `de`)
- `created_at`, `updated_at` – Zeitstempel

### Tabelle: `user_locations` (Zuordnung User ↔ Standorte)
- `id` – Primary Key (Auto-Increment)
- `user_id` – FK → users
- `location_id` – FK → locations
- Unique Constraint auf (`user_id`, `location_id`)
- Zweck: Bestimmt, für welche Standorte ein User Benachrichtigungen erhält. Admins sehen alle Standorte unabhängig von dieser Zuordnung.

### Tabelle: `notifications` (In-App-Benachrichtigungen)
- `id` – Primary Key (Auto-Increment)
- `user_id` – FK → users (Empfänger)
- `type` – Enum: `cascade_triggered`, `sprint_locked`, `capacity_changed`, `task_imported`
- `title` – String, Kurztitel (z. B. "3 Aufgaben verschoben")
- `message` – Text, Detailnachricht in natürlicher Sprache
- `link` – String, optional, Deep-Link zur betroffenen Ansicht (z. B. "/board?sprint=5")
- `is_read` – Boolean (default: false)
- `created_at` – Zeitstempel

### Tabelle: `activity_log` (Aktivitätsprotokoll)
- `id` – Primary Key (Auto-Increment)
- `user_id` – FK → users (wer hat die Aktion ausgeführt; nullable für System-Aktionen wie Auto-Sprint-Erzeugung)
- `action` – Enum: `task_created`, `task_moved`, `task_completed`, `task_priority_changed`, `cascade_triggered`, `sprint_locked`, `sprint_unlocked`, `sprint_created`, `capacity_changed`, `task_imported`, `location_created`, `user_created`
- `target_type` – Enum: `task`, `sprint`, `sprint_capacity`, `location`, `user`
- `target_id` – Ganzzahl, ID des betroffenen Objekts
- `details` – JSON-Feld mit Kontext (z. B. `{ "from_sprint_id": 3, "to_sprint_id": 4, "cascade_affected": [17, 23], "old_value": 50, "new_value": 35 }`)
- `created_at` – Zeitstempel

### Tabelle: `webhook_endpoints` (Webhook-Konfiguration)
- `id` – Primary Key (Auto-Increment)
- `name` – String, Anzeigename (z. B. "Jira Callback")
- `url` – String, Ziel-URL des Webhooks
- `secret` – String, Shared Secret für HMAC-SHA256-Signatur
- `events` – JSON-Array der abonnierten Events (z. B. `["task_completed", "task_moved", "cascade_triggered"]`)
- `is_active` – Boolean (default: true)
- `last_status` – Enum: `success`, `failed`, `pending`, nullable
- `last_triggered_at` – DateTime, nullable
- `created_at`, `updated_at` – Zeitstempel

---

## Kern-Geschäftslogik

### 1. Action-Point-Kapazitätsprüfung

Bei jeder Zuweisung einer Aufgabe zu einem Sprint/Standort:
1. Berechne die Summe aller `action_points` ALLER Aufgaben in diesem Sprint für diesen Standort (sowohl offene, in Bearbeitung befindliche ALS AUCH abgeschlossene – abgeschlossene Aufgaben belegen ihren Platz dauerhaft)
2. Prüfe, ob die neue Aufgabe in das `max_action_points`-Budget der `sprint_capacities` passt
3. Wenn JA: Aufgabe wird diesem Sprint zugeordnet
4. Wenn NEIN: Aufgabe wird automatisch dem nächsten offenen (nicht soft-locked, nicht hard-locked) Sprint zugeordnet (Overflow)
5. Wenn auch der nächste Sprint voll ist: Kaskadiere weiter bis ein Sprint mit Kapazität gefunden wird
6. Wenn kein Sprint mit Kapazität existiert: Erzeuge automatisch einen neuen Sprint

**KRITISCH: Standort-Isolation.** Jeder Standort hat sein eigenes AP-Budget. Wenn Standort A voll ist und Standort B noch Kapazität hat, darf eine Aufgabe von Standort A NICHT die Kapazität von Standort B nutzen. Die AP-Berechnung geschieht IMMER pro Standort.

### 2. Cascade-Logik bei Umpriorisierung

Wenn eine Aufgabe in einen früheren Sprint vorgezogen wird (durch Sales- oder Admin-Rolle):
1. Prüfe, ob der Ziel-Sprint nach Hinzufügen der Aufgabe das AP-Limit für den betroffenen Standort überschreitet
2. Wenn JA: Verschiebe die Aufgabe mit der niedrigsten Priorität (höchste Prioritätszahl) in diesem Sprint/Standort in den nächsten offenen Sprint
3. Wenn dadurch der nächste Sprint ebenfalls überläuft: Kaskadiere weiter
4. Abgeschlossene Aufgaben werden NIEMALS durch Cascade verschoben
5. Diese gesamte Operation MUSS in einer Datenbank-Transaktion laufen
6. Vor der Ausführung: Dry-Run zur Preview (siehe API-Abschnitt)

### 3. Sprint-Verwaltung

- Das System stellt sicher, dass **immer mindestens 3 zukünftige Sprints** existieren (relativ zum aktuellen Monat)
- Wenn durch Overflow oder manuelle Aktion ein neuer Sprint benötigt wird, erzeugt das System diesen automatisch
- Beim Erzeugen eines neuen Sprints wird für jeden aktiven Standort automatisch ein `sprint_capacities`-Eintrag angelegt. Das Budget kommt aus `locations.default_action_points` oder, falls NULL, aus `DEFAULT_AP_BUDGET` (.env)
- Sprints entsprechen immer Kalendermonaten (kein Sprint darf kürzer oder länger sein)
- Sprint-Labels werden basierend auf der Benutzersprache generiert (z. B. "März 2026" oder "March 2026")
- Beim Anlegen eines neuen Standorts: Für alle existierenden offenen Sprints werden automatisch `sprint_capacities`-Einträge erstellt

### 4. Sprint-Locking (Zwei Stufen)

**Soft-Lock (`soft_locked`):**
- Keine neuen Aufgaben können dem Sprint hinzugefügt werden (weder manuell noch per API-Import)
- Aufgaben innerhalb des Sprints können noch umpriorisiert werden (Drag & Drop innerhalb des Monats)
- Aufgaben können als `completed` markiert werden
- Overflow-Logik und Cascade überspringen soft-locked Sprints (neue/verschobene Aufgaben landen im nächsten offenen Sprint)

**Hard-Lock (`hard_locked`):**
- Gar keine Veränderungen mehr möglich
- Sprint ist komplett eingefroren (historischer Zustand)
- Aufgaben können NICHT mehr als completed markiert werden
- Drag & Drop ist komplett deaktiviert
- Auch Admins können keine Änderungen vornehmen (außer den Lock-Status zurücksetzen)

**Lock-Reihenfolge:** Ein Sprint kann nur von `open` → `soft_locked` → `hard_locked` gesetzt werden. Rücksetzen ist möglich: `hard_locked` → `soft_locked` → `open` (nur Admin).

### 5. Aufgaben-Abschluss

- Abgeschlossene Aufgaben (`status: completed`) bleiben permanent in ihrem Sprint
- Beim Abschließen wird `completed_at` auf den aktuellen Zeitpunkt gesetzt
- Sie können NICHT mehr verschoben, umpriorisiert oder aus dem Sprint entfernt werden
- Sie werden NIEMALS durch Cascade-Operationen verschoben
- Visuelle Darstellung: Ausgegraut (reduzierte Opacity) mit grünem Label "Abgeschlossen" / "Completed"
- Abgeschlossene Aufgaben zählen weiterhin zum AP-Verbrauch des Sprints (sie belegen ihren Platz dauerhaft)

### 6. Aktivitätslog

Jede relevante Aktion wird protokolliert und ist für alle eingeloggten Nutzer einsehbar.

**Protokollierte Aktionen:**
- Aufgabe erstellt (manuell oder per API-Import)
- Aufgabe verschoben (von Sprint X nach Sprint Y, durch wen)
- Cascade ausgelöst (welche Aufgaben wurden automatisch verschoben, ausgelöst durch welche Aktion)
- Aufgabe abgeschlossen
- Aufgabe umpriorisiert
- Sprint-Status geändert (soft-locked / hard-locked / entsperrt)
- Sprint automatisch erzeugt
- AP-Budget geändert (alter Wert → neuer Wert, für welchen Standort/Sprint)
- Aufgabe per API importiert (inkl. externe Ticket-ID)
- Standort angelegt
- User angelegt

**Darstellung:**
- Eigene Seite/Tab "Aktivität" mit chronologischer Timeline
- Filterbar nach: Zeitraum, Nutzer, Aktionstyp, Standort, Sprint
- Auf jeder Aufgabenkarte (Detail-Modal): Mini-Aktivitätslog nur für diese Aufgabe
- Einträge in natürlicher Sprache: z. B. "Anna hat AB123 von März 2026 nach Februar 2026 verschoben. Dadurch wurden 2 Aufgaben in den April 2026 verschoben."

### 7. Globale Suche

- Suchfeld immer sichtbar in der oberen Navigation (Header)
- Durchsucht: Aufgaben-Titel, Beschreibung, externe Ticket-ID
- Ergebnisse erscheinen als Dropdown unterhalb des Suchfelds (Live-Suche mit Debounce, ~300ms)
- Jedes Ergebnis zeigt: Titel, Standort (farbcodiert), Sprint, Status
- Klick auf Ergebnis öffnet das Aufgaben-Detail-Modal
- Suche funktioniert über alle Sprints hinweg (auch hard-locked)
- Tastatur-Shortcut: Cmd/Ctrl + K öffnet die Suche (wie in modernen SaaS-Tools)

### 8. Benachrichtigungen bei Cascade

Wenn durch eine Verschiebung Aufgaben per Cascade in einen anderen Sprint verschoben werden:
- Der Nutzer, der die Aktion auslöst, sieht den Bestätigungsdialog (siehe UI-Spezifikation)
- Zusätzlich: Alle Sales- und Admin-Nutzer, die über `user_locations` dem betroffenen Standort zugeordnet sind, erhalten eine In-App-Benachrichtigung
- Admins erhalten Benachrichtigungen für ALLE Standorte (unabhängig von `user_locations`)
- Benachrichtigungs-Icon (Glocke) in der oberen Navigation mit Unread-Badge (Zahl)
- Klick öffnet ein Benachrichtigungs-Panel mit den letzten Benachrichtigungen
- Benachrichtigungstext: "3 Aufgaben wurden in den April 2026 verschoben (Standort Berlin), ausgelöst durch Anna."
- Benachrichtigungen können einzeln oder alle als gelesen markiert werden

### 9. Velocity-Tracking

Zeigt im Dashboard, wie viele Action Points pro Standort pro Monat tatsächlich abgeschlossen wurden.

**Darstellung:**
- Liniendiagramm oder Balkendiagramm im Dashboard (Recharts)
- X-Achse: Monate (Sprints), Y-Achse: Abgeschlossene AP
- Eine Linie/Balkenreihe pro Standort (farbcodiert mit Standortfarbe aus `locations.color`)
- Zusätzlich: Trendlinie oder Durchschnitt über die letzten 6 Monate
- Hilft bei der Einschätzung, ob das AP-Budget realistisch gesetzt ist
- Berechnung: Summe der `action_points` aller Aufgaben mit `status = completed` pro Sprint/Standort

### 10. Sprint-Zusammenfassung als Export

**PDF-Export:**
- Pro Sprint oder für einen Zeitraum generierbar
- Enthält: Sprint-Name, Standort-Auslastung (AP verbraucht/verfügbar), Liste aller Aufgaben mit Status, Abschlussquote
- Professionelles Layout, geeignet für Management-Reports

**CSV-Export:**
- Tabellarischer Export aller Aufgaben (filterbar nach Sprint, Standort, Status)
- Spalten: Task-ID, Titel, Beschreibung, AP, Standort, Sprint, Status, Externe Ticket-ID, Erstellt am, Abgeschlossen am
- Für Weiterverarbeitung in Excel oder BI-Tools

**Zugang:** Export-Button im Dashboard und in der Listenansicht (nur Sales + Admin)

### 11. Webhook-Rückmeldung ans Ticket-System

Wenn sich der Status einer Aufgabe ändert, kann das System einen Webhook an eine konfigurierte URL senden.

**Konfiguration (Admin-Bereich):**
- Name des Webhooks (zur Identifikation)
- URL des Webhook-Endpoints
- Shared Secret für HMAC-SHA256-Signatur (im Header `X-SprintBoard-Signature`)
- Auswahl der Events: `task_completed`, `task_moved`, `task_created`, `cascade_triggered`
- Testbutton zum Prüfen der Verbindung (sendet Test-Payload)
- Anzeige des letzten Zustellstatus und Zeitpunkts

**Webhook Payload (Beispiel task_completed):**
```json
{
  "event": "task_completed",
  "timestamp": "2026-03-15T14:32:00Z",
  "task": {
    "id": 42,
    "title": "Server-Migration",
    "external_ticket_id": "AB123",
    "action_points": 2,
    "location": "Berlin",
    "sprint": "März 2026",
    "status": "completed",
    "completed_at": "2026-03-15T14:32:00Z"
  }
}
```

**Fehlerbehandlung:**
- Retry-Logik: 3 Versuche mit exponential Backoff (1s, 5s, 30s)
- Nach 3 fehlgeschlagenen Versuchen: Webhook wird als fehlgeschlagen im Aktivitätslog vermerkt und `last_status` auf `failed` gesetzt
- Admin sieht im Webhook-Konfigurationsbereich den letzten Zustellstatus

---

## Rollen & Berechtigungen

### Viewer
- Kann das Kanban-Board, Dashboard, Listenansicht und Aktivitätslog einsehen
- Kann nach Standorten filtern
- Kann Aufgabendetails ansehen
- Kann die globale Suche nutzen
- Kann Benachrichtigungen einsehen
- Kann NICHTS verändern

### Sales
- Alle Viewer-Rechte
- Kann neue Aufgaben manuell erstellen
- Kann Aufgaben zwischen Sprints verschieben (Drag & Drop)
- Kann Aufgaben innerhalb eines Sprints umpriorisieren (Drag & Drop)
- Kann Aufgaben als abgeschlossen markieren
- Kann Exports herunterladen (PDF/CSV)
- Kann NICHT: AP-Budgets ändern, Sprints locken, Standorte verwalten, User verwalten, Webhooks konfigurieren

### Admin
- Alle Sales-Rechte
- Kann AP-Budgets pro Sprint/Standort anpassen
- Kann Standard-AP-Budgets pro Standort konfigurieren
- Kann Sprints soft-locken, hard-locken und wieder entsperren
- Kann Standorte anlegen, bearbeiten, deaktivieren (inkl. Farbwahl)
- Kann User anlegen, bearbeiten, Rollen zuweisen
- Kann Webhooks konfigurieren (anlegen, bearbeiten, testen, deaktivieren)
- Kann globale Systemeinstellungen ändern

---

## Ansichten / Views

### 1. Kanban-Board (Hauptansicht)

**Layout:**
- Horizontale Spalten = Sprints (Monate), chronologisch sortiert
- Jede Spalte zeigt oben: Sprint-Name (z. B. "März 2026"), AP-Verbrauch als Fortschrittsbalken pro Standort, Lock-Status-Icon
- Karten = Aufgaben, vertikal sortiert nach Priorität (niedrigste Prioritätszahl oben)

**Aufgabenkarten zeigen:**
- Titel (max. 2 Zeilen, dann truncate)
- Action Points (1, 2 oder 3) als farbiger Badge (1=grün, 2=gelb, 3=rot)
- Standort-Farbstreifen am linken Rand der Karte
- Status-Label
- Externe Ticket-ID als kleiner Badge unten (falls vorhanden)

**Interaktionen:**
- Drag & Drop zwischen Sprints (Sales + Admin, nicht in soft-locked/hard-locked Sprints als Ziel)
- Drag & Drop innerhalb eines Sprints für Umpriorisierung (Sales + Admin, auch in soft-locked Sprints)
- Klick auf Karte → Detail-Modal mit allen Feldern + Mini-Aktivitätslog
- Filter: Standort, Status, Action Points

**Fortschrittsbalken pro Standort in Spalten-Header:**
- Zeigt pro Standort: verbrauchte AP / maximale AP (z. B. "42/50 AP")
- Farbcodierung: Grün (<70%), Gelb (70–90%), Rot (>90%), Voll/Überbucht (100%)
- Wird bei jedem Standort einzeln angezeigt (da Kapazitäten isoliert sind)
- Standortfarbe aus `locations.color` wird verwendet

### 2. Dashboard

**Übersicht mit:**
- AP-Auslastung pro Standort über die nächsten Sprints (Balkendiagramm oder Heatmap)
- Gesamtanzahl offene vs. abgeschlossene Aufgaben pro Sprint
- Standort-Vergleich: Welcher Standort hat noch Kapazität, welcher ist voll?
- Nächste volle Sprints als Warnung (Alert-Banner)
- Velocity-Tracking: Linien- oder Balkendiagramm (Recharts) mit abgeschlossenen AP pro Standort pro Monat über die letzten 6–12 Monate, inkl. Durchschnitts-Trendlinie
- Export-Button: Sprint-Zusammenfassung als PDF oder CSV herunterladen (Sales + Admin)

### 3. Listenansicht

- Tabellarische Darstellung aller Aufgaben
- Sortierbar nach: Sprint, Standort, Action Points, Status, Priorität, Erstelldatum
- Filterbar nach: Standort, Sprint, Status
- Bulk-Aktionen für Admin: Mehrere Aufgaben gleichzeitig verschieben (optional, nice-to-have)
- Export-Button: Aktuelle Filteransicht als CSV exportieren (Sales + Admin)

---

## REST-API

### Endpoint: `POST /api/tasks/move/preview` (Cascade Dry-Run)

**Beschreibung:** Simuliert eine Verschiebung, ohne sie auszuführen. Gibt zurück, welche Aufgaben durch die Cascade betroffen wären. Wird vom Frontend aufgerufen, BEVOR der Bestätigungsdialog angezeigt wird.

**Authentifizierung:** Session (Sales oder Admin)

**Request Body:**
```json
{
  "task_id": 42,
  "target_sprint_id": 3
}
```

**Response:**
```json
{
  "fits_without_cascade": false,
  "affected_tasks": [
    {
      "id": 17,
      "title": "Server-Migration",
      "external_ticket_id": "AB123",
      "action_points": 2,
      "current_sprint": "März 2026",
      "target_sprint": "April 2026"
    },
    {
      "id": 23,
      "title": "Firewall-Update",
      "external_ticket_id": "AB458",
      "action_points": 1,
      "current_sprint": "März 2026",
      "target_sprint": "April 2026"
    }
  ],
  "sprints_affected": 1,
  "new_sprints_created": 0
}
```

Wenn `fits_without_cascade` = `true`, braucht das Frontend keinen Bestätigungsdialog und kann direkt verschieben.

### Endpoint: `POST /api/tasks/move` (Verschiebung ausführen)

**Authentifizierung:** Session (Sales oder Admin)

**Request Body:** Identisch mit `/preview`

**Verhalten:** Führt die Verschiebung inkl. Cascade in einer Datenbank-Transaktion aus. Wird erst aufgerufen, nachdem der User den Bestätigungsdialog bestätigt hat (oder wenn keine Cascade nötig ist). Erstellt Aktivitätslog-Einträge und sendet Benachrichtigungen an betroffene User. Triggert Webhooks falls konfiguriert.

### Endpoint: `POST /api/tasks/import` (Externer Import)

**Authentifizierung:** API-Key (als `Authorization: Bearer <API_KEY>` im Header)

**Request Body:**
```json
{
  "title": "Server-Migration Standort Berlin",
  "description": "Optional: Details zur Aufgabe",
  "action_points": 2,
  "location_id": 1,
  "external_ticket_id": "TICKET-4521"
}
```

**Verhalten:**
1. Validiere alle Felder (title: required, action_points: 1–3, location_id: muss existieren und aktiv sein)
2. Prüfe, ob `external_ticket_id` bereits existiert (Duplikat-Schutz → 409 Conflict)
3. Finde den frühesten offenen Sprint mit Kapazität für den angegebenen Standort
4. Ordne die Aufgabe zu (mit Overflow-Logik falls nötig)
5. Erstelle Aktivitätslog-Eintrag
6. Triggere Webhooks falls konfiguriert
7. Gib die erstellte Aufgabe mit Sprint-Zuordnung zurück

**Response (201 Created):**
```json
{
  "id": 42,
  "title": "Server-Migration Standort Berlin",
  "action_points": 2,
  "location": "Berlin",
  "location_id": 1,
  "assigned_sprint": "April 2026",
  "sprint_id": 5,
  "status": "open"
}
```

**Fehlerfälle:**
- 400: Validierungsfehler (fehlende/ungültige Felder)
- 401: Ungültiger oder fehlender API-Key
- 404: `location_id` existiert nicht oder ist deaktiviert
- 409: `external_ticket_id` existiert bereits

### Endpoint: `GET /api/tasks`

- Authentifizierung: Session (alle Rollen)
- Optionale Query-Parameter: `location_id`, `sprint_id`, `status`, `search`, `page`, `limit`
- Gibt paginierte Task-Liste zurück mit Gesamtanzahl

### Endpoint: `GET /api/sprints`

- Authentifizierung: Session (alle Rollen)
- Gibt alle Sprints mit ihren Kapazitäten pro Standort zurück
- Inkl. aktuellem AP-Verbrauch (berechnet aus der Summe aller zugeordneten Tasks)

### Endpoint: `GET /api/search`

- Authentifizierung: Session (alle Rollen)
- Query-Parameter: `q` (Suchbegriff, min. 2 Zeichen)
- Durchsucht: `tasks.title`, `tasks.description`, `tasks.external_ticket_id`
- Gibt max. 10 Ergebnisse zurück (für Live-Suche-Dropdown)

---

## Internationalisierung (i18n)

- Zwei Sprachen: Deutsch (Standard) und Englisch
- Sprachauswahl pro User (in Profil-Einstellungen, gespeichert in `users.locale`)
- Alle UI-Labels, Buttons, Statusmeldungen, Fehlermeldungen zweisprachig
- Sprint-Labels lokalisiert (z. B. "März 2026" / "March 2026")
- Datumsformate lokalisiert (DD.MM.YYYY für DE, MM/DD/YYYY für EN)
- Aktivitätslog-Einträge werden in der Sprache des betrachtenden Users angezeigt (nicht in der Sprache des ausführenden Users)

---

## UI/UX-Richtlinien

### Design-Philosophie

Das Tool wird von Anwendern genutzt, die technisch NICHT versiert sind. Jede Funktion muss sich selbst erklären. Wenn ein Feature eine Anleitung braucht, ist es zu kompliziert. Das Vorbild für Look & Feel ist **monday.com**: modern, hochwertig, farbenfroh aber nicht überladen, mit flüssigen Animationen und sofortigem visuellem Feedback.

### Visuelle Qualität & Ästhetik

**Gesamteindruck:**
- Premium-Feeling: Das Tool soll sich anfühlen wie ein professionelles SaaS-Produkt, nicht wie ein internes Bastelprojekt
- Großzügige Whitespace-Nutzung – Elemente brauchen Luft zum Atmen
- Weiche, abgerundete Ecken (border-radius: 8–12px)
- Subtile Schatten für Tiefe (keine harten Drop-Shadows)
- Sanfte Farbverläufe statt harter Farbflächen wo passend

**Farbschema:**
- Heller, freundlicher Hintergrund (nicht steriles Weiß, sondern leicht warm, z. B. #FAFBFC)
- Standorte sind farbcodiert mit kräftigen, aber harmonischen Farben (aus `locations.color`)
- Status-Farben konsistent: Grün = abgeschlossen, Blau = in Bearbeitung, Grau = offen
- Kapazitätsbalken: Grün → Gelb → Orange → Rot (fließender Übergang je nach Auslastung)
- Akzentfarbe für primäre Aktionen (Buttons, Links): Ein kräftiges, aber nicht aggressives Blau

**Typografie:**
- Eine moderne, gut lesbare Sans-Serif-Schrift (z. B. Plus Jakarta Sans, DM Sans, oder Geist)
- Klare Hierarchie: Große, fette Überschriften, mittlere Labels, kleine Metadaten
- Keine Schriftgröße unter 13px – Lesbarkeit hat Priorität

**Animationen & Micro-Interactions:**
- Flüssige Drag & Drop-Animationen (dnd-kit bietet das nativ)
- Sanfte Übergänge beim Filtern (Elemente faden ein/aus, nicht abrupt erscheinen/verschwinden)
- Hover-Effekte auf Karten: Leichtes Anheben (translateY + Shadow)
- Kapazitätsbalken animieren sich beim Laden und bei Änderungen
- Skeleton-Loading-States statt Spinner (wie monday.com)
- Toast-Benachrichtigungen gleiten von oben oder rechts ein
- Modale öffnen sich mit einer sanften Scale+Fade-Animation

### Intuitive Bedienung

**Navigation:**
- Linke Sidebar (collapsible) mit: Board, Dashboard, Liste, Aktivitätslog, Admin-Bereich
- Sidebar zeigt Icons + Text, im eingeklappten Zustand nur Icons
- Aktive Seite ist visuell klar hervorgehoben
- Breadcrumb oder Seitentitel immer sichtbar
- Header-Leiste oben: Globales Suchfeld (Cmd/Ctrl+K), Benachrichtigungs-Glocke mit Unread-Badge, Sprach-Umschalter (DE/EN), User-Avatar mit Dropdown-Menü

**Kanban-Board – Bedienung:**
- Drag & Drop muss sich natürlich anfühlen: Karte "löst sich" visuell beim Greifen, Zielbereich wird hervorgehoben
- Wenn eine Karte in einen vollen Sprint gezogen wird: Sofortiges visuelles Feedback (z. B. Ziel-Spalte wird orange umrandet + Tooltip "Cascade: 1 Aufgabe wird verschoben")
- Soft-locked Sprints: Spalte bekommt ein dezentes Schloss-Icon und einen leicht gedimmten Header, Drag & Drop IN die Spalte ist deaktiviert, aber innerhalb noch möglich
- Hard-locked Sprints: Spalte komplett gedimmt mit Schloss-Icon, keine Interaktion möglich
- Abgeschlossene Aufgaben: Karte wird ausgegraut (opacity ~0.5), grünes "Abgeschlossen"-Badge, kein Drag-Handle sichtbar

**Aufgabenkarten:**
- Kompakt aber informativ: Titel (max. 2 Zeilen, dann truncate), AP-Badge (farbig: 1=grün, 2=gelb, 3=rot), Standort-Farbstreifen am linken Rand
- Externe Ticket-ID als kleiner Link/Badge unten
- Kein visueller Clutter – nur das Nötigste auf der Karte

**Filter:**
- Filter-Bar oben über dem Board, immer sichtbar
- Standort-Filter als farbige Toggle-Chips (ein/aus mit Klick, Farbe aus `locations.color`)
- Status-Filter als Dropdown oder ebenfalls Chips
- Aktive Filter sind visuell klar erkennbar
- "Alle Filter zurücksetzen"-Button wenn Filter aktiv sind

**Leere Zustände:**
- Wenn ein Sprint keine Aufgaben hat: Freundliche Illustration oder Icon mit Text "Keine Aufgaben in diesem Sprint"
- Wenn ein Filter keine Ergebnisse hat: "Keine Aufgaben gefunden – Filter anpassen?"
- Beim ersten Login ohne Daten: Willkommens-Screen mit Kurzanleitung

**Fehlervermeidung:**
- Bestätigungsdialoge bei: Cascade-Operationen, Sprint-Locking, Aufgabe abschließen
- Dialoge mit klarer Sprache, KEIN Technik-Jargon

**Cascade-Bestätigungsdialog (Detail-Spezifikation):**
- Haupttext: "Diese Aktion verschiebt 3 weitere Aufgaben in den nächsten Monat. Fortfahren?"
- Darunter ein kleiner aufklappbarer Bereich (Chevron-Pfeil ▶ / ▼) mit dem Label "Betroffene Aufgaben anzeigen"
- Beim Aufklappen erscheint eine kompakte Liste der betroffenen Aufgaben, z. B.:
  - AB123 – Server-Migration (2 AP) → April 2026
  - AB458 – Firewall-Update (1 AP) → April 2026
- Jeder Eintrag zeigt: Externe Ticket-ID (falls vorhanden) oder Task-ID, Titel, AP-Wert, und den Ziel-Sprint
- Wenn eine Cascade über mehrere Sprints geht, gruppiert nach Ziel-Sprint
- Das Backend muss die Cascade VOR der Ausführung simulieren und das Ergebnis als Preview an das Frontend liefern (Dry-Run-Endpoint)
- Zwei Buttons: "Abbrechen" (sekundär) und "Verschieben bestätigen" (primär, farblich hervorgehoben)
- Undo-Möglichkeit bei Verschiebungen (5-Sekunden-Toast mit "Rückgängig"-Button)

### Responsive Design

- Desktop-first (optimiert für 1280px+)
- Tablet-nutzbar (1024px): Sidebar eingeklappt, Kanban horizontal scrollbar
- Mobil (< 768px): Kanban wird zur vertikalen Listenansicht pro Sprint, kein Drag & Drop auf Mobile – stattdessen "Verschieben nach..."-Menü
- Touch-Gesten für Tablet: Horizontal swipen zwischen Sprints

### Barrierefreiheit (Basis)

- Ausreichender Farbkontrast (WCAG AA)
- Alle interaktiven Elemente per Tastatur erreichbar
- Aria-Labels für Drag & Drop-Bereiche
- Fokus-Indikatoren bei Tastatur-Navigation

---

## Konfiguration & Umgebung

### Environment Variables (.env)
```
DATABASE_URL=mysql://sprintboard:DEIN_PASSWORT@localhost:3306/sprintboard
NEXTAUTH_SECRET=<random-secret-mindestens-32-zeichen>
NEXTAUTH_URL=http://localhost:3000
API_KEY=<zufälliger-api-key-für-externen-import>
DEFAULT_AP_BUDGET=50
```

### Datenbank-Setup
- MySQL 9.x oder MariaDB 10.6+
- Prisma Migrate für Schema-Migrationen
- Seed-Skript erstellt:
  - 1 Admin-User: Name "Admin", E-Mail "admin@sprintboard.local", Passwort "admin123" (Hinweis im Seed-Output: Passwort nach erstem Login ändern!)
  - 4 Beispiel-Standorte: Berlin (#3B82F6, 50 AP), München (#EF4444, 45 AP), Hamburg (#10B981, 40 AP), Frankfurt (#F59E0B, 35 AP)
  - Sprints für die nächsten 6 Monate mit entsprechenden `sprint_capacities`
  - 10–15 Beispiel-Aufgaben verteilt über die ersten 3 Sprints
  - User-Location-Zuordnungen für den Admin (alle Standorte)

---

## Projektstruktur (empfohlen)

```
sprintboard/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Redirect → /board
│   │   │   ├── board/
│   │   │   │   └── page.tsx          # Kanban-Board
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # Dashboard
│   │   │   ├── list/
│   │   │   │   └── page.tsx          # Listenansicht
│   │   │   ├── activity/
│   │   │   │   └── page.tsx          # Aktivitätslog
│   │   │   └── admin/
│   │   │       ├── locations/
│   │   │       ├── users/
│   │   │       ├── webhooks/
│   │   │       └── settings/
│   │   └── api/
│   │       ├── tasks/
│   │       │   ├── route.ts          # GET, POST
│   │       │   ├── [id]/route.ts     # GET, PATCH, DELETE
│   │       │   ├── import/route.ts   # POST (externer Import)
│   │       │   └── move/
│   │       │       ├── route.ts      # POST (Verschiebung ausführen)
│   │       │       └── preview/route.ts  # POST (Cascade Dry-Run)
│   │       ├── sprints/
│   │       │   ├── route.ts          # GET
│   │       │   └── [id]/
│   │       │       ├── route.ts      # GET, PATCH
│   │       │       └── lock/route.ts # POST (Lock-Status ändern)
│   │       ├── search/route.ts       # GET (globale Suche)
│   │       ├── activity/route.ts     # GET (Aktivitätslog)
│   │       ├── notifications/
│   │       │   ├── route.ts          # GET (Liste), PATCH (alle als gelesen)
│   │       │   └── [id]/route.ts     # PATCH (einzelne als gelesen)
│   │       ├── export/route.ts       # GET (PDF/CSV-Export)
│   │       ├── webhooks/
│   │       │   ├── route.ts          # GET, POST
│   │       │   ├── [id]/route.ts     # PATCH, DELETE
│   │       │   └── [id]/test/route.ts # POST (Test-Webhook senden)
│   │       ├── locations/route.ts    # GET, POST, PATCH
│   │       ├── users/route.ts        # GET, POST, PATCH
│   │       └── auth/
│   │           └── [...nextauth]/route.ts
│   ├── components/
│   │   ├── board/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── SprintColumn.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskDetailModal.tsx
│   │   │   ├── CapacityBar.tsx
│   │   │   └── CascadeConfirmDialog.tsx
│   │   ├── dashboard/
│   │   │   ├── CapacityOverview.tsx
│   │   │   └── VelocityChart.tsx
│   │   ├── shared/
│   │   │   ├── GlobalSearch.tsx
│   │   │   ├── NotificationBell.tsx
│   │   │   ├── NotificationPanel.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   └── Toast.tsx
│   │   └── admin/
│   │       ├── LocationForm.tsx
│   │       ├── UserForm.tsx
│   │       └── WebhookForm.tsx
│   ├── lib/
│   │   ├── prisma.ts                 # Prisma Client Singleton
│   │   ├── capacity.ts               # AP-Logik, Overflow, Cascade, Dry-Run
│   │   ├── sprint-manager.ts         # Sprint-Erzeugung, Locking, Mindest-Sprint-Prüfung
│   │   ├── activity-logger.ts        # Aktivitätslog-Service
│   │   ├── notification-service.ts   # Benachrichtigungs-Service
│   │   ├── webhook.ts                # Webhook-Versand mit HMAC-Signatur und Retry-Logik
│   │   ├── search.ts                 # Globale Suchlogik
│   │   ├── export.ts                 # PDF- und CSV-Export
│   │   └── auth.ts                   # NextAuth Config
│   ├── i18n/
│   │   ├── de.json
│   │   └── en.json
│   └── types/
│       └── index.ts
├── public/
│   └── (statische Assets, Logos, etc.)
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## MVP-Reihenfolge (empfohlene Build-Sequenz)

### Phase 1: Fundament
1. Next.js-Projekt aufsetzen mit TypeScript und Tailwind
2. Prisma-Schema definieren (alle Tabellen inkl. user_locations, notifications, activity_log, webhook_endpoints) und Datenbank migrieren
3. Seed-Skript für Testdaten (Admin-User, 4 Standorte mit Farben und AP-Budgets, 6 Monate Sprints, Beispiel-Aufgaben)
4. NextAuth einrichten mit Credential-Provider, Rollen (viewer, sales, admin) und Session-Handling

### Phase 2: Kern-Logik
5. `lib/capacity.ts` – AP-Summierung (alle Aufgaben inkl. completed), Overflow-Logik, Cascade-Simulation (Dry-Run) und Cascade-Ausführung in Transaktionen
6. `lib/sprint-manager.ts` – Sprint-Erzeugung (mit standortspezifischen AP-Budgets), Locking-Logik, Mindest-Sprint-Prüfung, Auto-Sprint-Erzeugung bei neuem Standort
7. `lib/activity-logger.ts` – Service der bei jeder Aktion einen Log-Eintrag schreibt
8. `lib/notification-service.ts` – Service der Benachrichtigungen an betroffene User erstellt (basierend auf user_locations)
9. API-Routes für Tasks (CRUD) und Sprints (GET, PATCH, Lock)
10. Move-Endpoint + Preview-Endpoint (Cascade Dry-Run)
11. Import-Endpoint mit Duplikat-Schutz und Fehler-Responses

### Phase 3: Kanban-Board UI
12. Kanban-Board mit dnd-kit (Drag & Drop zwischen und innerhalb von Sprints, Berechtigungsprüfung)
13. Aufgabenkarten mit AP-Badge, Standort-Farbstreifen, Status-Label
14. Kapazitätsbalken pro Standort im Sprint-Header (mit Farbverlauf)
15. Cascade-Bestätigungsdialog mit aufklappbarer Aufgabenliste (nutzt Preview-Endpoint)
16. Visuelles Feedback für Lock-Status (Soft/Hard) und abgeschlossene Aufgaben
17. Filter-UI (Standort-Chips mit Farbe, Status) in Filter-Bar
18. Task-Detail-Modal mit allen Feldern und Mini-Aktivitätslog

### Phase 4: Navigation & Suche
19. Sidebar-Navigation (collapsible, mit Icons, aktive Seite hervorgehoben)
20. Header mit Suchfeld, Benachrichtigungs-Glocke, Sprach-Umschalter, User-Menü
21. Globale Suche (Cmd/Ctrl+K) mit Live-Ergebnissen und Debounce
22. Benachrichtigungssystem (Glocke-Icon, Unread-Badge, Panel, als gelesen markieren)

### Phase 5: Dashboard & Listen
23. Dashboard mit AP-Auslastungsdiagrammen pro Standort (Recharts)
24. Velocity-Tracking-Diagramm (abgeschlossene AP pro Monat über Zeit, Recharts)
25. Warnungen für volle Sprints
26. Listenansicht mit Sortierung und Filtern
27. PDF- und CSV-Export für Sprint-Zusammenfassungen und Listenansicht

### Phase 6: Admin & Integration
28. Admin-Bereich: Standorte verwalten (inkl. Farbwahl-Picker und Standard-AP-Budget)
29. Admin-Bereich: User-Verwaltung (anlegen, Rollenzuweisung, Standort-Zuordnung)
30. Admin-Bereich: Sprint-Locking-UI (Soft/Hard mit Bestätigungsdialog) und AP-Budget-Anpassung pro Sprint/Standort
31. Webhook-Konfiguration (anlegen, bearbeiten, Events wählen, Testbutton, Status-Anzeige)
32. `lib/webhook.ts` – Webhook-Versand mit HMAC-Signatur und Retry-Logik

### Phase 7: Internationalisierung & Polish
33. next-intl einrichten (DE + EN), alle Labels und Meldungen übersetzen
34. Loading States, Skeleton-Screens, Toast-Notifications mit Undo
35. Undo-Funktion bei Verschiebungen (5-Sekunden-Toast)
36. Responsive Anpassungen (Tablet, Mobile-Fallback mit "Verschieben nach"-Menü)
37. Aktivitätslog-Seite mit Filter und Timeline-Darstellung
38. Login-Seite mit professionellem Design
39. Willkommens-Screen für Erstanmeldung
40. API-Dokumentation (README oder separate Docs-Seite)
