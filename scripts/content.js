// Constants for UI and chunking
const CONSTANTS = {
  buttonID: "prioritize-text-button",
  outputElementID: "prioritize-output-container",
  shadowRootID: "prioritize-shadow-root",
  MAX_CHUNK_SIZE: 25000,
  DEBUG_MAX_CHUNKS: null,
};

// Create Shadow DOM to avoid CSS conflicts
const shadowHost = document.createElement("div");
shadowHost.id = CONSTANTS.shadowRootID;
shadowHost.style.cssText = "position:fixed;z-index:9999;";
document.body.appendChild(shadowHost);

const shadowRoot = shadowHost.attachShadow({ mode: "closed" });

// Create floating button and output container UI
function createUI() {
  const button = document.createElement("button");
  button.id = CONSTANTS.buttonID;
  button.textContent = "Prioritize Text";
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    background: #4285f4;
    color: white;
    border: none;
    border-radius: 50%;
    width: 60px;
    height: 60px;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const outputElement = document.createElement("div");
  outputElement.id = CONSTANTS.outputElementID;
  outputElement.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 20px;
    width: 350px;
    max-height: 400px;
    overflow-y: auto;
    background: #1f1f1f;
    color: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
    display: none;
  `;

  shadowRoot.appendChild(button);
  shadowRoot.appendChild(outputElement);

  button.addEventListener("click", captureAndProcess);
}

// Extracts text nodes from the page and chunks them
function captureAndProcess() {
  const textNodes = [];

  function extractTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text.length > 0) {
        textNodes.push({
          node: node,
          text: text,
          parentElement: node.parentElement,
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (
        node.tagName === "CODE" ||
        node.tagName === "PRE" ||
        (node.className &&
          typeof node.className === "string" &&
          (node.className.includes("hljs") || node.className.includes("code")))
      ) {
        const codeText = node.textContent.trim();
        if (codeText.length > 0) {
          textNodes.push({
            node: node,
            text: codeText,
            parentElement: node.parentElement,
            isCodeBlock: true,
            originalHTML: node.innerHTML,
          });
        }
        return;
      }
      if (
        node !== shadowHost &&
        getComputedStyle(node).display !== "none" &&
        getComputedStyle(node).visibility !== "hidden"
      ) {
        for (let i = 0; i < node.childNodes.length; i++) {
          extractTextNodes(node.childNodes[i]);
        }
      }
    }
  }

  extractTextNodes(document.body);

  const chunks = [];
  let currentChunk = [];
  let currentChunkSize = 0;

  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    if (
      currentChunkSize + node.text.length > CONSTANTS.MAX_CHUNK_SIZE &&
      currentChunk.length > 0
    ) {
      chunks.push({
        textNodes: currentChunk,
        text: currentChunk.map((item) => item.text).join("\n"),
      });
      currentChunk = [];
      currentChunkSize = 0;
    }
    currentChunk.push(node);
    currentChunkSize += node.text.length;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      textNodes: currentChunk,
      text: currentChunk.map((item) => item.text).join("\n"),
    });
  }

  console.log(`Created ${chunks.length} chunks`);
  processAllChunks(chunks, textNodes);
}

// Processes the entire page text (not chunked)
async function processText(pageText, textNodes) {
  const outputElement = shadowRoot.getElementById(CONSTANTS.outputElementID);
  outputElement.style.display = "block";
  outputElement.innerHTML =
    '<div style="padding:10px;text-align:center">Processing...</div>';

  try {
    const aiResponse = await sendToGemini(pageText);
    const cleanedResponse = cleanLLMResponse(aiResponse);
    const prioritizedText = JSON.parse(cleanedResponse);
    applyTextHighlighting(prioritizedText, textNodes);

    outputElement.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>Text Prioritization Complete</div>
        <button style="background:transparent;border:none;color:#aaa;cursor:pointer;font-size:18px">×</button>
      </div>
      <div style="background:#252525;padding:12px;border-radius:6px;font-size:13px">
        <p>Highlighted text by priority:</p>
        <div style="display:flex;gap:10px;margin-bottom:8px">
          <span style="background:green;color:white;padding:2px 8px;border-radius:4px">High priority</span>
          <span style="background:yellow;color:black;padding:2px 8px;border-radius:4px">Supporting</span>
          <span style="background:red;color:white;padding:2px 8px;border-radius:4px">Important standalone</span>
        </div>
        <button id="reset-highlights" style="margin-top:12px;padding:8px;width:100%;background:#404040;border:none;border-radius:4px;color:white;cursor:pointer">
          Reset Highlights
        </button>
      </div>
    `;

    outputElement
      .querySelector("button#reset-highlights")
      .addEventListener("click", () => {
        resetHighlights();
      });

    outputElement
      .querySelector('button[style*="background:transparent"]')
      .addEventListener("click", () => {
        outputElement.style.display = "none";
      });
  } catch (error) {
    outputElement.innerHTML = `<div style="color:#ff6b6b;padding:10px">Error: ${error.message}</div>`;
  }
}
/**
 * Processes all text chunks, sends them to the LLM, handles incomplete responses,
 * combines results, and applies highlighting to the DOM.
 */
