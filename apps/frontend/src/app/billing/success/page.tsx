import { Suspense } from "react";
import BillingSuccessClient from "./billing-success-client";

export const dynamic = "force-dynamic";

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={null}>
      <BillingSuccessClient />
    </Suspense>
  );
}
