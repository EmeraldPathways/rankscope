import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RankScope SEO",
  description: "A focused SEO intelligence workspace for rankings, competitors, backlinks and site health.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
