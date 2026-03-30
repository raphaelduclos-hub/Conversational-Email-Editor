import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { EMAIL_EDITOR_SYSTEM_PROMPT } from "@/lib/prompts/email-editor";

export const runtime = "edge";

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

    const { messages, html, selectedSectionId, selectedSectionHtml, selectedElementId, selectedElementType, selectedElementTag, multiSelectElementIds } = await req.json();

    // Debug log to see what's being sent
    console.log('🔍 API received:', {
      selectedElementId,
      selectedSectionId,
      hasSectionHtml: !!selectedSectionHtml
    });

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

    if (multiSelectElementIds && multiSelectElementIds.length > 0) {
      contextHtml = html;
      contextDescription = `Full email HTML`;
      systemPrompt = EMAIL_EDITOR_SYSTEM_PROMPT + `\n\n🎯 MULTI-EDIT MODE

The user has selected ${multiSelectElementIds.length} elements simultaneously. Their IDs are:
${multiSelectElementIds.map((id: string) => `- ${id}`).join('\n')}

These are all "${selectedElementType}" elements (tag: <${selectedElementTag}>).

Based on the user's instruction, return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{
  "action": "multi-edit",
  "summary": "Brief description of what was changed",
  "changes": [
    {
      "elementId": "element-section-X-tag-Y",
      "style": { "css-prop": "value" },
      "text": "optional new text"
    }
  ]
}

RULES:
- Include ALL ${multiSelectElementIds.length} element IDs in the "changes" array
- "style": object with ONLY the CSS properties that should change (kebab-case names, e.g. "font-size", "color", "font-weight")
- "text": include ONLY if text content should change; omit the field otherwise
- To remove a style property, set its value to ""
- "summary": short human-readable description like "Changed font size to 18px on 5 elements"
- Return ONLY the JSON object. No other text.`;
    } else if (selectedElementId) {
      // Element editing via JSON (surgical, no HTML manipulation risk)
      contextHtml = selectedSectionHtml;
      contextDescription = `Section HTML containing the target element`;
      systemPrompt = `You are an email element editor. Based on the HTML context and the user's instruction, return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{
  "action": "single-edit",
  "elementId": "${selectedElementId}",
  "summary": "Brief description of what changed",
  "style": { "css-property": "value" },
  "text": "new text content"
}

Target element:
- Type: ${selectedElementType || 'unknown'}
- Tag: <${selectedElementTag || 'unknown'}>
- ID: ${selectedElementId}

RULES:
- "style": object with ONLY the CSS properties to change (kebab-case: "font-weight", "color", "font-size", "text-align", etc.)
- "text": include ONLY if the user explicitly asks to change/replace the text content; OMIT for any style-only changes (bold, color, size, align, etc.)
- To remove a CSS property, set its value to ""
- "summary": one sentence like "Made the price bold" or "Changed text color to red"
- Return ONLY the JSON object. No other text. No code fences.

EXAMPLES:
User: "make it bold" → { "action": "single-edit", "elementId": "...", "summary": "Made text bold", "style": { "font-weight": "bold" } }
User: "make it red" → { "action": "single-edit", "elementId": "...", "summary": "Changed text color to red", "style": { "color": "red" } }
User: "change to Hello World" → { "action": "single-edit", "elementId": "...", "summary": "Changed text content", "text": "Hello World" }
User: "center align" → { "action": "single-edit", "elementId": "...", "summary": "Centered text alignment", "style": { "text-align": "center" } }`;
    } else if (selectedSectionId && selectedSectionHtml) {
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
❌ NEVER reformat, restructure, or "clean up" the HTML beyond what was requested
❌ NEVER change whitespace, indentation, or formatting unless it's part of the requested change
✅ ONLY modify the specific content the user asked to change
✅ Keep the same structure: ONE <tr> with ONE or more <td> inside
✅ Preserve all existing elements, attributes, and styles not mentioned in the request
✅ Return a single, complete <tr>...</tr> element

🎯 SURGICAL PRECISION: Make ONLY the requested change. Do not "improve" or reorganize other parts.

EXAMPLE 1 - Text change:
User says: "Make the heading red"
INPUT:  <tr><td><h1 style="color: black;">Hello</h1><p>World</p></td></tr>
OUTPUT: <tr><td><h1 style="color: red;">Hello</h1><p>World</p></td></tr>

EXAMPLE 2 - Content change:
User says: "Change the price to 50 EUR"
INPUT:  <tr data-section-id="section-1"><td align="center"><p style="font-size: 24px;">100 EUR</p><button>Buy</button></td></tr>
OUTPUT: <tr data-section-id="section-1"><td align="center"><p style="font-size: 24px;">50 EUR</p><button>Buy</button></td></tr>

❌ WRONG (duplicated):
<tr><td><h1 style="color: red;">Hello</h1></td></tr>
<tr><td><h1 style="color: red;">Hello</h1></td></tr>

❌ WRONG (reformatted without being asked):
INPUT:  <tr><td><h1 style="color: black;">Hello</h1><p>World</p></td></tr>
OUTPUT: <tr>
  <td>
    <h1 style="color: red;">Hello</h1>
    <p>World</p>
  </td>
</tr>
(This is WRONG because it added indentation that wasn't requested)

❌ WRONG (changed unrelated content):
INPUT:  <tr><td><h1 style="color: black;">Hello</h1><p style="font-size: 14px;">World</p></td></tr>
User asks to make heading red
OUTPUT: <tr><td><h1 style="color: red; font-weight: bold;">Hello</h1><p style="font-size: 16px;">World</p></td></tr>
(This is WRONG because it also made the heading bold and changed the paragraph font size, which wasn't requested)

Your response must be EXACTLY ONE <tr> element. Count your <tr> tags before responding.`;
    } else {
      // Full email editing
      contextHtml = html;
      contextDescription = "Full email HTML";
      systemPrompt = EMAIL_EDITOR_SYSTEM_PROMPT;
    }

    try {
      // Use Claude 3.5 Sonnet for better precision in HTML editing
      const modelToUse = "claude-sonnet-4-6";

      console.log('🤖 AI Model:', modelToUse, '| Element ID:', selectedElementId || 'none');

      // Enhance user messages when editing a specific element
      let enhancedMessages = messages;
      if (selectedElementId && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'user') {
          // Add context to the user's instruction
          const elementTypeLabel = selectedElementType === 'text' ? 'text element' :
                                   selectedElementType === 'image' ? 'image' :
                                   selectedElementType === 'heading' ? 'heading' :
                                   selectedElementType === 'button' ? 'button' :
                                   'element';

          const enhancedContent = `Instruction for the selected ${elementTypeLabel} (id: ${selectedElementId}): ${lastMessage.content}`;
          console.log('💬 Enhanced prompt:', enhancedContent);

          enhancedMessages = [
            ...messages.slice(0, -1),
            {
              ...lastMessage,
              content: enhancedContent
            }
          ];
        }
      } else if (multiSelectElementIds && multiSelectElementIds.length > 0 && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'user') {
          enhancedMessages = [
            ...messages.slice(0, -1),
            {
              ...lastMessage,
              content: `Apply to all ${multiSelectElementIds.length} selected ${selectedElementType} elements: ${lastMessage.content}`,
            }
          ];
        }
      }

      // Filter out assistant messages that are raw HTML (previous section edits)
      // to avoid confusing the AI about which section is being targeted
      const cleanMessages = enhancedMessages.filter((msg: any) => {
        if (msg.role !== 'assistant') return true;
        const content = (msg.content || '').trim();
        return !(
          content.includes('<table') ||
          content.includes('<tr') ||
          content.includes('<!DOCTYPE') ||
          content.startsWith('SUMMARY:')
        );
      });

      const result = streamText({
        model: anthropic(modelToUse),
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `${contextDescription}:\n\`\`\`html\n${contextHtml}\n\`\`\``,
          },
          ...cleanMessages,
        ],
      });

      return result.toTextStreamResponse();
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
