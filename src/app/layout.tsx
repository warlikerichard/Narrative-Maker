import type { Metadata } from "next";
import "@/styles/theme.css";
import "./globals.css";
import "@/styles/story-events.css";

export const metadata: Metadata = {
  title: "Narrative Maker — Your next world starts here",
  description:
    "A creative workspace for game narratives. Build worlds, develop characters, and connect your ideas.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
