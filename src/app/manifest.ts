import type { MetadataRoute } from "next";

/** Installable web app (PWA): home-screen icon, standalone window, shortcuts. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Scholarion Academy",
    short_name: "Scholarion",
    description: "Hands-on AI and programming courses with labs, an AI Tutor and verifiable credentials.",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0b1f4d",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My Courses", url: "/app/courses", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Live Sessions", url: "/app/live", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Notifications", url: "/app/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
