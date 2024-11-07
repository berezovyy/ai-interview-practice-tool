import {
  InterviewData,
  Message,
  InterviewStatus,
  InterviewTitle,
  InterviewSkill,
} from "../types";
import { InterviewError, ErrorCodes } from "../errors";

const CONFIG = {
  database: {
    tables: {
      interviews: "interviews",
      messages: "messages",
    },
    indexes: {
      messagesByInterview: "idx_messages_interviewId",
    },
  },
} as const;

export class InterviewDatabaseService {
  constructor(private sql: SqlStorage) {}

  /**
   * Sets up the database schema by creating tables and indexes if they don't exist.
   * This is called when initializing a new Durable Object instance to ensure
   * we have the required database structure.
   *
   * The schema consists of:
   * - interviews table: Stores interview metadata like title, skills, and status
   * - messages table: Stores the conversation history between user and AI
   * - messages index: Helps optimize queries when fetching messages for a specific interview
   */
  createTables() {
    try {
      // Get list of existing tables to avoid recreating them
      const cursor = this.sql.exec(`PRAGMA table_list`);
      const existingTables = new Set([...cursor].map((table) => table.name));

      // The interviews table is our main table storing interview sessions.
      // We only create it if it doesn't exist yet.
      if (!existingTables.has(CONFIG.database.tables.interviews)) {
        this.sql.exec(InterviewDatabaseService.QUERIES.CREATE_INTERVIEWS_TABLE);
      }

      // The messages table stores the actual conversation history.
      // It references interviews table via foreign key for data integrity.
      if (!existingTables.has(CONFIG.database.tables.messages)) {
        this.sql.exec(InterviewDatabaseService.QUERIES.CREATE_MESSAGES_TABLE);
      }

      // Add an index on interviewId to speed up message retrieval.
      // This is important since we'll frequently query messages by interview.
      this.sql.exec(InterviewDatabaseService.QUERIES.CREATE_MESSAGE_INDEX);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InterviewError(
        `Failed to initialize database: ${message}`,
        ErrorCodes.DATABASE_ERROR
      );
    }
  }

  /**
   * Creates a new interview session in the database.
   *
   * This is the main entry point for starting a new interview. It handles all the
   * initial setup like:
   * - Generating a unique ID using crypto.randomUUID() for reliable uniqueness
   * - Recording the interview title and required skills
   * - Setting up timestamps for tracking interview lifecycle
   * - Setting the initial status to "Created"
   *
   */
  createInterview(title: InterviewTitle, skills: InterviewSkill[]): string {
    try {
      const interviewId = crypto.randomUUID();
      const currentTime = Date.now();

      this.sql.exec(
        InterviewDatabaseService.QUERIES.INSERT_INTERVIEW,
        interviewId,
        title,
        JSON.stringify(skills), // Store skills as JSON for flexibility
        InterviewStatus.Created,
        currentTime,
        currentTime
      );

      return interviewId;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InterviewError(
        `Failed to create interview: ${message}`,
        ErrorCodes.DATABASE_ERROR
      );
    }
  }

  /**
   * Fetches all interviews from the database, ordered by creation date.
   *
   * This is useful for displaying interview history and letting users
   * resume previous sessions. We order by descending creation date since
   * users typically want to see their most recent interviews first.
   *
   * Returns an array of InterviewData objects with full interview details
   * including metadata and message history.
   */
  getAllInterviews(): InterviewData[] {
    try {
      const cursor = this.sql.exec(
        InterviewDatabaseService.QUERIES.GET_ALL_INTERVIEWS
      );

      return [...cursor].map(this.parseInterviewRecord);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InterviewError(
        `Failed to retrieve interviews: ${message}`,
        ErrorCodes.DATABASE_ERROR
      );
    }
  }

  // Retrieves an interview and its messages by ID
  getInterview(interviewId: string): InterviewData | null {
    try {
      const cursor = this.sql.exec(
        InterviewDatabaseService.QUERIES.GET_INTERVIEW,
        interviewId
      );

      const record = [...cursor][0];
      if (!record) return null;

      return this.parseInterviewRecord(record);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InterviewError(
        `Failed to retrieve interview: ${message}`,
        ErrorCodes.DATABASE_ERROR
      );
    }
  }

