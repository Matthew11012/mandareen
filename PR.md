feat(Backend): Add Billing, Rate Limiting, and Quota System 

## 1. What does this PR do?

This PR introduces a comprehensive billing, usage metering, and rate limiting system to the backend. It integrates with Polar for handling subscriptions and payments, and it enforces usage quotas and rate limits across various application resources.

## 2. Why is this change important?

This is a major step towards monetizing the application and ensuring its long-term sustainability. It is important because:
*   It provides the foundation for offering paid subscription plans with different feature sets and usage limits.
*   It protects the application from abuse and ensures fair usage of resources.
*   It allows for a staged rollout of billing features with the use of feature flags.
*   It establishes a robust and scalable architecture for handling billing and usage metering.

## 3. Key Changes

### Billing and Subscription Management

*   **Polar Integration:** A new `PolarAdapter` has been added to handle all communication with the Polar billing API, including customer creation, checkout sessions, and webhook signature verification.
*   **Checkout and Customer Portal:**
    *   `POST /api/billing/checkout`: A new endpoint to create checkout sessions for purchasing subscription plans.
    *   `GET /api/billing/portal`: A new endpoint to provide users with access to their billing portal to manage their subscriptions.
*   **Webhook Handling:**
    *   `BillingWebhookController`: A new controller to handle incoming webhooks from Polar. It verifies webhook signatures and persists events to the database.
    *   `BillingWebhookService`: A new service to process the business logic of the webhooks, including customer creation, subscription updates, and order events. It ensures idempotency and that a user can only have one active subscription.
*   **Database Schema:** The Prisma schema has been updated with new models for `Plan`, `PlanLimit`, `UserSubscription`, `BillingCustomer`, and other related tables to support the billing and usage metering system.

### Usage Metering and Quota Enforcement

*   **UsageService:** A new service to track usage of various resources (e.g., conversation messages, lesson generation) in a rolling 30-day window. It enforces monthly quotas based on the user's subscription plan.
*   **RateLimitService:** A new service that implements a token bucket algorithm to enforce rate limits (requests per minute) on various endpoints.
*   **ConcurrencyService:** A new service to manage concurrency limits, such as the number of simultaneous SSE streams a user can have open.
*   **Enforcement in Controllers:** The new billing services have been integrated into the `ConversationsController`, `LessonsStreamController`, `CurriculumController`, and `AssessmentController` to enforce quotas, rate limits, and concurrency limits.

### Testing and Documentation

*   **Unit and E2E Tests:** Comprehensive unit and E2E tests have been added for all new billing services and controllers to ensure their correctness and reliability.
*   **Performance Validation:** A performance validation script has been added to ensure that the billing services meet the required performance targets.
*   **Documentation:** Detailed documentation for the new billing services has been added to `BILLING_SERVICES.md` and `TESTING.md`.

## 4. How to Manually Test

1.  **Run Backend:**
    *   From the `apps/backend` directory, run the application:
        ```bash
        npm run start:dev
        ```
2.  **Seed Plans:**
    *   Run the seed script to create the initial subscription plans:
        ```bash
        npx ts-node apps/backend/src/scripts/seed-plans.ts
        ```
3.  **Test Billing Endpoints:**
    *   Use a tool like Postman or `curl` to test the new `/api/billing/checkout` and `/api/billing/portal` endpoints with a valid JWT token.
4.  **Test Webhook Endpoint:**
    *   Use a tool like `ngrok` to expose your local server to the internet and configure a webhook in your Polar account to point to the `ngrok` URL.
    *   Trigger events in Polar (e.g., create a customer or subscription) and verify that the `BillingWebhookController` receives and processes them correctly.
5.  **Test Quota and Rate Limiting:**
    *   With the `USAGE_ENFORCE` and `RATELIMIT_ENFORCE` feature flags enabled, make repeated requests to the various endpoints to verify that the quota and rate limits are being enforced correctly.

## 5. PR Checklist

-   [x] I have read and followed the contribution guidelines.
-   [x] This PR introduces a new feature.
-   [x] All code follows the project's established coding standards.
-   [x] I have run all new and existing tests to ensure they pass.
-   [x] All necessary documentation has been added or updated.
