export const ROLES = ["owner", "admin", "estimator", "pm", "billing", "operations", "readonly"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "job:read",
  "job:write",
  "measurement:order",
  "estimate:write",
  "claim:write",
  "order:send",
  "waiver:request",
  "payment:request",
  "payment:refund",
  "payment:approve",
  "report:view",
  "user:manage",
  "ops:dashboard:view",
  "ops:task:create",
  "ops:task:update",
  "job:assign",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/** Single source of truth for role -> permissions. The API enforces it, the web UI only uses it to hide controls. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "payment:refund"), // admins approve large refunds but cannot start one
  estimator: ["job:read", "job:write", "measurement:order", "estimate:write", "claim:write"],
  pm: ["job:read", "job:write", "measurement:order", "order:send", "waiver:request", "ops:dashboard:view", "ops:task:create", "ops:task:update", "job:assign"],
  billing: ["job:read", "claim:write", "waiver:request", "payment:request", "report:view"],
  operations: ["job:read", "ops:dashboard:view", "ops:task:create", "ops:task:update"],
  readonly: ["job:read"],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
