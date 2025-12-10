"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Sidebar } from "./sidebar";
import { Menu, LogOut, User, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Initialize as false to match SSR - will be updated after hydration
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isInitialMountRef = useRef(true);

  useLayoutEffect(() => {
    if (!isInitialMountRef.current) {
      setMounted(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setMounted(true);
        });
      });
    } else {
      requestAnimationFrame(() => {
        setMounted(true);
      });
      isInitialMountRef.current = false;
    }
  }, [pathname]);

  // Handle responsive behavior - runs after hydration to prevent SSR mismatch
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
        setShowMobileMenu(false);
      }
    };

    // Initial detection after mount to match client state
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useLayoutEffect(() => {
    if (
      prevPathnameRef.current !== null &&
      prevPathnameRef.current !== pathname
    ) {
      setShowMobileMenu(() => false);
    }
    prevPathnameRef.current = pathname;
  }, [pathname]);

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const toggleSidebar = () => {
    if (isMobile) {
      toggleMobileMenu();
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  const handleOverlayClick = () => {
    if (isMobile && showMobileMenu) {
      setShowMobileMenu(false);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-[var(--surface-main)] overflow-hidden">
      {/* Mobile Overlay */}
      {isMobile && showMobileMenu && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={handleOverlayClick}
        />
      )}

      {/* Sidebar */}
      <div
        id="sidebar-nav"
        role="navigation"
        aria-label="Main navigation"
        suppressHydrationWarning
        className={cn(
          "z-50",
          mounted && "transition-all duration-300 ease-in-out",
          isMobile
            ? cn(
                "fixed inset-y-0 left-0",
                showMobileMenu ? "translate-x-0" : "-translate-x-full"
              )
            : "relative h-full"
        )}
        style={{
          width: isMobile ? undefined : sidebarCollapsed ? "4rem" : "12rem",
        }}
      >
        <Sidebar isCollapsed={isMobile ? false : sidebarCollapsed} />
        {!isMobile && mounted && (
          <button
            onClick={toggleSidebar}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!sidebarCollapsed}
            className="absolute -right-3 top-20 w-6 h-6 bg-[var(--surface-card)] border border-[color:var(--border-strong)] rounded-full flex items-center justify-center hover:bg-[color:var(--surface-card-strong)] transition-colors duration-200 z-50 cursor-pointer hidden md:flex"
            style={{ zIndex: 9999 }}
          >
            {sidebarCollapsed ? (
              <ChevronRight
                className="w-3 h-3 text-[color:var(--text-secondary-strong)]"
                aria-hidden="true"
              />
            ) : (
              <ChevronLeft
                className="w-3 h-3 text-[color:var(--text-secondary-strong)]"
                aria-hidden="true"
              />
            )}
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Header Bar */}
        <header className="bg-[var(--surface-body)] border-b border-[color:var(--border-muted)] px-4 py-3 min-h-[75px] flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button */}
            {isMobile && (
              <button
                onClick={toggleMobileMenu}
                aria-label={
                  showMobileMenu
                    ? "Close navigation menu"
                    : "Open navigation menu"
                }
                aria-expanded={showMobileMenu}
                aria-controls="sidebar-nav"
                className="p-2 hover:bg-[var(--surface-card)] rounded-lg transition-colors duration-200 cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <Menu className="w-5 h-5 text-[color:var(--text-secondary-strong)]" aria-hidden="true" />
              </button>
            )}

            {/* Page Title */}
            <div>
              {title && (
                <h1 className="sm:text-xl font-inter font-semibold text-white">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm text-[color:var(--text-secondary-strong)] font-inter">{subtitle}</p>
              )}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-card)] rounded-lg min-h-[44px] cursor-pointer hover:bg-[color:var(--surface-card-hover)] transition-colors hidden sm:flex">
              <User className="w-4 h-4 text-[color:var(--text-secondary-strong)]" />
              <span className="text-sm font-inter text-[color:var(--text-secondary-strong)] hidden sm:block">
                {user?.username ||
                  user?.email?.split("@")[0] ||
                  "User"}
              </span>
            </div>

            <button
              onClick={logout}
              aria-label="Logout"
              className="p-3 min-w-[44px] min-h-[44px] hover:bg-red-600/20 hover:text-red-400 rounded-lg transition-all duration-200 group cursor-pointer"
            >
              <LogOut
                className="w-5 h-5 text-[color:var(--text-secondary-strong)] group-hover:text-red-400"
                aria-hidden="true"
              />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-[var(--surface-main)]">
          {/* aria-live region for inline announcements */}
          <div aria-live="polite" aria-atomic="true" className="sr-only" />
          <div className="h-full">{children}</div>
        </main>
      </div>
    </div>
  );
};
