"use client";

import { useRequireAuth, useAuth } from "@/lib/hooks/use-auth";

/**
 * Dashboard Page (Protected Route)
 *
 * This is a placeholder dashboard that will be expanded later.
 * Currently serves as the main landing page after authentication.
 */
export default function DashboardPage() {
  const { isLoading } = useRequireAuth();
  const { logout, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#222831] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#222831] p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header with logout button */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-inter font-bold text-white">
            Dashboard
          </h1>
          <div className="flex items-center space-x-4">
            <span className="text-[#a6a6a6] font-inter">{user?.email}</span>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-inter rounded-lg transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="text-center space-y-6">
          <h2 className="text-4xl font-inter font-bold text-white">
            Welcome to Mandareen! 🎉
          </h2>
          <p className="text-xl text-[#a6a6a6] font-inter">
            Your authentication system is working perfectly.
          </p>
          <p className="text-[#a6a6a6] font-inter">
            Dashboard functionality will be implemented in the next sprint.
          </p>
        </div>
      </div>
    </div>
  );
}