async function processAllChunks(chunks, allTextNodes) {
  const outputElement = shadowRoot.getElementById(CONSTANTS.outputElementID);
  outputElement.style.display = "block";
  const processChunks = CONSTANTS.DEBUG_MAX_CHUNKS
    ? chunks.slice(0, CONSTANTS.DEBUG_MAX_CHUNKS)
    : chunks;
  outputElement.innerHTML =
    '<div style="padding:10px;text-align:center">Processing text in ' +
    processChunks.length +
    " chunks..." +
    (CONSTANTS.DEBUG_MAX_CHUNKS
      ? ` (Debug mode: limited to ${CONSTANTS.DEBUG_MAX_CHUNKS} chunks)`
      : "") +
    "</div>";

  try {
    let allPrioritizedItems = [];
    let chunkOffset = 10000;

    for (let i = 0; i < processChunks.length; i++) {
      outputElement.innerHTML = `<div style="padding:10px;text-align:center">
          Processing chunk ${i + 1}/${processChunks.length}...
          <div style="height:4px;background:#333;margin-top:8px;border-radius:2px">
            <div style="height:100%;background:#4285f4;width:${Math.round(
              (i / processChunks.length) * 100
            )}%;border-radius:2px"></div>
          </div>
        </div>`;

      const chunk = processChunks[i];
      chunk.textNodes.forEach((node) => {
        node.chunkIndex = i;
        node.chunkText = chunk.text;
      });
      console.log("Chunk before processing:", chunk);

      const response = await chrome.runtime.sendMessage({
        action: "callGemini",
        text: chunk.text,
        isChunk: true,
        chunkIndex: i,
        totalChunks: chunks.length,
        idOffset: i * chunkOffset,
      });

      if (response.success) {
        try {
          console.log(`Raw LLM response for chunk ${i + 1}:`, response.data);
          const cleanedResponse = cleanLLMResponse(response.data);
          console.log(`Cleaned response for chunk ${i + 1}:`, cleanedResponse);

          if (!isCompleteJSON(cleanedResponse)) {
            outputElement.innerHTML += `<div style="color:#ff9800;padding:5px;font-size:12px">
            Incomplete JSON detected for chunk ${
              i + 1
            }. Requesting continuation...
          </div>`;

            const continuationResponse = await requestContinuation(
              cleanedResponse,
              chunk,
              i,
              chunks.length,
              i * chunkOffset
            );

            if (continuationResponse.success) {
              const continuationCleaned = cleanLLMResponse(
                continuationResponse.data
              );

              try {
                const initialItems = extractPartialJSON(cleanedResponse);
                const continuationItems =
                  extractPartialJSON(continuationCleaned);

                const combinedItems = [...initialItems, ...continuationItems];
                console.log(
                  `Combined ${initialItems.length} initial items with ${continuationItems.length} continuation items`
                );

                allPrioritizedItems = allPrioritizedItems.concat(combinedItems);

                outputElement.innerHTML += `<div style="color:#4CAF50;padding:5px;font-size:12px">
                Successfully recovered ${
                  combinedItems.length
                } items for chunk ${i + 1}
              </div>`;
                continue;
              } catch (mergeError) {
                console.error("Error merging responses:", mergeError);
              }
            }
          }

          try {
            const chunkResults = JSON.parse(cleanedResponse);
            allPrioritizedItems = allPrioritizedItems.concat(chunkResults);
          } catch (e) {
            console.error("Error parsing chunk result:", e);
            outputElement.innerHTML += `<div style="color:#ff6b6b;padding:5px;font-size:12px">
        Warning: Failed to process chunk ${i + 1}. Trying alternative parsing...
      </div>`;

            try {
              const extractedItems = extractPartialJSON(response.data);
              if (extractedItems.length > 0) {
                allPrioritizedItems =
                  allPrioritizedItems.concat(extractedItems);
                outputElement.innerHTML += `<div style="color:#ffbb33;padding:5px;font-size:12px">
            Recovered ${extractedItems.length} items from chunk ${i + 1}
          </div>`;
              }
            } catch (recoveryError) {
              console.error("Recovery attempt failed:", recoveryError);
            }
          }
        } catch (e) {
          console.error("Error cleaning response:", e);
          outputElement.innerHTML += `<div style="color:#ff6b6b;padding:5px;font-size:12px">
      Failed to clean response for chunk ${i + 1}
    </div>`;
        }
      } else {
        outputElement.innerHTML += `<div style="color:#ff6b6b;padding:5px;font-size:12px">
    Error in chunk ${i + 1}: ${response.error}
  </div>`;
      }
    }

    window.lastPrioritizedText = allPrioritizedItems;

    allPrioritizedItems.forEach((item, index) => {
      const chunkIndex = Math.floor(item.id / chunkOffset);
      if (chunkIndex < processChunks.length) {
        item.sourceChunkIndex = chunkIndex;
        item.sourceChunkText = processChunks[chunkIndex].text;
      }
    });

    applyTextHighlighting(allPrioritizedItems, allTextNodes);

    outputElement.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>Text Prioritization Complete ${
          CONSTANTS.DEBUG_MAX_CHUNKS ? "(Debug Mode)" : ""
        }</div>
        <button style="background:transparent;border:none;color:#aaa;cursor:pointer;font-size:18px">×</button>
      </div>
      <div style="background:#252525;padding:12px;border-radius:6px;font-size:13px">
        <p>Highlighted ${allPrioritizedItems.length} text segments across ${
      processChunks.length
    } chunks.
        ${
          CONSTANTS.DEBUG_MAX_CHUNKS
            ? `<br><span style="color:#ff9800">Debug: Limited to ${CONSTANTS.DEBUG_MAX_CHUNKS} of ${chunks.length} total chunks</span>`
            : ""
        }
        </p>
        <div style="display:flex;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <span style="background:green;color:white;padding:2px 8px;border-radius:4px">High priority</span>
          <span style="background:yellow;color:black;padding:2px 8px;border-radius:4px">Supporting</span>
          <span style="background:red;color:white;padding:2px 8px;border-radius:4px">Important standalone</span>
        </div>
        <button id="reset-highlights" style="margin-top:12px;padding:8px;width:100%;background:#404040;border:none;border-radius:4px;color:white;cursor:pointer">
          Reset Highlights
        </button>
      </div>
    `;

    outputElement
      .querySelector("button#reset-highlights")
      .addEventListener("click", resetHighlights);

    outputElement
      .querySelector('button[style*="background:transparent"]')
      .addEventListener("click", () => {
        outputElement.style.display = "none";
      });
  } catch (error) {
    outputElement.innerHTML = `<div style="color:#ff6b6b;padding:10px">Error: ${error.message}</div>`;
  }
}

/**
 * Extracts valid or partial JSON objects from a string.
 */
function extractPartialJSON(text) {
  const items = [];

  try {
    try {
      return JSON.parse(text);
    } catch (e) {}

    const regex = /{[^{]*"text"\s*:\s*"[^"]+(?:"[^}]*})/g;
    let match;
    let idCounter = Date.now();

    while ((match = regex.exec(text)) !== null) {
      try {
        let objectText = match[0];
        if (!objectText.endsWith("}")) {
          objectText += "}";
        }

        objectText = objectText.replace(/'/g, '"');

        let item;
        try {
          item = JSON.parse(objectText);
        } catch (e) {
          const textMatch = objectText.match(/"text"\s*:\s*"([^"]+)"/);
          const text = textMatch ? textMatch[1] : "Extracted text";

          item = {
            text: text,
            priority: 3,
            color: "yellow",
            summary: "Partially extracted item",
            id: idCounter++,
            supporting: null,
          };
        }

        item.text = item.text || "Unknown text";
        item.priority = item.priority || 3;
        item.color = item.color || "yellow";
        item.summary = item.summary || "Extracted text";
        item.id = item.id || idCounter++;
        item.supporting = item.supporting || null;

        items.push(item);
      } catch (e) {
        console.error("Failed to extract item:", e);
      }
    }
  } catch (e) {
    console.error("Error in extractPartialJSON:", e);
  }

  return items;
}

// Highlights text nodes based on prioritized items
function applyTextHighlighting(prioritizedText, textNodes) {
  const priorityMap = new Map();
  const modifiedNodes = new Map();
  const chunkMap = new Map();

  textNodes.forEach((node) => {
    const chunkText = node.text;
    if (!chunkMap.has(chunkText)) {
      chunkMap.set(chunkText, []);
    }
    chunkMap.get(chunkText).push(node);
  });

  prioritizedText.forEach((item) => {
    if (!item.text) return;

    let highlightColor =
      item.color === "green"
        ? "#4CAF50"
        : item.color === "yellow"
        ? "#FFC107"
        : item.color === "red"
        ? "#F44336"
        : item.color;

    let matches = textNodes.filter((node) => node.text.includes(item.text));

    if (matches.length === 0) {
      const normalizedItemText = item.text
        .replace(/\\n/g, "\n")
        .replace(/\s+/g, " ")
        .trim();

      const matchCandidates = [];
      textNodes.forEach((node) => {
        const normalizedNodeText = node.text.replace(/\s+/g, " ").trim();

        let score = 0;
        const words = normalizedItemText.split(" ");
        words.forEach((word) => {
          if (word.length > 3 && normalizedNodeText.includes(word)) {
            score++;
          }
        });

        if (
          score > words.length * 0.7 ||
          normalizedNodeText.includes(normalizedItemText) ||
          normalizedItemText.includes(normalizedNodeText)
        ) {
          matchCandidates.push({ node, score });
        }
      });

      matchCandidates.sort((a, b) => b.score - a.score);
      matches = matchCandidates.slice(0, 3).map((m) => m.node);
    }

    matches.forEach((match) => {
      if (modifiedNodes.has(match.node)) return;

      if (match.isCodeBlock) {
        highlightCodeBlock(match, item, highlightColor, modifiedNodes);
      } else {
        highlightTextNode(match, item, highlightColor, modifiedNodes);
      }
    });
  });
}

function highlightCodeBlock(match, item, color, modifiedNodes) {
  const codeBlock = match.node;
  const parent = codeBlock.parentElement;
  if (!parent) return;

  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-block";

  const overlay = document.createElement("div");
  overlay.className = "priority-highlight";
  overlay.dataset.priorityId = item.id;
  overlay.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background-color:${color};opacity:0.2;pointer-events:none;z-index:1`;

  const infoButton = document.createElement("span");
  infoButton.innerHTML = "*";
  infoButton.style.cssText = `position:absolute;top:0;right:0;background:#555;color:white;border-radius:50%;width:16px;height:16px;font-size:12px;text-align:center;line-height:16px;cursor:pointer;opacity:0;transition:opacity 0.2s;z-index:2`;

  wrapper.addEventListener("mouseenter", () => {
    infoButton.style.opacity = "1";
    overlay.style.opacity = "0.4";
  });

  wrapper.addEventListener("mouseleave", () => {
    infoButton.style.opacity = "0";
    overlay.style.opacity = "0.2";
  });

  infoButton.addEventListener("click", (e) => {
    e.stopPropagation();
    showSummary(item, wrapper);
  });

  wrapper.appendChild(codeBlock.cloneNode(true));
  wrapper.appendChild(overlay);
  wrapper.appendChild(infoButton);

  parent.replaceChild(wrapper, codeBlock);
  modifiedNodes.set(match.node, wrapper);
}
/**
 * Highlights a text node with a colored span and adds an info button for summary.
 */
function highlightTextNode(match, item, color, modifiedNodes) {
  const span = document.createElement("span");
  span.style.backgroundColor = color;
  span.style.opacity = "0.4";
  span.style.position = "relative";
  span.className = "priority-highlight";
  span.dataset.priorityId = item.id;

  const parent = match.parentElement;
  if (!parent) return;

  const wrapper = document.createElement("span");
  wrapper.appendChild(match.node.cloneNode(true));
  span.innerHTML = wrapper.innerHTML;

  const infoButton = document.createElement("span");
  infoButton.innerHTML = "*";
  infoButton.style.cssText = `position:absolute;top:-8px;right:-8px;background:#555;color:white;border-radius:50%;width:16px;height:16px;font-size:12px;text-align:center;line-height:16px;cursor:pointer;opacity:0;transition:opacity 0.2s`;
  span.appendChild(infoButton);

  span.addEventListener("mouseenter", () => {
    infoButton.style.opacity = "1";
  });

  span.addEventListener("mouseleave", () => {
    infoButton.style.opacity = "0";
  });

  infoButton.addEventListener("click", (e) => {
    e.stopPropagation();
    showSummary(item, span);
  });

  parent.replaceChild(span, match.node);
  modifiedNodes.set(match.node, span);
}

/**
 * Cleans and extracts valid JSON from LLM response.
 */
function cleanLLMResponse(response) {
  try {
    try {
      JSON.parse(response);
      return response;
    } catch (e) {}

    let cleaned = response;
    if (cleaned.includes("```json")) {
      cleaned = cleaned.replace(/```json\s*/g, "");
      cleaned = cleaned.replace(/```\s*$/g, "");
    }

    const startIndex = cleaned.indexOf("[");
    const endIndex = cleaned.lastIndexOf("]") + 1;

    if (startIndex >= 0 && endIndex > startIndex) {
      cleaned = cleaned.substring(startIndex, endIndex);
    }

    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {
    try {
      const items = [];
      const regex = /"text"\s*:\s*"([^"]+)"/g;
      let match;
      let idCounter = 0;

      while ((match = regex.exec(response)) !== null) {
        try {
          const objectText = match[0].replace(/'/g, '"');
          const item = JSON.parse(objectText);
          items.push(item);
        } catch (parseError) {
          const objectText = match[0];

          const textMatch = objectText.match(/"text"\s*:\s*"([^"]+)"/);
          const text = textMatch ? textMatch[1] : "Unknown text";

          const priorityMatch = objectText.match(/"priority"\s*:\s*(\d+)/);
          const priority = priorityMatch ? parseInt(priorityMatch[1]) : 3;

          const colorMatch = objectText.match(/"color"\s*:\s*"([^"]+)"/);
          const color = colorMatch ? colorMatch[1] : "yellow";

          const summaryMatch = objectText.match(/"summary"\s*:\s*"([^"]+)"/);
          const summary = summaryMatch ? summaryMatch[1] : "Extracted item";

          const idMatch = objectText.match(/"id"\s*:\s*(\d+)/);
          idCounter = idMatch ? parseInt(idMatch[1]) : idCounter++;

          const supportingMatch = objectText.match(/"supporting"\s*:\s*(\w+)/);
          const supporting = supportingMatch
            ? supportingMatch[1] === "null"
              ? null
              : parseInt(supportingMatch[1])
            : null;

          items.push({
            text,
            priority,
            color,
            summary,
            id: idCounter,
            supporting,
          });
        }
      }
      if (items.length > 0) {
        return JSON.stringify(items);
      }
    } catch (finalError) {
      console.error("Final JSON parsing attempt failed:", finalError);
    }
    return "[]";
  }
}

