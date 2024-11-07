import { Context, Next } from "hono";
import { AppError } from "../errors";

export const errorHandler = async (ctx: Context, next: Next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      return ctx.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("Unhandled error:", err);
    return ctx.json({ error: "Internal server error" }, { status: 500 });
  }
};
