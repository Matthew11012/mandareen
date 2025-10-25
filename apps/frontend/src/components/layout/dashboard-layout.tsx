"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { Sidebar } from "./sidebar";
import { Menu, LogOut, User } from "lucide-react";
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Handle responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle mobile menu toggle
  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  // Handle sidebar toggle
  const toggleSidebar = () => {
    if (isMobile) {
      toggleMobileMenu();
    } else {
      setSidebarCollapsed(!sidebarCollapsed);
    }
  };

  // Close mobile menu when clicking outside
  const handleOverlayClick = () => {
    if (isMobile && showMobileMenu) {
      setShowMobileMenu(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#222831] overflow-hidden">
      {/* Mobile Overlay */}
      {isMobile && showMobileMenu && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={handleOverlayClick}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out z-50",
          isMobile
            ? cn(
                "fixed inset-y-0 left-0",
                showMobileMenu ? "translate-x-0" : "-translate-x-full"
              )
            : "relative"
        )}
      >
        <Sidebar
          isCollapsed={isMobile ? false : sidebarCollapsed}
          onToggle={toggleSidebar}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="bg-[#1a1d23] border-b border-[#2e323a] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button */}
            {isMobile && (
              <button
                onClick={toggleMobileMenu}
                className="p-2 hover:bg-[#2e323a] rounded-lg transition-colors duration-200 cursor-pointer"
              >
                <Menu className="w-5 h-5 text-[#a6a6a6]" />
              </button>
            )}

            {/* Page Title */}
            <div>
              {title && (
                <h1 className="text-xl font-inter font-semibold text-white">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm text-[#a6a6a6] font-inter">{subtitle}</p>
              )}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[#2e323a] rounded-lg min-h-[44px] cursor-pointer hover:bg-[#3a3e46] transition-colors">
              <User className="w-4 h-4 text-[#a6a6a6]" />
              <span className="text-sm font-inter text-[#a6a6a6] hidden sm:block">
                {user?.email || "User"}
              </span>
            </div>

            <button
              onClick={logout}
              className="p-3 min-w-[44px] min-h-[44px] hover:bg-red-600/20 hover:text-red-400 rounded-lg transition-all duration-200 group cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-[#a6a6a6] group-hover:text-red-400" />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-[#222831]">
          {/* aria-live region for inline announcements */}
          <div aria-live="polite" aria-atomic="true" className="sr-only" />
          <div className="h-full">{children}</div>
        </main>
      </div>
    </div>
  );
};
