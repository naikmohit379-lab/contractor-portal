export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const forbidden = (msg = "You do not have permission to do this") => new AppError(403, "forbidden", msg);
export const unauthenticated = (msg = "Sign in to continue") => new AppError(401, "unauthenticated", msg);