  addMessage(
    interviewId: string,
    role: Message["role"],
    content: string,
    messageId: string
  ): Message {
    try {
      const timestamp = Date.now();

      this.sql.exec(
        InterviewDatabaseService.QUERIES.INSERT_MESSAGE,
        messageId,
        interviewId,
        role,
        content,
        timestamp
      );

      return {
        messageId,
        interviewId,
        role,
        content,
        timestamp,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InterviewError(
        `Failed to add message: ${message}`,
        ErrorCodes.DATABASE_ERROR
      );
    }
  }

  /**
   * Transforms raw database records into structured InterviewData objects.
   *
   * This helper does the heavy lifting of:
   * - Type checking critical fields to catch database corruption early
   * - Converting stored JSON strings back into proper objects
   * - Filtering out any null messages that might have snuck in
   * - Ensuring timestamps are proper numbers
   *
   * If any required data is missing or malformed, it throws an error
   * rather than returning partially valid data that could cause issues
   * downstream.
   */
  private parseInterviewRecord(record: any): InterviewData {
    const interviewId = record.interviewId as string;
    const createdAt = Number(record.createdAt);
    const updatedAt = Number(record.updatedAt);

    if (!interviewId || !createdAt || !updatedAt) {
      throw new InterviewError(
        "Invalid interview data in database",
        ErrorCodes.DATABASE_ERROR
      );
    }

    return {
      interviewId,
      title: record.title as InterviewTitle,
      skills: JSON.parse(record.skills as string) as InterviewSkill[],
      messages: record.messages
        ? JSON.parse(record.messages)
            .filter((m: any) => m !== null)
            .map((m: any) => ({
              messageId: m.messageId,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            }))
        : [],
      status: record.status as InterviewStatus,
      createdAt,
      updatedAt,
    };
  }

  private static readonly QUERIES = {
    CREATE_INTERVIEWS_TABLE: `
      CREATE TABLE IF NOT EXISTS interviews (
        interviewId TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        skills TEXT NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        status TEXT NOT NULL DEFAULT 'pending'
      )
    `,
    CREATE_MESSAGES_TABLE: `
      CREATE TABLE IF NOT EXISTS messages (
        messageId TEXT PRIMARY KEY,
        interviewId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (interviewId) REFERENCES interviews(interviewId)
      )
    `,
    CREATE_MESSAGE_INDEX: `
      CREATE INDEX IF NOT EXISTS idx_messages_interview ON messages(interviewId)
    `,
    INSERT_INTERVIEW: `
      INSERT INTO ${CONFIG.database.tables.interviews} 
      (interviewId, title, skills, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `,

    GET_ALL_INTERVIEWS: `
      SELECT 
        interviewId, 
        title, 
        skills, 
        createdAt, 
        updatedAt, 
        status 
      FROM ${CONFIG.database.tables.interviews} 
      ORDER BY createdAt DESC
    `,

    INSERT_MESSAGE: `
      INSERT INTO ${CONFIG.database.tables.messages} 
      (messageId, interviewId, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `,

    GET_INTERVIEW: `
      SELECT 
        i.interviewId, 
        i.title, 
        i.skills, 
        i.status, 
        i.createdAt, 
        i.updatedAt,
        COALESCE(
          json_group_array(
            CASE WHEN m.messageId IS NOT NULL THEN
              json_object(
                'messageId', m.messageId,
                'role', m.role,
                'content', m.content,
                'timestamp', m.timestamp
              )
            END
          ),
          '[]'
        ) as messages
      FROM ${CONFIG.database.tables.interviews} i
      LEFT JOIN ${CONFIG.database.tables.messages} m ON i.interviewId = m.interviewId
      WHERE i.interviewId = ?
      GROUP BY i.interviewId
    `,
  };
}
