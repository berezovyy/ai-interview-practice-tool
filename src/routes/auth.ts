import { Context, Hono } from "hono";
import { setCookie } from "hono/cookie";
import { BadRequestError } from "../errors";
import { ApiContext } from "../types";

export const authenticateUser = async (ctx: Context) => {
  // Extract username from request body
  const { username } = await ctx.req.json();

  // Make sure username was provided
  if (!username) {
    throw new BadRequestError("Username is required");
  }

  // Create a secure cookie to track the user's session
  // This cookie will:
  // - Be HTTP-only for security (no JS access)
  // - Work across all routes via path="/"
  // - Last for 24 hours
  // - Only be sent in same-site requests to prevent CSRF
  setCookie(ctx, "username", username, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24,
    sameSite: "Strict",
  });

  // Let the client know login was successful
  return ctx.json({ success: true });
};

// Set up authentication-related routes
export const configureAuthRoutes = () => {
  const router = new Hono<ApiContext>();

  // POST /login - Authenticate user and create session
  router.post("/login", authenticateUser);

  return router;
};
