import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { EMAIL_EDITOR_SYSTEM_PROMPT } from "@/lib/prompts/email-editor";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "OpenAI API key is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { messages, html, selectedSectionId, selectedSectionHtml } = await req.json();

    if (!html) {
      return new Response(
        JSON.stringify({ error: "No email HTML provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine context to send to AI
    let contextHtml: string;
    let contextDescription: string;
    let systemPrompt: string;

    if (selectedSectionId && selectedSectionHtml) {
      // Scoped editing - only send the selected section
      contextHtml = selectedSectionHtml;
      contextDescription = `Selected section HTML (${selectedSectionId})`;
      systemPrompt = EMAIL_EDITOR_SYSTEM_PROMPT + `\n\n🚨 CRITICAL: SECTION EDITING MODE

You are editing ONLY ONE SECTION of the email. The user selected a single section.

INPUT: You will receive ONE <tr> element containing the section content.
OUTPUT: You MUST return EXACTLY ONE <tr> element with your modifications.

STRICT RULES:
❌ NEVER generate multiple <tr> elements
❌ NEVER duplicate the section
❌ NEVER create new sections
❌ NEVER add additional rows
✅ ONLY modify content INSIDE the single <tr> element
✅ Keep the same structure: ONE <tr> with ONE or more <td> inside
✅ Return a single, complete <tr>...</tr> element

EXAMPLE:
User says: "Make the heading red"
INPUT:  <tr><td><h1 style="color: black;">Hello</h1></td></tr>
OUTPUT: <tr><td><h1 style="color: red;">Hello</h1></td></tr>

❌ WRONG (duplicated):
<tr><td><h1 style="color: red;">Hello</h1></td></tr>
<tr><td><h1 style="color: red;">Hello</h1></td></tr>

Your response must be EXACTLY ONE <tr> element. Count your <tr> tags before responding.`;
    } else {
      // Full email editing
      contextHtml = html;
      contextDescription = "Full email HTML";
      systemPrompt = EMAIL_EDITOR_SYSTEM_PROMPT;
    }

    try {
      const result = streamText({
        model: openai("gpt-4o"),
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `${contextDescription}:\n\`\`\`html\n${contextHtml}\n\`\`\``,
          },
          ...messages,
        ],
      });

      return result.toDataStreamResponse();
    } catch (streamError) {
      console.error("StreamText error:", streamError);
      // Log more details about the error
      if (streamError instanceof Error) {
        console.error("Error message:", streamError.message);
        console.error("Error stack:", streamError.stack);
      }
      throw streamError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: "Failed to process request",
        details: errorMessage
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