/**
 * Sends text to Gemini via Chrome extension messaging.
 */
async function sendToGemini(text) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "callGemini",
      text: text,
    });

    if (response.success) {
      console.log("LLM Response received:", response.data);
      return response.data;
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Shows a summary tooltip for a prioritized item.
 */
function showSummary(item, element) {
  const existingTooltip = document.querySelector(".priority-tooltip");
  if (existingTooltip) {
    existingTooltip.remove();
  }

  const tooltip = document.createElement("div");
  tooltip.className = "priority-tooltip";
  tooltip.style.cssText = `
    position: absolute;
    z-index: 10001;
    background: #333;
    color: white;
    padding: 10px;
    border-radius: 4px;
    max-width: 300px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    top: ${element.offsetTop + element.offsetHeight}px;
    left: ${element.offsetLeft}px;
  `;

  let supportingText = "";
  if (item.supporting && window.lastPrioritizedText) {
    const supporting = window.lastPrioritizedText.find(
      (t) => t.id === item.supporting
    );
    if (supporting) {
      supportingText = `<p><strong>Supporting:</strong> ${supporting.text}</p>`;
    }
  }

  tooltip.innerHTML = `
    <h4 style="margin-top:0">Priority: ${item.priority}/5</h4>
    <p>${item.summary || "No summary available"}</p>
    ${supportingText}
    <div style="text-align:right"><small>Click anywhere to dismiss</small></div>
  `;

  document.body.appendChild(tooltip);

  setTimeout(() => {
    const closeTooltip = () => {
      tooltip.remove();
      document.removeEventListener("click", closeTooltip);
    };
    document.addEventListener("click", closeTooltip);
  }, 100);
}

/**
 * Checks if a string is a complete JSON structure.
 */
function isCompleteJSON(jsonString) {
  try {
    JSON.parse(jsonString);
    return true;
  } catch (e) {
    const openBrackets = (jsonString.match(/\{/g) || []).length;
    const closeBrackets = (jsonString.match(/\}/g) || []).length;
    const openSquare = (jsonString.match(/\[/g) || []).length;
    const closeSquare = (jsonString.match(/\]/g) || []).length;

    return openBrackets === closeBrackets && openSquare === closeSquare;
  }
}

/**
 * Requests a continuation from the LLM for an incomplete JSON response.
 */
async function requestContinuation(
  incompleteJson,
  chunk,
  chunkIndex,
  totalChunks,
  idOffset
) {
  let lastCompleteItem = null;
  try {
    const jsonText = incompleteJson.trim();
    const lastCompleteObjectEnd = jsonText.lastIndexOf("},");

    if (lastCompleteObjectEnd > 0) {
      const partialArrayJson =
        jsonText.substring(0, lastCompleteObjectEnd + 1) + "]";
      const partialArray = JSON.parse(partialArrayJson);

      if (partialArray.length > 0) {
        lastCompleteItem = partialArray[partialArray.length - 1];
      }
    }
  } catch (e) {
    console.error("Error extracting last complete item:", e);
  }

  const continuationText = `You previously analyzed a chunk of text but your response was truncated. Here is the incomplete JSON response you provided:
  
${incompleteJson.substring(0, 500)}...

Please continue your analysis from where you left off. Make sure to:
1. Start with a valid JSON array opening bracket [
2. Include any items that may have been cut off
3. Continue analyzing the rest of the chunk
4. End with a valid JSON array closing bracket ]

${
  lastCompleteItem
    ? `The last complete item you analyzed had ID: ${
        lastCompleteItem.id
      } and text: "${lastCompleteItem.text.substring(0, 50)}..."`
    : ""
}

IMPORTANT: Use IDs starting where you left off. Ensure proper JSON formatting.`;

  const response = await chrome.runtime.sendMessage({
    action: "callGemini",
    text:
      continuationText +
      "\n\nHere's the original text to continue analyzing:\n\n" +
      chunk.text,
    isChunk: true,
    chunkIndex: chunkIndex,
    totalChunks: totalChunks,
    idOffset: idOffset,
    isContinuation: true,
  });

  return response;
}

// Resets all highlights applied to the page
function resetHighlights() {
  const highlights = document.querySelectorAll(".priority-highlight");
  console.log(`Found ${highlights.length} highlights to reset`);

  highlights.forEach((highlight) => {
    try {
      const parent = highlight.parentElement;
      if (parent && highlight.style.position === "absolute") {
        const codeBlock = parent.querySelector("code");
        if (codeBlock && parent.parentElement) {
          parent.parentElement.replaceChild(codeBlock, parent);
        }
      } else if (parent) {
        const textContent = highlight.textContent.replace("*", "");
        const textNode = document.createTextNode(textContent);
        parent.replaceChild(textNode, highlight);
      }
    } catch (e) {
      console.error("Error resetting highlight:", e);
    }
  });

  const outputElement = shadowRoot.getElementById(CONSTANTS.outputElementID);
  if (outputElement) {
    outputElement.innerHTML += `
      <div style="color:#4CAF50;padding:5px;font-size:14px;margin-top:10px;text-align:center">
        Highlights have been reset
      </div>
    `;
    setTimeout(() => {
      const successMsg = outputElement.querySelector(
        'div[style*="color:#4CAF50"]'
      );
      if (successMsg) {
        successMsg.style.display = "none";
      }
    }, 2000);
  }
}

// Initializes the UI when the DOM is ready
document.addEventListener("DOMContentLoaded", createUI);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", createUI);
} else {
  createUI();
}
