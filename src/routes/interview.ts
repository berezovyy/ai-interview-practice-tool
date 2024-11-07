import { Hono } from "hono";
import { BadRequestError } from "../errors";
import { InterviewInput, ApiContext, HonoCtx, InterviewTitle, InterviewSkill } from "../types";
import { requireAuth } from "../middleware/auth";

/**
 * Gets the Interview Durable Object instance for a given user.
 * We use the username as a stable identifier to ensure each user
 * gets their own dedicated DO instance that persists across requests.
 */
const getInterviewDO = (ctx: HonoCtx) => {
  const username = ctx.get("username");
  const id = ctx.env.INTERVIEW.idFromName(username);
  return ctx.env.INTERVIEW.get(id);
};

/**
 * Validates the interview creation payload.
 * Makes sure we have all required fields in the correct format:
 * - title must be present
 * - skills must be a non-empty array
 * Throws an error if validation fails.
 */
const validateInterviewInput = (input: InterviewInput) => {
  if (!input.title || !input.skills || !Array.isArray(input.skills) || input.skills.length === 0) {
    throw new BadRequestError("Invalid input");
  }
};

/**
 * GET /interviews
 * Retrieves all interviews for the authenticated user.
 * The interviews are stored and managed by the user's DO instance.
 */
const getAllInterviews = async (ctx: HonoCtx) => {
  const interviewDO = getInterviewDO(ctx);
  const interviews = await interviewDO.getAllInterviews();
  return ctx.json(interviews);
};

/**
 * POST /interviews
 * Creates a new interview session with the specified title and skills.
 * Each interview gets a unique ID that can be used to reference it later.
 * Returns the newly created interview ID on success.
 */
const createInterview = async (ctx: HonoCtx) => {
  const body = await ctx.req.json<InterviewInput>();
  validateInterviewInput(body);

  const interviewDO = getInterviewDO(ctx);
  const interviewId = await interviewDO.createInterview(body.title as InterviewTitle, body.skills as InterviewSkill[]);

  return ctx.json({ success: true, interviewId });
};

const streamInterviewProcess = async (ctx: HonoCtx) => {
  const interviewDO = getInterviewDO(ctx);
  return await interviewDO.fetch(ctx.req.raw);
};

/**
 * Sets up all interview-related routes.
 * Currently supports:
 * - GET / : List all interviews
 * - POST / : Create a new interview
 */
export const configureInterviewRoutes = () => {
  const router = new Hono<ApiContext>();
  router.use("*", requireAuth);
  router.get("/", getAllInterviews);
  router.post("/", createInterview);
  router.get("/:interviewId", streamInterviewProcess);
  return router;
};
