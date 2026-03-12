"use client";

import { useState, useRef } from "react";

interface ParsedRow {
  title: string;
  description: string;
  story_points: number;
  location_name: string;
  external_ticket_id: string;
}

interface ImportResult {
  row: number;
  success: boolean;
  title: string;
  sprint?: string;
  error?: string;
}

const TEMPLATE_CSV = `title,description,story_points,location_name,external_ticket_id
"Login-Bug beheben","Fehler beim SSO-Login",2,Berlin,JIRA-101
"Dashboard-Redesign",,5,München,
"API-Dokumentation","Swagger aktualisieren",1,Hamburg,JIRA-103`;

const COLUMNS = ["title", "description", "story_points", "location_name", "external_ticket_id"];

function parseCsv(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header (case-insensitive)
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const obj: Record<string, string> = {};
    header.forEach((col, idx) => {
      obj[col] = values[idx]?.trim() ?? "";
    });
    rows.push({
      title: obj["title"] ?? "",
      description: obj["description"] ?? "",
      story_points: obj["story_points"] ? parseInt(obj["story_points"]) || 1 : 1,
      location_name: obj["location_name"] ?? "",
      external_ticket_id: obj["external_ticket_id"] ?? "",
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "import-vorlage.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportAdmin() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");
    setResults(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseCsv(text);
        if (parsed.length === 0) {
          setParseError("Keine Datenzeilen gefunden. Prüfe das Format.");
          setRows([]);
        } else {
          setRows(parsed);
        }
      } catch {
        setParseError("Fehler beim Lesen der Datei.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleImport() {
    if (rows.length === 0 || importing) return;
    setImporting(true);
    setResults(null);
    try {
      const res = await fetch("/api/tasks/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setRows([]);
    setResults(null);
    setParseError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const errorCount = results?.filter((r) => !r.success).length ?? 0;

  return (
    <div className="space-y-5">
      {/* Format-Hinweis */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">CSV-Format</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Pflichtfelder: <code className="bg-blue-100 px-1 rounded">title</code>,{" "}
              <code className="bg-blue-100 px-1 rounded">location_name</code>
              <br />
              Optional: <code className="bg-blue-100 px-1 rounded">description</code>,{" "}
              <code className="bg-blue-100 px-1 rounded">story_points</code> (1–10, Standard: 1),{" "}
              <code className="bg-blue-100 px-1 rounded">external_ticket_id</code>
              <br />
              Standortname muss exakt dem Namen in den Einstellungen entsprechen.
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Vorlage herunterladen
          </button>
        </div>
      </div>

      {/* Upload */}
      {rows.length === 0 && !results && (
        <div
          className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file && fileRef.current) {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileRef.current.files = dt.files;
              fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="hidden"
          />
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-medium text-gray-600">CSV-Datei hochladen</p>
          <p className="text-xs text-gray-400 mt-1">Klicken oder Datei hineinziehen</p>
          {parseError && <p className="text-xs text-red-600 mt-3 font-medium">{parseError}</p>}
        </div>
      )}

      {/* Vorschau */}
      {rows.length > 0 && !results && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">{rows.length} Aufgabe{rows.length !== 1 ? "n" : ""} erkannt</p>
            <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 transition">
              Zurücksetzen
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 w-6">#</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Titel</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Standort</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">SP</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Ticket-ID</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Beschreibung</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[200px] truncate">
                        {row.title || <span className="text-red-400 italic">fehlt</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {row.location_name || <span className="text-red-400 italic">fehlt</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`font-bold px-1.5 py-0.5 rounded text-xs ${
                          row.story_points <= 3 ? "bg-green-100 text-green-700" :
                          row.story_points <= 6 ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {row.story_points}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 font-mono">{row.external_ticket_id || "–"}</td>
                      <td className="px-4 py-2.5 text-gray-400 max-w-[200px] truncate">{row.description || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {importing && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {importing ? "Importiere..." : `${rows.length} Aufgabe${rows.length !== 1 ? "n" : ""} importieren`}
            </button>
            <button onClick={handleReset} className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Ergebnisse */}
      {results && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {successCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {successCount} erfolgreich
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {errorCount} Fehler
              </span>
            )}
            <button onClick={handleReset} className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition">
              Neuer Import
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {results.map((r) => (
                <div key={r.row} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${r.success ? "bg-green-100" : "bg-red-100"}`}>
                    {r.success ? (
                      <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 w-10">#{r.row}</span>
                  <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{r.title}</span>
                  {r.success ? (
                    <span className="text-xs text-gray-400 shrink-0">→ {r.sprint}</span>
                  ) : (
                    <span className="text-xs text-red-500 shrink-0">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
