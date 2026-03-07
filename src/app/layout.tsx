import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/shared/SessionProvider";

export const metadata: Metadata = {
  title: "ressourcify",
  description: "Standortbasiertes Projektmanagement-Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
