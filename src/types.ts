import { Context } from "hono";

// Context type for our API endpoints, including environment bindings and user info
export interface ApiContext {
  Bindings: CloudflareBindings;
  Variables: {
    username: string;
  };
}

export type HonoCtx = Context<ApiContext>;

// List of technical skills we can assess during mock interviews.
// We focus on popular web technologies and programming languages
// that are commonly tested in real interviews.
export enum InterviewSkill {
  JavaScript = "JavaScript",
  TypeScript = "TypeScript",
  React = "React",
  NodeJS = "NodeJS",
  Python = "Python",
}

// Available interview types based on different engineering roles.
// This helps tailor the interview experience and questions to
// match the candidate's target position.
export enum InterviewTitle {
  JuniorDeveloper = "Junior Developer Interview",
  SeniorDeveloper = "Senior Developer Interview",
  FullStackDeveloper = "Full Stack Developer Interview",
  FrontendDeveloper = "Frontend Developer Interview",
  BackendDeveloper = "Backend Developer Interview",
  SystemArchitect = "System Architect Interview",
  TechnicalLead = "Technical Lead Interview",
}

// Tracks the current state of an interview session.
// This helps us manage the interview flow and show appropriate UI/actions
// at each stage of the process.
export enum InterviewStatus {
  Created = "created", // Interview is created but not started
  Pending = "pending", // Waiting for interviewer/system
  InProgress = "in_progress", // Active interview session
  Completed = "completed", // Interview finished successfully
  Cancelled = "cancelled", // Interview terminated early
}

// Defines who sent a message in the interview chat
export type MessageRole = "user" | "assistant" | "system";

// Structure of individual messages exchanged during the interview
export interface Message {
  messageId: string; // Unique identifier for the message
  interviewId: string; // Links message to specific interview
  role: MessageRole; // Who sent the message
  content: string; // The actual message content
  timestamp: number; // When the message was sent
}

// Main data structure that holds all information about an interview session.
// This includes metadata, messages exchanged, and the current status.
export interface InterviewData {
  interviewId: string;
  title: InterviewTitle;
  skills: InterviewSkill[];
  messages: Message[];
  status: InterviewStatus;
  createdAt: number;
  updatedAt: number;
}

// Input format for creating a new interview session.
// Simplified interface that accepts basic parameters needed to start an interview.
export interface InterviewInput {
  title: string;
  skills: string[];
}
