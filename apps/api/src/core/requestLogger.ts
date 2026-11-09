type RequestLogFields = {
  id?: string | number;
  method?: string;
  url?: string;
  remoteAddress?: string;
  remotePort?: number;
};

/** Exclude headers so bearer tokens, webhook signatures, cookies, and proxy credentials never enter request logs. */
export function serializeRequestForLog(request: RequestLogFields) {
  return {
    id: request.id,
    method: request.method,
    url: request.url,
    remoteAddress: request.remoteAddress,
    remotePort: request.remotePort,
  };
}
