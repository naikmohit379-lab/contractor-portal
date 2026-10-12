import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@roofdesk/shared";

export interface RequestContext {
  companyId: string;
  userId: string;
  role: Role;
}

/** Per-request tenant context. Models read companyId from here, so no query can forget it. */
export const requestContext = new AsyncLocalStorage<RequestContext>();
export const getContext = () => requestContext.getStore();
