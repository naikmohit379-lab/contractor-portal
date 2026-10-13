// Notification kinds, email preference groups and the rule that decides whether to email.

export const NOTIFICATION_GROUPS = {
  measurements: ["measurement.delivered", "measurement.failed"],
  claims: ["claim.status_changed"],
  orders: ["order.confirmed", "order.backordered"],
  waivers: ["waiver.signed", "waiver.declined"],
  payments: ["payment.succeeded", "payment.failed", "payment.dispute", "refund.approval_needed"],
} as const;
export type NotificationGroup = keyof typeof NOTIFICATION_GROUPS;
export const GROUP_LABELS: Record<NotificationGroup, string> = {
  measurements: "Aerial measurement reports",
  claims: "Claim status changes",
  orders: "Supplier order responses",
  waivers: "Waivers signed or declined",
  payments: "Payments, failures, disputes and refund approvals",
};

export type NotificationKind = (typeof NOTIFICATION_GROUPS)[NotificationGroup][number];

/** Money and paperwork are on by default; the rest stay in-app until someone opts in. */
export const DEFAULT_EMAIL_GROUPS: Record<NotificationGroup, boolean> = {
  measurements: false,
  claims: false,
  orders: false,
  waivers: true,
  payments: true,
};

export const groupOf = (kind: string): NotificationGroup | null =>
  (Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[]).find((g) => (NOTIFICATION_GROUPS[g] as readonly string[]).includes(kind)) ?? null;

export function wantsEmail(prefs: Partial<Record<NotificationGroup, boolean>> | undefined, kind: string): boolean {
  const g = groupOf(kind);
  if (!g) return false;
  return prefs?.[g] ?? DEFAULT_EMAIL_GROUPS[g];
}

export interface NotificationDTO {
  id: string;
  kind: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: string;
}

/** Messages the server pushes down the live event stream. */
export type LiveEvent =
  | { type: "invalidate"; keys: string[][] } // React Query key prefixes to refetch
  | { type: "notification"; notification: NotificationDTO };
