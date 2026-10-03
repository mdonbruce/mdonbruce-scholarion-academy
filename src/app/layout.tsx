import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage } from "@/i18n";
import "@/ui/styles/globals.css";
import { PwaRegister } from "@/ui/components/client/PwaRegister";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SCHOLARION_PUBLIC_URL ?? "http://localhost:3000"),
  title: { default: "Scholarion Academy — Learn. Earn. Build Your Future.", template: "%s · Scholarion Academy" },
  description: "Practical, hands-on AI and programming certificate programs with labs, an AI Tutor and verifiable credentials.",
  openGraph: { siteName: "Scholarion Academy", type: "website", images: ["/brand/scholarion-logo-full.png"] },
  applicationName: "Scholarion Academy",
  appleWebApp: { capable: true, title: "Scholarion", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b1f4d" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1126" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const c = jar.get(LOCALE_COOKIE)?.value;
  const lang = isLocale(c) ? c : localeFromAcceptLanguage(h.get("accept-language"));
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
