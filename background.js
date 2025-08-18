chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
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

      let SYSTEM_PROMPT = `You are a text analysis expert. Your task is to analyze the given text and group it by paragraphs, phrases or sentences based on importance.

You should:
1. Identify the most important pieces of text that contain key information (assign priority 5, color green)
2. Find supporting text that helps understand the main points (assign priority 3-4, color yellow)
3. Mark standalone important information that doesn't directly support the main points (assign priority 4-5, color red)

For each text segment, provide:
- The exact text content
- A priority score from 1-5 (5 being most important)
- Color (green for main points, yellow for supporting text, red for important standalone text)
- A brief summary of why this text is important
- A unique numerical ID
- The ID of the text it supports (or "null" if it's a main point)

EXTREMELY IMPORTANT: Return ONLY a valid JSON array with NO explanations before or after. Follow this format EXACTLY:
[
  {
    "text": "...",
    "priority": 5,
    "color": "green",
    "summary": "...",
    "id": 12345,
    "supporting": null
  },
  ...
]

CRITICAL JSON FORMATTING RULES:
1. All property names must be in double quotes
2. All string values must be in double quotes
3. All quotes inside strings must be escaped with backslash
4. No trailing commas
5. Return ONLY the JSON array, nothing else
`;

      if (request.isChunk) {
        const idOffset = request.idOffset || request.chunkIndex * 10000;
        if (request.isContinuation) {
          // This is a continuation request for an incomplete response
          SYSTEM_PROMPT = `You are a text analysis expert. Your previous response was cut off or incomplete. 
      Please continue your analysis from where you left off.
      
      Return a valid JSON array with properly formatted items following the same format as before:
      [
        {
          "text": "...",
          "priority": 5,
          "color": "green",
          "summary": "...",
          "id": [next_id],
          "supporting": null
        },
        ...
      ]
      
      Start with a proper JSON array opening bracket and ensure it closes properly.
      Focus on completing the analysis of the remaining text in the chunk.`;
        } else {
          // Regular chunk processing
          SYSTEM_PROMPT += `\n\nIMPORTANT: This is chunk ${
            request.chunkIndex + 1
          } of ${
            request.totalChunks
          }. Focus on identifying important text in this chunk only. Use IDs starting from ${idOffset} for this chunk.`;
        }
      }

      const requestData = {
        contents: [
          {
            parts: [{ text: `${SYSTEM_PROMPT}\n\n${text}` }],
          },
        ],
      };

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
});
