import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DraftLedger",
  description: "Fearless Draft preparation for League of Legends coaching staffs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
