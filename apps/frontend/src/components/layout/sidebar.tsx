"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
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
  ChevronLeft,
  ChevronRight,
  Sparkles,
  GraduationCap,
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
} as const;

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
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
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
        "hover:bg-[#2e323a] cursor-pointer",
        {
          "bg-[#4040f2] hover:bg-[#3636d9] shadow-lg shadow-blue-500/20":
            isActive,
          "opacity-60 cursor-not-allowed": item.isComingSoon,
          "justify-center px-2": isCollapsed,
        }
      )}
    >
      {/* Icon */}
      <div className={cn("flex-shrink-0", isCollapsed ? "w-5 h-5" : "w-5 h-5")}>
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
      {!isCollapsed && (
        <>
          <span
            className={cn(
              "font-inter font-medium text-sm transition-colors duration-200 flex-1",
              isActive ? "text-white" : "text-[#a6a6a6] group-hover:text-white"
            )}
          >
            {item.label}
          </span>
          {typeof badgeCount === "number" && badgeCount > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-[#333956] text-[#c6ceff] text-xs">
              {badgeCount}
            </span>
          )}

          {item.isComingSoon && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-[#3a3f47] rounded-full">
              <Sparkles className="w-3 h-3 text-[#999999]" />
              <span className="text-xs font-inter text-[#999999]">Soon</span>
            </div>
          )}
        </>
      )}

      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-[#2e323a] text-white text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          {item.label}
          {item.isComingSoon && (
            <span className="ml-2 text-[#999999]">• Coming Soon</span>
          )}
        </div>
      )}
    </div>
  );

  if (item.isComingSoon) {
    return content;
  }

  return (
    <Link href={item.href} className="block">
      {content}
    </Link>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
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
        "flex flex-col h-screen bg-[#1a1d23] border-r border-[#2e323a] transition-all duration-300 ease-in-out relative",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#2e323a]">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">普</span>
            </div>
            <h1 className="font-inter font-bold text-xl text-white">
              Mandareen
            </h1>
          </div>
        )}

        {isCollapsed && (
          <div className="w-8 h-8 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center mx-auto">
            <span className="text-white font-bold text-lg">普</span>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-[#2e323a] border border-[#404040] rounded-full flex items-center justify-center hover:bg-[#3a3f47] transition-colors duration-200 z-10 cursor-pointer hidden md:flex "
      >
        {isCollapsed ? (
          <ChevronRight className="w-3 h-3 text-[#a6a6a6]" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-[#a6a6a6]" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAVIGATION_DATA.map((section) => (
          <div key={section.id} className="space-y-2">
            {/* Section Title */}
            {section.title && !isCollapsed && (
              <h2 className="text-xs font-inter font-semibold text-[#999999] uppercase tracking-wider px-3 pb-1">
                {section.title}
              </h2>
            )}

            {/* Section Items */}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={pathname === item.href}
                  isCollapsed={isCollapsed}
                  badgeCount={item.id === "flashcards" ? dueCount : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[#2e323a]">
        {!isCollapsed && (
          <div className="text-center">
            <p className="text-xs text-[#999999] font-inter">
              v1.0.0 • Learning Platform
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
