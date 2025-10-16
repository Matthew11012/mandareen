import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { Inter } from "next/font/google";

export const metadata: Metadata = {
  title: "Mandareen - AI-Powered Mandarin Learning",
  description:
    "Learn Mandarin with AI-powered lessons, real-time conversation practice, and adaptive assessment.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-512x512.png",
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
        {children}

        {/* Global Toast Notifications */}
        <Toaster theme="dark" position="top-right" richColors />
      </body>
    </html>
  );
}
