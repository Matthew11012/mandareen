import { post, http } from "@/lib/http/http";

export type PushSubscribeBody = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
};

export const notificationsApi = {
  subscribe: (body: PushSubscribeBody) =>
    post<{ ok: true }>("notifications/subscribe", body),
  unsubscribe: (endpoint: string) =>
    http<{ ok: true }>({
      path: "notifications/subscribe",
      method: "DELETE",
      body: { endpoint },
    }),
};


