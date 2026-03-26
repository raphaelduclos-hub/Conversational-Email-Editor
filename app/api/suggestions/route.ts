import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export const runtime = "edge";

const SUGGESTIONS_SYSTEM_PROMPT = `You are an AI assistant that suggests next actions for editing an email.

Given the current state of an email, suggest 2-3 specific, actionable next steps the user might want to take.

Rules:
- Suggestions must be complete, implementable commands
- Always use "Add a section with..." format (NOT "Insert" or incomplete phrases)
- Keep them short (under 60 characters)
- Make them varied (don't suggest similar things)
- Focus on common email sections: testimonials, FAQ, social media footer, promotion banner, product showcase, CTA sections
- Return ONLY valid JSON in this exact format: {"suggestions": ["action 1", "action 2", "action 3"]}
- Use English language
- Be creative but practical
- Each suggestion should be self-contained and tell the AI exactly what to create

Examples of good suggestions:
- "Add a section with customer testimonials"
- "Add a footer with social media links"
- "Add a promotional banner at the top"
- "Add an FAQ section"
- "Add a section with 3 product cards"`;

export async function POST(req: Request) {
  try {
    // Check if Anthropic API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Anthropic API key is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { html } = await req.json();

    if (!html) {
      return new Response(
        JSON.stringify({ error: "No email HTML provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"), // Use Haiku for faster/cheaper suggestions
      system: SUGGESTIONS_SYSTEM_PROMPT,
      prompt: `Current email HTML:\n\`\`\`html\n${html}\n\`\`\`\n\nGenerate 3 suggestions for what to do next.`,
    });

    // Parse the JSON response (strip markdown code fences if present)
    let jsonText = result.text.trim();

    // Remove markdown code fences if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      throw new Error("Invalid suggestions format");
    }

    return new Response(
      JSON.stringify({ suggestions: parsed.suggestions }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Suggestions API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate suggestions" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
