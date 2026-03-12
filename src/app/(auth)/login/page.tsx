"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Ungültige E-Mail-Adresse oder Passwort.");
    } else {
      router.push("/board");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex bg-[#FAFBFC]">
      {/* Left panel – branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-800 text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <span className="text-lg font-bold">ressourcify</span>
        </div>

        <div>
          <h1 className="text-4xl font-extrabold leading-tight mb-4">
            Standortbasiertes<br />Projektmanagement.
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed">
            Verwalte Story Points, plane Sprints und behalte den Überblick über alle Standorte – in Echtzeit.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: "SP-Kapazität", desc: "Automatisches Overflow & Cascade" },
              { label: "Kanban-Board", desc: "Drag & Drop mit Sprint-Blöcken" },
              { label: "Velocity-Tracking", desc: "Recharts-Diagramme pro Standort" },
              { label: "Webhooks", desc: "HMAC-signierte Echtzeit-Events" },
            ].map((f) => (
              <div key={f.label} className="bg-white/10 rounded-xl p-4">
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="text-xs text-blue-200 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-blue-300 text-sm">© 2026 ressourcify</p>
      </div>

      {/* Right panel – login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <span className="font-bold text-gray-900">ressourcify</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Willkommen zurück</h2>
          <p className="text-gray-500 text-sm mb-8">Melde dich an, um fortzufahren.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm bg-white"
                placeholder="name@beispiel.de"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm bg-white"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Anmelden...
                </span>
              ) : "Anmelden"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
