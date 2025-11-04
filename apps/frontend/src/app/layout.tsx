import type { Metadata, Viewport } from "next";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";
import { Toaster } from "sonner";
import "./globals.css";
import { Inter } from "next/font/google";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Mandareen - AI-Powered Mandarin Learning",
  description:
    "Learn Mandarin with AI-powered lessons, real-time conversation practice, and adaptive assessment.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#222831",
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Root Layout Component
 *
 * Features:
 * - Global font configuration (Inter)
 * - Toast notification system
 * - PWA manifest and meta tags
 * - Global CSS imports
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <Providers>{children}</Providers>

        {/* Global Toast Notifications */}
        <Toaster theme="dark" position="top-right" richColors />

        {/* Ensure service worker registers reliably in production */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
