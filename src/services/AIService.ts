import { InterviewError, ErrorCodes } from "../errors";
import { InterviewData, Message } from "../types";

export class AIService {
  constructor(private readonly AI: Ai) {}

  async transcribeAudio(audioData: Uint8Array): Promise<string> {
    try {
      // Call the Whisper model to transcribe the audio
      const response = await this.AI.run("@cf/openai/whisper-tiny-en", {
        audio: Array.from(audioData),
      });

      if (!response?.text) {
        throw new Error("Failed to transcribe audio content.");
      }

      return response.text;
    } catch (error) {
      throw new InterviewError(
        "Failed to transcribe audio content",
        ErrorCodes.TRANSCRIPTION_FAILED
      );
    }
  }

  async processLLMResponse(interview: InterviewData): Promise<string> {
    const messages = this.prepareLLMMessages(interview);

    try {
      const { response } = await this.AI.run("@cf/meta/llama-2-7b-chat-int8", {
        messages,
      });

      if (!response) {
        throw new Error("Failed to generate a response from the LLM model.");
      }

      return response;
    } catch (error) {
      throw new InterviewError(
        "Failed to generate a response from the LLM model.",
        ErrorCodes.LLM_FAILED
      );
    }
  }

  private prepareLLMMessages(interview: InterviewData) {
    const messageHistory = interview.messages.map((msg: Message) => ({
      role: msg.role,
      content: msg.content,
    }));

    return [
      {
        role: "system",
        content: this.createSystemPrompt(interview),
      },
      ...messageHistory,
    ];
  }

  private createSystemPrompt(interview: InterviewData): string {
    const basePrompt = "You are conducting a technical interview.";
    const rolePrompt = `The position is for ${interview.title}.`;
    const skillsPrompt = `Focus on topics related to: ${interview.skills.join(
      ", "
    )}.`;
    const instructionsPrompt =
      "Ask relevant technical questions and provide constructive feedback.";

    return `${basePrompt} ${rolePrompt} ${skillsPrompt} ${instructionsPrompt}`;
  }
}
