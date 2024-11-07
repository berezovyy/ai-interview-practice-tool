import { Context } from "hono";
import { getCookie } from "hono/cookie";
import { UnauthorizedError } from "../errors";

export const requireAuth = async (ctx: Context, next: () => Promise<void>) => {
  // Get username from cookie
  const username = getCookie(ctx, "username");

  if (!username) {
    throw new UnauthorizedError("User is not logged in");
  }

  // Make username available to route handlers
  ctx.set("username", username);
  await next();
};
