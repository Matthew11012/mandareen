export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  badge?: string | number;
  isComingSoon?: boolean;
  description?: string;
}

export interface NavigationSection {
  id: string;
  title?: string;
  items: NavigationItem[];
}

export type NavigationData = NavigationSection[];
