"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardCheck,
  BookOpen,
  Brain,
  MessageCircle,
  Search,
  TrendingUp,
  User,
  Settings,
  Sparkles,
  GraduationCap,
  Activity,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAVIGATION_DATA } from "@/lib/constants/navigation";
import type { NavigationItem } from "@/lib/types/navigation";
import { flashcardsApi } from "@/lib/api/flashcards";

// Icon mapping
const ICONS = {
  Home,
  ClipboardCheck,
  BookOpen,
  GraduationCap,
  Brain,
  MessageCircle,
  Search,
  TrendingUp,
  User,
  Settings,
  Activity,
  CreditCard,
} as const;

interface SidebarProps {
  isCollapsed: boolean;
}

interface NavItemProps {
  item: NavigationItem;
  isActive: boolean;
  isCollapsed: boolean;
  badgeCount?: number;
}

const NavItem: React.FC<NavItemProps> = ({
  item,
  isActive,
  isCollapsed,
  badgeCount,
}) => {
  const IconComponent = ICONS[item.icon as keyof typeof ICONS];

  const content = (
    <>
      {/* Icon */}
      <div className="flex-shrink-0 w-3.5 h-3.5">
        {IconComponent && (
          <IconComponent
            className={cn(
              "w-full h-full transition-colors duration-200",
              isActive ? "text-white" : "text-[#a6a6a6] group-hover:text-white"
            )}
          />
        )}
      </div>

      {/* Label and Coming Soon Badge */}
      <div
        className={cn(
          "flex items-center gap-2 min-w-0 transition-all duration-300 overflow-hidden",
          isCollapsed
            ? "opacity-0 w-0 min-w-0 max-w-0 flex-shrink-[999] pointer-events-none"
            : "opacity-100 flex-1"
        )}
        style={isCollapsed ? { width: 0, minWidth: 0, maxWidth: 0 } : undefined}
      >
        <span
          className={cn(
            "font-inter font-medium text-xs transition-colors duration-200 whitespace-nowrap",
            isActive ? "text-white" : "text-[#a6a6a6] group-hover:text-white"
          )}
        >
          {item.label}
        </span>
        {typeof badgeCount === "number" && badgeCount > 0 && (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full bg-[#333956] text-[#c6ceff] text-xs whitespace-nowrap transition-all duration-300",
              isCollapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-full"
            )}
          >
            {badgeCount}
          </span>
        )}

        {item.isComingSoon && (
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 bg-[#3a3f47] rounded-full whitespace-nowrap transition-all duration-300",
              isCollapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-full"
            )}
          >
            <Sparkles className="w-3 h-3 text-[#999999]" />
            <span className="text-xs font-inter text-[#999999]">Soon</span>
          </div>
        )}
      </div>

      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div className="absolute left-full ml-3 px-2 py-1 bg-[#2e323a] text-white text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 top-0">
          {item.label}
          {item.isComingSoon && (
            <span className="ml-2 text-[#999999]">• Coming Soon</span>
          )}
        </div>
      )}
    </>
  );

  const wrapperClassName = cn(
    "flex items-center py-2 rounded-md transition-all duration-200 group relative",
    "hover:bg-[#2e323a] cursor-pointer",
    {
      "bg-[#4040f2]/80 hover:bg-[#3636d9] shadow-lg shadow-blue-500/20":
        isActive,
      "opacity-60 cursor-not-allowed": item.isComingSoon,
      "px-2.5 gap-3": !isCollapsed,
      "px-2 gap-0": isCollapsed,
    }
  );

  if (item.isComingSoon) {
    return <div className={wrapperClassName}>{content}</div>;
  }

  return (
    <Link href={item.href} className={wrapperClassName}>
      {content}
    </Link>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed }) => {
  const pathname = usePathname();
  const [dueCount, setDueCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    flashcardsApi
      .due()
      .then((items) => {
        if (mounted) setDueCount(items.length);
      })
      .catch(() => {
        if (mounted) setDueCount(0);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-[#1a1d23] border-r border-[#2e323a] transition-all duration-300 ease-in-out relative overflow-hidden backdrop-filter backdrop-blur-lg",
        isCollapsed ? "w-16" : "w-48"
      )}
    >
      {/* Header */}
      <div className="flex items-center px-4 py-3 min-h-[75px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Image
            src="/icons/logo.svg"
            alt="Mandareen logo"
            width={28}
            height={28}
            className="rounded-lg flex-shrink-0 w-7 h-7"
          />
          <h1
            className={cn(
              "font-inter font-bold text-lg text-white whitespace-nowrap transition-all duration-300 overflow-hidden",
              isCollapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[200px]"
            )}
          >
            Mandareen
          </h1>
        </div>
      </div>

      {/* Toggle Button */}
      {/* Button removed and rendered outside Sidebar inside dashboard-layout.tsx */}

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 flex flex-col overflow-hidden py-3 transition-all duration-300",
          isCollapsed ? "px-4" : "px-3"
        )}
      >
        {/* Regular Sections */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-6">
          {NAVIGATION_DATA.filter((section) => section.id !== "account").map(
            (section) => (
              <div key={section.id} className="space-y-2">
                {/* Section Title */}
                {section.title && (
                  <div
                    className={cn(
                      "transition-all duration-300 overflow-hidden",
                      isCollapsed
                        ? "opacity-0 max-h-0 pb-0"
                        : "opacity-100 max-h-6 pb-1"
                    )}
                  >
                    <h2 className="text-xs font-inter font-semibold text-[#999999] uppercase tracking-wider px-2 whitespace-nowrap">
                      {section.title}
                    </h2>
                  </div>
                )}

                {/* Section Items */}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      isActive={
                        pathname === item.href ||
                        (item.id === "curriculum" &&
                          pathname.startsWith("/curriculum/")) ||
                        (item.id === "lessons" &&
                          pathname.startsWith("/lessons/")) ||
                        (item.id === "usage" &&
                          pathname.startsWith("/account/usage")) ||
                        (item.id === "billing" &&
                          pathname.startsWith("/account/billing"))
                      }
                      isCollapsed={isCollapsed}
                      badgeCount={
                        item.id === "flashcards" ? dueCount : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* Account Section - Sticks to Bottom */}
        {NAVIGATION_DATA.filter((section) => section.id === "account").map(
          (section) => (
            <div
              key={section.id}
              className="mt-auto pt-3 border-t border-[#2e323a] space-y-2"
            >
              {/* Section Title */}
              {section.title && (
                <div
                  className={cn(
                    "transition-all duration-300 overflow-hidden",
                    isCollapsed
                      ? "opacity-0 max-h-0 pb-0"
                      : "opacity-100 max-h-6 pb-1"
                  )}
                >
                  <h2 className="text-xs font-inter font-semibold text-[#999999] uppercase tracking-wider px-2 whitespace-nowrap">
                    {section.title}
                  </h2>
                </div>
              )}

              {/* Section Items */}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItem
                    key={item.id}
                    item={item}
                    isActive={
                      pathname === item.href ||
                      (item.id === "usage" &&
                        pathname.startsWith("/account/usage")) ||
                      (item.id === "billing" &&
                        pathname.startsWith("/account/billing"))
                    }
                    isCollapsed={isCollapsed}
                    badgeCount={item.id === "flashcards" ? dueCount : undefined}
                  />
                ))}
              </div>
            </div>
          )
        )}
      </nav>
    </aside>
  );
};
