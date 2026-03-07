"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationBell } from "./NotificationBell";
import type { BoardTask } from "@/types/board";

interface HeaderProps {
  userName: string;
  userRole: string;
  userLocale: string;
  onTaskSelect?: (task: BoardTask) => void;
}

export function Header({ userName, userRole, userLocale, onTaskSelect }: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [locale, setLocale] = useState(userLocale);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  async function toggleLocale() {
    const newLocale = locale === "de" ? "en" : "de";
    setLocale(newLocale);
    // Cookie für next-intl setzen
    document.cookie = `locale=${newLocale};path=/;max-age=31536000`;
    // Locale in DB speichern
    await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: newLocale }),
    }).catch(() => null);
    // Seite neu laden damit next-intl greift
    window.location.reload();
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: "Administrator",
    sales: "Sales",
    viewer: "Betrachter",
  };

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-gray-100 shrink-0">
      {/* Globale Suche */}
      <div className="flex-1 max-w-sm">
        <GlobalSearch onTaskSelect={onTaskSelect} />
      </div>

      {/* Rechte Aktionen */}
      <div className="flex items-center gap-2 ml-4">
        {/* Sprach-Umschalter */}
        <button
          onClick={toggleLocale}
          className="px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          title={locale === "de" ? "Switch to English" : "Zu Deutsch wechseln"}
        >
          {locale === "de" ? "DE" : "EN"}
        </button>

        {/* Benachrichtigungen */}
        <NotificationBell />

        {/* User-Avatar-Menü */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition"
          >
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-800 leading-none">{userName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{ROLE_LABELS[userRole] ?? userRole}</p>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{userName}</p>
                <p className="text-xs text-gray-400">{ROLE_LABELS[userRole] ?? userRole}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={toggleLocale}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  Sprache: {locale === "de" ? "Deutsch" : "English"}
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Abmelden
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
