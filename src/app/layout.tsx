import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "./SiteFooter";

export const metadata: Metadata = {
  title: "DraftLedger",
  description: "Fearless Draft preparation for League of Legends coaching staffs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // noinspection HtmlUnknownAnchorTarget (the #main target is the <main> element of each page, set in JSX)
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link no-print">
          Skip to main content
        </a>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
