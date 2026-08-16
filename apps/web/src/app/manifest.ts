import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DeadlineOS - MBA Command Center",
    short_name: "DeadlineOS",
    description: "Assignments, academics, opportunities, and compliance in one MBA command center.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f3f4ef",
    theme_color: "#174d3d",
    orientation: "any",
    categories: ["productivity", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
