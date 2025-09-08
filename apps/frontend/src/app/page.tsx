'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth-store';

/**
 * Landing Page / Route Handler
 * 
 * Automatically redirects users based on authentication status:
 * - Authenticated users → Dashboard
 * - Unauthenticated users → Login page
 */
export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, initialize } = useAuthStore();

  useEffect(() => {
    // Initialize auth state from stored token
    initialize();
    
    // Redirect based on authentication status
    if (isAuthenticated) {
      router.push('/dashboard');
    } else {
      router.push('/auth/login');
    }
  }, [isAuthenticated, initialize, router]);

  // Loading state while determining route
  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-white border-t-transparent mx-auto" />
        <h2 className="text-white font-inter text-lg">
          Loading Mandareen...
        </h2>
      </div>
    </div>
  );
}