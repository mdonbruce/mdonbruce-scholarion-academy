import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/ui/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000"),
  title: { default: "Scholarion Academy — Learn. Earn. Build Your Future.", template: "%s · Scholarion Academy" },
  description: "Practical, hands-on AI and programming certificate programs with labs, an AI Tutor and verifiable credentials.",
  openGraph: { siteName: "Scholarion Academy", type: "website", images: ["/brand/scholarion-logo-full.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b1f4d" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1126" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
