// Defines page metadata and the compliance footer shared by the application.
// Called by: Next.js App Router
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perk Desk",
  description: "Cardlytics tells you where members spend; Perk Desk tells you which unsigned local merchants to sign first.",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="border-t px-6 py-5 text-sm text-muted-foreground">
          Merchant-selection tool. Not used for any credit decision or consumer ad targeting.
          {" "}Data: Qloo Taste AI · Map © OpenStreetMap contributors.
        </footer>
      </body>
    </html>
  );
}
