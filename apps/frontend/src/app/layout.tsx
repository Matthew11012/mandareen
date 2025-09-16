import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Import Inter font matching Figma design
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mandareen - AI-Powered Mandarin Learning",
  description:
    "Learn Mandarin with AI-powered lessons, real-time conversation practice, and adaptive assessment.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-512x512.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#222831",
};

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
      <body className="font-inter antialiased">
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" href="/icons/icon-192x192.png" sizes="192x192" />
        <link rel="icon" href="/icons/icon-512x512.png" sizes="512x512" />
        {children}

        {/* Global Toast Notifications */}
        <Toaster theme="dark" position="top-right" richColors />
      </body>
    </html>
  );
}
