import { notificationsApi } from "@/lib/api/notifications";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Remove any whitespace
  const clean = base64String.trim();

  // Convert base64url to standard base64
  // Base64url uses - and _ instead of + and /
  let base64 = clean.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if needed (base64 requires length to be multiple of 4)
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 = base64 + "=".repeat(padLength);

  try {
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (err) {
    throw new Error(
      `Failed to decode VAPID public key. Make sure it's in base64url format. Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  // Trim whitespace that might be in the env variable
  return key.trim();
}

export async function isPushSupported(): Promise<boolean> {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    Notification?.permission !== "denied"
  );
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!(await isPushSupported())) {
    throw new Error("Push notifications are not supported in this browser");
  }

  try {
    // Ensure service worker is registered and ready
    // Wait for the service worker to be fully activated
    const reg = await navigator.serviceWorker.ready;

    // Verify the registration has an active service worker
    if (!reg.active && !reg.installing && !reg.waiting) {
      throw new Error(
        "Service worker is not active. Please refresh the page and try again."
      );
    }

    // Log registration info for debugging
    console.log("Service worker registration:", {
      scope: reg.scope,
      active: !!reg.active,
      installing: !!reg.installing,
      waiting: !!reg.waiting,
      updateViaCache: reg.updateViaCache,
    });

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Already subscribed, but make sure backend knows about it
      try {
        const body = existing.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };
        await notificationsApi.subscribe({
          endpoint: body.endpoint,
          keys: body.keys,
          userAgent: navigator.userAgent,
        });
      } catch (err) {
        // Backend sync failed, but subscription exists
        console.warn("Failed to sync existing subscription with backend:", err);
      }
      return existing;
    }

    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      throw new Error(
        "VAPID public key is not configured. Please configure NEXT_PUBLIC_VAPID_PUBLIC_KEY in your environment variables."
      );
    }

    // Validate key format (should be base64url, typically 87 characters)
    if (publicKey.length !== 87) {
      console.warn(
        `VAPID public key length is ${publicKey.length}, expected 87 characters. This might still work if the key format is correct.`
      );
    }

    // Check for invalid characters (base64url uses A-Z, a-z, 0-9, -, _)
    if (!/^[A-Za-z0-9_-]+$/.test(publicKey)) {
      throw new Error(
        "VAPID public key contains invalid characters. It should only contain A-Z, a-z, 0-9, -, and _ characters (base64url format)."
      );
    }

    let sub: PushSubscription;
    try {
      // Convert VAPID public key from base64url to Uint8Array
      const keyArray = urlBase64ToUint8Array(publicKey);

      // Validate key length (VAPID public key should be 65 bytes)
      if (keyArray.length !== 65) {
        console.error("VAPID key validation failed:", {
          encodedLength: publicKey.length,
          decodedLength: keyArray.length,
          expectedLength: 65,
          keyPreview: publicKey.substring(0, 30) + "...",
        });
        throw new Error(
          `Invalid VAPID public key length: ${keyArray.length} bytes (expected 65). The encoded key should be 87 characters. Please verify your NEXT_PUBLIC_VAPID_PUBLIC_KEY is correct.`
        );
      }

      console.log("VAPID key conversion successful:", {
        encodedLength: publicKey.length,
        decodedLength: keyArray.length,
        firstBytes: Array.from(keyArray.slice(0, 5)),
      });

      // Use the converted key array directly (TypeScript type assertion needed)
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyArray as BufferSource,
      });
    } catch (err) {
      console.error("Push subscription error details:", {
        error: err,
        publicKeyLength: publicKey.length,
        publicKeyPreview: publicKey.substring(0, 20) + "...",
      });

      if (err instanceof Error) {
        if (
          err.message.includes("permission") ||
          err.name === "NotAllowedError"
        ) {
          throw new Error(
            "Notification permission denied. Please allow notifications in your browser settings."
          );
        }

        // Provide more specific error messages
        if (err.message.includes("push service error")) {
          throw new Error(
            `Failed to subscribe to push: Registration failed - push service error. This usually means the VAPID key is invalid. Please verify NEXT_PUBLIC_VAPID_PUBLIC_KEY is correct and matches your backend VAPID public key. Error: ${err.message}`
          );
        }

        throw new Error(`Failed to subscribe to push: ${err.message}`);
      }
      throw new Error("Failed to subscribe to push notifications");
    }

    const body = sub.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    if (!body?.endpoint || !body?.keys) {
      throw new Error("Invalid subscription data received");
    }

    await notificationsApi.subscribe({
      endpoint: body.endpoint,
      keys: body.keys,
      userAgent: navigator.userAgent,
    });

    return sub;
  } catch (err) {
    console.error("subscribeToPush error:", err);
    throw err;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!(await isPushSupported())) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  try {
    const json = sub.toJSON() as { endpoint?: string };
    if (json?.endpoint) {
      await notificationsApi.unsubscribe(json.endpoint);
    }
  } catch {}
  return await sub.unsubscribe();
}
