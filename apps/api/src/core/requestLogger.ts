type RequestLogFields = {
  id?: string | number;
  method?: string;
  url?: string;
  remoteAddress?: string;
  remotePort?: number;
};

type ResponseLogFields = {
  statusCode?: number;
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

/** Log only the status code; never serialize Set-Cookie or other response headers. */
export function serializeResponseForLog(response: ResponseLogFields) {
  return { statusCode: response.statusCode };
}
