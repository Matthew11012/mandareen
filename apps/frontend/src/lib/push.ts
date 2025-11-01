import { notificationsApi } from "@/lib/api/notifications";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
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
    // Ensure service worker is registered
    if (
      !navigator.serviceWorker.controller &&
      !(await navigator.serviceWorker.getRegistration())
    ) {
      throw new Error(
        "Service worker is not registered. Please ensure PWA is properly installed."
      );
    }

    const reg = await navigator.serviceWorker.ready;

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

    let sub: PushSubscription;
    try {
      const keyArray = urlBase64ToUint8Array(publicKey);
      // Create a new Uint8Array with ArrayBuffer to ensure proper typing
      const buffer = new ArrayBuffer(keyArray.length);
      const view = new Uint8Array(buffer);
      view.set(keyArray);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: view,
      });
    } catch (err) {
      if (err instanceof Error) {
        if (
          err.message.includes("permission") ||
          err.name === "NotAllowedError"
        ) {
          throw new Error(
            "Notification permission denied. Please allow notifications in your browser settings."
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
