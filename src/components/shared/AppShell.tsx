"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { WelcomeScreen } from "./WelcomeScreen";

interface AppShellProps {
  children: React.ReactNode;
  userRole: string;
  userName: string;
  userLocale: string;
  canAccessSettings: boolean;
}

export function AppShell({ children, userRole, userName, userLocale, canAccessSettings }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#FAFBFC]">
      <Sidebar userRole={userRole} userName={userName} canAccessSettings={canAccessSettings} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header userName={userName} userRole={userRole} userLocale={userLocale} />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <WelcomeScreen userName={userName} />
    </div>
  );
}
