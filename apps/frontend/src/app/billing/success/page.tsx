"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ArrowRight, Home, ExternalLink } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/lib/hooks/use-auth";
import { trackPageView } from "@/lib/analytics/analytics";

export default function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const customerSessionToken = searchParams.get("customer_session_token");
  const { isLoading: authLoading } = useRequireAuth();

  useEffect(() => {
    trackPageView("billing_success", {
      hasSessionId: Boolean(sessionId),
      hasCustomerSessionToken: Boolean(customerSessionToken),
    });
  }, [sessionId, customerSessionToken]);

  return (
    <DashboardLayout
      title="Billing success"
      subtitle="Your payment was processed successfully."
    >
      <div className="p-6 space-y-6">
        <div className="bg-[#2e323a] rounded-xl p-6 border border-[#404040]">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-inter font-semibold text-white mb-2">
                Payment confirmed
              </h2>
              <p className="text-sm text-[#a6a6a6] font-inter">
                Thanks for upgrading. It may take a few seconds for your new
                plan to reflect in the app while we process the billing event.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:flex sm:flex-row">
            <Link href="/dashboard" className="sm:w-auto w-full">
              <Button
                variant="primary"
                size="default"
                className="w-full p-4 min-h-[44px] bg-[#4040f2]"
                disabled={authLoading}
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                Go to dashboard
              </Button>
            </Link>
            <Link href="/account/billing" className="sm:w-auto w-full">
              <Button
                variant="primary"
                size="default"
                className="w-full p-4 min-h-[44px]"
                disabled={authLoading}
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                Manage subscription
              </Button>
            </Link>
            <Link href="/pricing" className="sm:w-auto w-full">
              <Button
                variant="primary"
                size="default"
                className="w-full min-h-[44px] text-white bg-transparent border border-[#404040] hover:bg-[#2e323a]"
              >
                <ArrowRight className="w-4 h-4 mr-2" aria-hidden="true" />
                View plans
              </Button>
            </Link>
          </div>

          <div className="mt-4 rounded-lg bg-[#252931] border border-[#3a3f47] p-4 space-y-2">
            <p className="text-xs text-[#cfd3dc] font-inter">
              We&apos;ll apply your new limits as soon as the billing provider
              confirms the subscription. If you don&apos;t see your upgrade
              after a minute, refresh the page.
            </p>
            {sessionId && (
              <p className="text-[11px] text-[#9aa0aa] font-mono break-all">
                Checkout session: {sessionId}
              </p>
            )}
            {customerSessionToken && (
              <p className="text-[11px] text-[#9aa0aa] font-mono break-all">
                Customer session token: {customerSessionToken}
              </p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
