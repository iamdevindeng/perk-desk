// Defines page metadata and the compliance footer shared by the application.
// Called by: Next.js App Router
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PAGE_SCROLL_OFFSET_PX } from "@/lib/config";
import "./globals.css";

const PAGE_TITLE = "Perk Desk";
const PAGE_DESCRIPTION = "Cardlytics tells you where members spend; Perk Desk tells you which unsigned local merchants to sign first.";
const PREVIEW_IMAGE = {
  url: "/opengraph-image.png", width: 1200, height: 630,
  alt: "Perk Desk merchant shortlist for a fictional demo program",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://perk-desk.vercel.app"),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE, description: PAGE_DESCRIPTION,
    type: "website", url: "/", images: [PREVIEW_IMAGE],
  },
  twitter: {
    card: "summary_large_image", title: PAGE_TITLE,
    description: PAGE_DESCRIPTION, images: [PREVIEW_IMAGE],
  },
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" className="h-full antialiased" style={{ scrollPaddingTop: PAGE_SCROLL_OFFSET_PX }}>
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="border-t px-6 py-5 text-sm text-muted-foreground">
          Merchant-selection tool. Not used for any credit decision or consumer ad targeting.
          {" "}Data: Qloo Taste AI · Map © OpenStreetMap contributors.
          <p className="mt-2">
            <a className="underline underline-offset-4" href="https://github.com/iamdevindeng/perk-desk/blob/main/LICENSE">MIT License</a>
            {" · "}<a className="underline underline-offset-4" href="https://github.com/iamdevindeng/perk-desk">Source on GitHub</a>
          </p>
        </footer>
      </body>
    </html>
  );
}
