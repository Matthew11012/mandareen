'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

/**
 * Authentication Error Page
 * 
 * Displayed when OAuth authentication fails or encounters errors.
 * Provides user-friendly error messaging and navigation options.
 */
export default function AuthErrorPage() {
  const router = useRouter();

  // Auto-redirect to login after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login');
    }, 10000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#222831] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        {/* Error Icon */}
        <div className="h-16 w-16 mx-auto text-red-400">
          <svg fill="currentColor" viewBox="0 0 20 20" className="w-full h-full">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h1 className="text-white font-inter font-semibold text-2xl">
            Authentication Failed
          </h1>
          <p className="text-[#a6a6a6] font-inter text-sm leading-relaxed">
            We encountered an issue while trying to sign you in. This could be due to:
          </p>
          <ul className="text-[#a6a6a6] font-inter text-xs text-left space-y-1 mt-4">
            <li>• Account access was denied</li>
            <li>• Network connectivity issues</li>
            <li>• Service temporarily unavailable</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 pt-4">
          <Link href="/login">
            <Button variant="primary" size="full">
              Try Again
            </Button>
          </Link>
          
          <Link href="/signup">
            <Button variant="link" size="sm">
              Create a New Account
            </Button>
          </Link>
        </div>

        {/* Auto-redirect Notice */}
        <p className="text-[#666] font-inter text-xs">
          You&apos;
          ll be automatically redirected to the login page in a few seconds.
        </p>
      </div>
    </div>
  );
}