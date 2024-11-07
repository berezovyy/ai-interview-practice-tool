import { DurableObject } from "cloudflare:workers";
import { InterviewDatabaseService } from "./services/InterviewDatabaseService";
import { InterviewData, InterviewTitle, InterviewSkill, Message } from "./types";
import { AIService } from "./services/AIService";

export class Interview extends DurableObject<CloudflareBindings> {
  private readonly db: InterviewDatabaseService;
  // We will use it to keep track of all active WebSocket connections for real-time communication
  private sessions: Map<WebSocket, { interviewId: string }>;
  private readonly aiService: AIService;

  constructor(state: DurableObjectState, env: CloudflareBindings) {
    super(state, env);
    // Store references to state and env that we'll need throughout the lifecycle

    // Initialize empty sessions map - we'll add WebSocket connections as users join
    this.sessions = new Map();
    // Set up our database connection using the DO's built-in SQLite instance
    this.db = new InterviewDatabaseService(state.storage.sql);
    // First-time setup: ensure our database tables exist
    // This is idempotent so safe to call on every instantiation
    this.db.createTables();

    // Keep WebSocket connections alive by automatically responding to pings
    // This prevents timeouts and connection drops
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    // Initialize the AI service with the Workers AI binding
    this.aiService = new AIService(this.env.AI);
  }

  // Entry point for all HTTP requests to this Durable Object
  // This will handle both initial setup and WebSocket upgrades
  async fetch(request: Request): Promise<Response> {
    // Check if this is a WebSocket upgrade request
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader?.toLowerCase().includes("websocket")) {
      return this.handleWebSocketUpgrade(request);
    }

    // If it's not a WebSocket request, we don't handle it
    return new Response("Not found", { status: 404 });
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    // Extract the interview ID from the URL - it should be the last segment
    const url = new URL(request.url);
    const interviewId = url.pathname.split("/").pop();

    if (!interviewId) {
      return new Response("Missing interviewId parameter", { status: 400 });
    }

    // Create a new WebSocket connection pair - one for the client, one for the server
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Keep track of which interview this WebSocket is connected to
    // This is important for routing messages to the right interview session
    this.sessions.set(server, { interviewId });

    // Tell the Durable Object to start handling this WebSocket
    this.ctx.acceptWebSocket(server);

    // Send the current interview state to the client right away
    // This helps initialize their UI with the latest data
    const interviewData = await this.db.getInterview(interviewId);
    if (interviewData) {
      server.send(
        JSON.stringify({
          type: "interview_details",
          data: interviewData,
        }),
      );
    }

    // Return the client WebSocket as part of the upgrade response
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    // Clean up when a connection closes to prevent memory leaks
    // This is especially important in long-running Durable Objects
    // this.sessions.delete(ws);
    console.log(`WebSocket closed: Code ${code}, Reason: ${reason}, Clean: ${wasClean}`);
  }

  /**
   * Handles incoming WebSocket messages, both binary audio data and text messages.
   * This is the main entry point for all WebSocket communication.
   */
  async webSocketMessage(ws: WebSocket, eventData: ArrayBuffer | string): Promise<void> {
    try {
      // Handle binary audio data from the client's microphone
      if (eventData instanceof ArrayBuffer) {
        await this.handleBinaryAudio(ws, eventData);
        return;
      }
      // Text messages will be handled by other methods
    } catch (error) {
      this.handleWebSocketError(ws, error);
    }
  }

  /**
   * Processes binary audio data received from the client.
   * Converts audio to text using Whisper and broadcasts processing status.
   */
  private async handleBinaryAudio(ws: WebSocket, audioData: ArrayBuffer): Promise<void> {
    try {
      const uint8Array = new Uint8Array(audioData);

      // Retrieve the associated interview session
      const session = this.sessions.get(ws);
      if (!session?.interviewId) {
        throw new Error("No interview session found");
      }

      // Generate unique ID to track this message through the system
      const messageId = crypto.randomUUID();

      // Let the client know we're processing their audio
      this.broadcast(
        JSON.stringify({
          type: "message",
          status: "processing",
          role: "user",
          messageId,
          interviewId: session.interviewId,
        }),
      );

      // Add: Use AI service to transcribe the audio
      const transcribedText = await this.aiService.transcribeAudio(uint8Array);

      // Store the transcribed message
      await this.addMessage(session.interviewId, "user", transcribedText, messageId);

      // Look up the full interview context - we need this to generate a good response
      const interview = await this.db.getInterview(session.interviewId);
      if (!interview) {
        throw new Error(`Interview not found: ${session.interviewId}`);
      }

      // Now it's the AI's turn to respond
      // First generate an ID for the assistant's message
      const assistantMessageId = crypto.randomUUID();

      // Let the client know we're working on the AI response
      this.broadcast(
        JSON.stringify({
          type: "message",
          status: "processing",
          role: "assistant",
          messageId: assistantMessageId,
          interviewId: session.interviewId,
        }),
      );

      // Generate the AI interviewer's response based on the conversation history
      const llmResponse = await this.aiService.processLLMResponse(interview);
      await this.addMessage(session.interviewId, "assistant", llmResponse, assistantMessageId);
    } catch (error) {
      console.error("Audio processing failed:", error);
      this.handleWebSocketError(ws, error);
    }
  }

  /**
   * Handles WebSocket errors by logging them and notifying the client.
   * Ensures errors are properly communicated back to the user.
   */
  private handleWebSocketError(ws: WebSocket, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error("WebSocket error:", errorMessage);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: errorMessage,
        }),
      );
    }
  }

  // Broadcasts a message to all connected WebSocket clients.
  private broadcast(message: string) {
    this.ctx.getWebSockets().forEach((ws) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      } catch (error) {
        console.error("Error broadcasting message to a WebSocket client:", error);
      }
    });
  }

  createInterview(title: InterviewTitle, skills: InterviewSkill[]): string {
    return this.db.createInterview(title, skills);
  }

  // Retrieves all interview sessions
  getAllInterviews(): InterviewData[] {
    return this.db.getAllInterviews();
  }

  // Adds a new message to the 'messages' table and broadcasts it to all connected WebSocket clients.
  addMessage(interviewId: string, role: "user" | "assistant", content: string, messageId: string): Message {
    const newMessage = this.db.addMessage(interviewId, role, content, messageId);
    this.broadcast(
      JSON.stringify({
        ...newMessage,
        type: "message",
      }),
    );
    return newMessage;
  }
}
