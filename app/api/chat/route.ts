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
      // Element editing - use Claude Sonnet 4.5 for precise edits
      contextHtml = selectedSectionHtml;
      contextDescription = `Section containing element (${selectedElementId})`;
      systemPrompt = EMAIL_EDITOR_SYSTEM_PROMPT + `\n\n🎯 CRITICAL: ELEMENT EDITING MODE

⚠️ THE USER HAS ALREADY SELECTED A SPECIFIC ELEMENT TO EDIT ⚠️

The user clicked on a specific element in the email preview. You are editing ONLY that element.

Selected Element:
- Type: ${selectedElementType || 'unknown'}
- Tag: ${selectedElementTag || 'unknown'}
- ID: ${selectedElementId}

When the user says "change to X" or "make it Y", they are referring to THIS SPECIFIC ELEMENT ONLY.
DO NOT ask for clarification - the element is already selected.

INPUT: You will receive ONE complete <tr> section containing the target element (marked with data-element-id="${selectedElementId}").

OUTPUT REQUIREMENTS - READ CAREFULLY:
✅ MUST return the COMPLETE <tr>...</tr> section EXACTLY as it was given to you
✅ ONLY change the TEXT CONTENT or INLINE STYLE inside the element with data-element-id="${selectedElementId}"
✅ Do NOT reformat, restructure, or "clean up" the HTML
✅ Do NOT change whitespace, indentation, or line breaks outside the target element
✅ Do NOT add any new elements (no images, no divs, no tables, NOTHING)
✅ Do NOT remove any elements
✅ Do NOT change the order of attributes
✅ Do NOT change any attributes except the text content or inline style of the target element
✅ PRESERVE EXACTLY as is (byte-for-byte):
   - All other elements in the section (keep same count, same order, same formatting)
   - All attributes (including data-element-id, data-element-type, data-section-id)
   - All table structure (tables, tr, td tags)
   - All inline styles on other elements
   - All images (do NOT add, remove, or move images)
   - All spacing and formatting
✅ Return VALID HTML (properly nested tags, closed tags)
✅ Do NOT add extra <tr> rows
✅ Do NOT remove the <tr> wrapper
✅ The ONLY thing that should change is the text/style inside the target element

🎯 SURGICAL PRECISION: Copy the entire input HTML, then ONLY modify the target element's content/style. Everything else must remain IDENTICAL.

EXAMPLE 1 - Text change:
User: "Change to 100,00 EUR"
INPUT:  <tr data-section-id="section-2"><td><p data-element-id="element-section-2-p-0">200,00 EUR</p><button>Buy</button></td></tr>
OUTPUT: <tr data-section-id="section-2"><td><p data-element-id="element-section-2-p-0">100,00 EUR</p><button>Buy</button></td></tr>

EXAMPLE 2 - Style change:
User: "Make it bold"
INPUT:  <tr data-section-id="section-1"><td><h1 data-element-id="element-section-1-h1-0">Title</h1><p>Text</p></td></tr>
OUTPUT: <tr data-section-id="section-1"><td><h1 data-element-id="element-section-1-h1-0" style="font-weight: bold;">Title</h1><p>Text</p></td></tr>

❌ WRONG - Reformatting the structure:
INPUT:  <tr data-section-id="section-2"><td><p data-element-id="element-section-2-p-0">200,00 EUR</p><button>Buy</button></td></tr>
OUTPUT: <tr data-section-id="section-2">
  <td>
    <p data-element-id="element-section-2-p-0">100,00 EUR</p>
    <button>Buy</button>
  </td>
</tr>
(This is WRONG because it added line breaks and indentation that weren't in the input)

❌ WRONG - Missing <tr> wrapper:
<td><p data-element-id="...">100,00 EUR</p></td>

❌ WRONG - Only returning the element:
<p data-element-id="...">100,00 EUR</p>

❌ WRONG - Changing unrelated elements:
INPUT:  <tr><td><h1 data-element-id="el-1">Price</h1><p data-element-id="el-2">100 EUR</p></td></tr>
User wants to change el-2
OUTPUT: <tr><td><h1 data-element-id="el-1" style="font-weight: bold;">Price</h1><p data-element-id="el-2">200 EUR</p></td></tr>
(This is WRONG because it also changed the h1 style, which was NOT requested)

Your response MUST start with <tr and end with </tr>

VALIDATION: Your output will be checked. If it contains more than one <tr> tag, it will be REJECTED.
Count your <tr> tags before responding. There should be EXACTLY ONE opening <tr> and ONE closing </tr>.`;
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
      const modelToUse = "claude-sonnet-4-5-20250929";

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

          const enhancedContent = `Change the selected ${elementTypeLabel} to: ${lastMessage.content}`;
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
