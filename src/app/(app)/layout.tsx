import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shared/AppShell";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <AppShell userRole={session.user.role} userName={session.user.name} userLocale={session.user.locale}>
        {children}
      </AppShell>
    </NextIntlClientProvider>
  );
}
