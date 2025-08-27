chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  let SYSTEM_PROMPT = `You are a text analysis expert. Your task is to analyze the given text and break it down into multiple meaningful segments based on importance.

ANALYSIS APPROACH:
1. First, examine markup tags like [block:h1], [text:p], etc. to understand document structure.

2. Break the text into logical segments based on complete thoughts or concepts.

3. Apply the Pareto principle (80/20 rule) - identify the critical 20% of content that delivers 80% of the value:
   - Main points (priority 5, color green): ONLY the most critical information (max 20% of segments)
   - Supporting text (priority 3-4, color yellow): Details that support or explain main points
   - Standalone important information (priority 4-5, color red): Important but independent points

OUTPUT FORMAT:
[
  {
    "text": "Overview of Booting Linux",
    "priority": 5,
    "color": "green",
    "summary": "Comprehensive overview of Linux boot sequence from BIOS to init process",
    "id": 1,
    "supporting": -1
  },
  {
    "text": "The BIOS program is stored in the ROM on the motherboard. When you power on your computer, the CPU is instructed to start executing code from a specific address mapped to this ROM area.",
    "priority": 4,
    "color": "yellow", 
    "summary": "BIOS stored in ROM, executes at startup",
    "id": 2,
    "supporting": 1
  }
]

SUMMARY WRITING GUIDELINES:
- For GREEN text (priority 5): Create comprehensive, concrete summaries that synthesize ALL related supporting information. These should be thorough enough that someone could understand the key point without reading the original text. (30-50 words)
- For YELLOW text (priority 3-4): Write brief, factual summaries focused only on what this specific segment contributes. (10-15 words)
- For RED text (priority 4-5): Create focused summaries highlighting why this information is important independently. (15-25 words)
- For code blocks: Explain what the code does, its purpose, and key functionality concisely.

BE EXTREMELY SELECTIVE with green (priority 5) segments. These should truly represent the most critical information - no more than 20% of your identified segments should be green.

JSON FORMATTING REQUIREMENTS:
1. All property names and string values must be in double quotes
2. Escape any quotes inside strings with backslash
3. Preserve line breaks and special characters in the text field
4. No trailing commas
5. Return only the JSON array with no explanations before or after
6. Use -1 for supporting field when segment doesn't support another segment

IMPORTANT: Remove all markup tags from the text in your final JSON output, but use them to understand structure.
`;

  if (request.action === "callGemini") {
    chrome.storage.sync.get(["endpoint", "key"], (credentials) => {
      if (!credentials.endpoint || !credentials.key) {
        sendResponse({
          success: false,
          error: "API credentials are not set in the extension popup.",
        });
        return;
      }
      const { endpoint, key: apiKey } = credentials;
      const text = request.text;

      // if (request.isChunk) {
      //   const idOffset = request.idOffset || request.chunkIndex * 10000;
      //   if (request.isContinuation) {
      //     // This is a continuation request for an incomplete response
      //     SYSTEM_PROMPT = `You are a text analysis expert. Your previous response was cut off or incomplete.
      // Please continue your analysis from where you left off.

      // Return a valid JSON array with properly formatted items following the same format as before:
      // [
      //   {
      //     "text": "...",
      //     "priority": 5,
      //     "color": "green",
      //     "summary": "...",
      //     "id": [next_id],
      //     "supporting": null
      //   },
      //   ...
      // ]

      // Start with a proper JSON array opening bracket and ensure it closes properly.
      // Focus on completing the analysis of the remaining text in the chunk.`;
      //   } else {
      //     // Regular chunk processing
      //     SYSTEM_PROMPT += `\n\nIMPORTANT: This is chunk ${
      //       request.chunkIndex + 1
      //     } of ${
      //       request.totalChunks
      //     }. Focus on identifying important text in this chunk only. Use IDs starting from ${idOffset} for this chunk.`;
      //   }
      // }

      const requestData = {
        contents: [
          {
            parts: [{ text: `${SYSTEM_PROMPT}\nINPUT:\n${text}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              highlights: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    text: { type: "STRING" },
                    priority: { type: "INTEGER" },
                    color: { type: "STRING" },
                    summary: { type: "STRING" },
                    id: { type: "INTEGER" },
                    supporting: { type: "INTEGER" },
                  },
                  required: [
                    "text",
                    "priority",
                    "summary",
                    "supporting",
                    "color",
                    "id",
                  ], // helps keep structure
                },
              },
            },
          },
        },
      };

      console.log("Request Data:", requestData);

      fetch(`${endpoint}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      })
        .then((response) => {
          if (!response.ok) {
            return response.json().then((err) => {
              throw new Error(
                err.error?.message || `HTTP error! status: ${response.status}`
              );
            });
          }
          return response.json();
        })
        .then((data) => {
          console.log("Full LLM Response:", data);
          const aiResponse = data.candidates[0].content.parts[0].text;
          console.log("LLM Response:", aiResponse);
          sendResponse({ success: true, data: aiResponse });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    });
    return true;
  }

  if (request.action === "countTokens") {
    chrome.storage.sync.get(["endpoint", "key"], (credentials) => {
      if (!credentials.endpoint || !credentials.key) {
        sendResponse({
          success: false,
          error: "API credentials are not set in the extension popup.",
        });
        return;
      }

      const { endpoint, key: apiKey } = credentials;
      let textToCount = request.text || "";

      if (request.includeSystemPrompt) {
        textToCount = `${SYSTEM_PROMPT}\n${textToCount}`;
      } else {
        textToCount = SYSTEM_PROMPT;
      }
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:countTokens?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: textToCount }],
              },
            ],
          }),
        }
      )
        .then((response) => {
          if (!response.ok) {
            return response.json().then((err) => {
              throw new Error(
                err.error?.message || `HTTP error! status: ${response.status}`
              );
            });
          }
          return response.json();
        })
        .then((data) => {
          sendResponse({
            success: true,
            tokenCount: data.totalTokens,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error.message,
            // Fallback approximation
            tokenCount: Math.ceil(textToCount.length / 4),
          });
        });

      return true;
    });
    return true;
  }
});
