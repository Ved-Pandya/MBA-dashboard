import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { PwaProvider } from "@/components/pwa-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeadlineOS - MBA Command Center",
  description: "One command center for every MBA deadline.",
  applicationName: "DeadlineOS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "DeadlineOS" },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#9d3829",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider><PwaProvider>{children}</PwaProvider></AuthProvider>
      </body>
    </html>
  );
}
