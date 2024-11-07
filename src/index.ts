import { configureAuthRoutes } from "./routes/auth";
import { configureInterviewRoutes } from "./routes/interview";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { ApiContext } from "./types";
import { Interview } from "./interview";
import { handleError } from "./middleware/handleError";

// Create our main Hono app instance with proper typing
const app = new Hono<ApiContext>();

// Create a separate router for API endpoints to keep things organized
const api = new Hono<ApiContext>();

// Set up global middleware that runs on every request
// - Logger gives us visibility into what's happening
app.use("*", logger());
app.onError(handleError);

// Wire up all our authentication routes (login, etc)
// These will be mounted under /api/v1/auth/
api.route("/auth", configureAuthRoutes());
api.route("/interviews", configureInterviewRoutes());

// Mount all API routes under the version prefix (e.g. /api/v1)
// This lets us make breaking changes in v2 without affecting v1 users
app.route("/api/v1", api);

export { Interview };

export default app;
