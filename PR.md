# feat(conversations): Enhance UI with In-Context Usage, Error Handling, and Testing

## 1. What does this PR do?

This PR focuses on significantly enhancing the user interface and experience of the `/conversations` page. It introduces several key UI elements to provide users with real-time, in-context feedback about their resource usage and potential limits. This includes a **compact, expandable usage chip**, specific banners for quota and rate-limit errors, and a polite toast notification for near-capacity warnings.

Crucially, this PR also establishes a robust testing foundation for the frontend by introducing **Vitest** and **React Testing Library**, and includes the first set of component, integration, and accessibility tests for these new, critical UI components.

## 2. Why is this change important?

This is a crucial step in creating a more transparent and user-friendly experience. By providing immediate feedback about usage and limits directly within the conversation interface, we can prevent user frustration and help them understand their plan's boundaries without interrupting their workflow. The refined usage chip provides this information without cluttering the UI. Gracefully handling errors like rate limits with clear guidance improves usability.

The introduction of a formal testing framework is a massive investment in the project's long-term health, ensuring that these complex UI interactions are reliable and helping to prevent future regressions.

## 3. Key Changes

### 6.1 Usage Badge

-   The usage summary is now displayed in a **compact, expandable 'chip'** by default, reducing its idle footprint while still auto-expanding for high-usage alerts.

### 6.2 Error Surfaces

-   **Quota Exceeded:** A new inline error banner appears beneath the composer with an "Upgrade" CTA when a user's quota is exceeded.
-   **Rate Limited:** A banner provides clear guidance and a countdown when a user is rate-limited, with the send button disabled until they can retry.
-   **Concurrency Limit:** A banner advises the user to close other sessions if they hit a concurrency limit.
-   Ensured that errors from the SSE stream are correctly mapped to a toast or banner without breaking the UI.

### 6.3 Toast Notifications

-   Implemented a toast notification with `aria-live="polite"` to warn users when they are approaching their usage cap, without blocking interaction. The toast includes a dismiss option.

### 6.4 Mobile Ergonomics

-   Hardened the message composer for mobile by ensuring the input `font-size` is ≥ 16px (to prevent auto-zoom) and setting `touch-action: manipulation` on buttons for better responsiveness.
-   Verified and corrected the layout stacking order on small screens.

### 6.5 Testing

-   **New Testing Framework:** Added and configured **Vitest** and **React Testing Library**.
-   **Component Tests:** Wrote tests for the new error banners, mocking API responses to verify their behavior.
-   **Integration Tests:** Added an integration test to simulate SSE errors and confirm the correct UI response.
-   **Accessibility Tests:** Included tests to verify focus handling and the behavior of ARIA live regions.

## 4. Implementation Details

<details>
<summary>Click to expand for implementation details</summary>

### File Changes

-   **`apps/frontend/src/app/conversations/page.tsx`**: The main integration point for all the new UI components. It fetches usage data and conditionally renders the header, banners, and toasts based on that data and API responses.
-   **`apps/frontend/src/components/conversations/ConversationUsageHeader.tsx`**: The new, refined usage indicator. It defaults to a compact "chip" view and expands on click to show detailed usage.
-   **`apps/frontend/src/components/conversations/ConversationErrorBanner.tsx`**: A new component responsible for displaying contextual errors to the user, such as when a rate limit has been hit.
-   **`apps/frontend/src/components/conversations/ConversationUsageToast.tsx`**: A new toast component that appears to politely warn users when their resource consumption has exceeded 90%.
-   **`apps/frontend/src/components/conversations/MessageInput.tsx`**: Updated to improve mobile ergonomics, primarily by increasing the font size to 16px.
-   **`apps/frontend/vitest.config.ts` & `apps/frontend/test/setup.ts`**: New configuration files that set up the Vitest testing environment for the frontend application.
-   **`apps/frontend/test/conversations/*.test.tsx`**: A new suite of tests, including component tests for the new banners/toasts and an integration test for the rate-limit error flow, all built with React Testing Library.
-   **`package.json` & `package-lock.json`**: Updated to add new dev dependencies required for the testing framework, including `vitest` and `@testing-library/react`.

</details>

## 5. How to Manually Test

1.  **Conversation UI Functionality:**
    -   Log in and navigate to the `/conversations` page.
    -   Verify the usage indicator now appears as a **compact chip** by default.
    -   Confirm that clicking the chip expands it to show detailed usage information.
    -   **Test Toast:** If possible, mock the usage API to return >90% usage and confirm the toast notification appears and is dismissible.
    -   **Test Error Banners:** If possible, trigger `QUOTA_EXCEEDED`, `RATE_LIMITED`, and `CONCURRENCY_LIMIT` errors from the backend to verify that the correct inline banners and UI states (e.g., disabled button) are triggered.
2.  **Mobile Experience:**
    -   Using browser developer tools or a physical device, view the `/conversations` page.
    -   Confirm the message input field has a larger font size and is easy to use without the OS zooming in.
3.  **Run Automated Tests:**
    -   In the `apps/frontend` directory, run the command to execute the test suite (e.g., `npm test` or `npm run vitest`).
    -   Confirm that all new tests for banners, toasts, and accessibility pass successfully.

## 6. PR Checklist

-   [x] I have read and followed the contribution guidelines.
-   [x] My code follows the project's coding standards.
-   [x] I have added a testing framework and written unit/integration/a11y tests.
-   [x] I have tested my changes on the relevant devices/browsers to ensure no regressions.
-   [ ] I have updated the documentation (if applicable).
-   [x] All existing tests pass.