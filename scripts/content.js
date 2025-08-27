// Constants for UI and processing
const CONSTANTS = {
  buttonID: "prioritize-text-button",
  outputElementID: "prioritize-output-container",
  shadowRootID: "prioritize-shadow-root",
  MAX_TOKENS: 25000,
  SYSTEM_PROMPT_TOKENS: 1000,
  RESPONSE_TOKENS: 2000,
  OVERLAP_TOKENS: 300,
  DEBUG_MODE: false,
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

  button.addEventListener("click", processPage);
}

/**
 * Main function to process the page content
 */
async function processPage() {
  const outputElement = shadowRoot.getElementById(CONSTANTS.outputElementID);
  outputElement.style.display = "block";
  outputElement.innerHTML =
    '<div style="padding:10px;text-align:center">Analyzing page structure...</div>';

  try {
    // 1. Extract semantic elements from the page
    const semanticElements = extractSemanticElements(document.body);
    console.log("Smeantic Elements:", semanticElements);

    // 2. Create semantic chunks from the elements
    outputElement.innerHTML =
      '<div style="padding:10px;text-align:center">Creating semantic chunks...</div>';
    const chunks = await createSemanticChunks(semanticElements);
    console.log(`Created ${chunks.length} semantic chunks`);
    console.log("Chunks:", chunks);

    // 3. Process chunks with LLM
    await processChunks(chunks);
  } catch (error) {
    console.error("Error processing page:", error);
    outputElement.innerHTML = `<div style="color:#ff6b6b;padding:10px">Error: ${error.message}</div>`;
  }
}

/**
 * Extracts semantic elements from the DOM with their metadata
 * @param {Node} rootNode - The root node to start extraction from
 * @returns {Array} Array of semantic elements with metadata
 */
function extractSemanticElements(rootNode) {
  const semanticElements = [];
  const seenContent = new Set(); // Track text content we've already processed

  // Skip these elements entirely
  const TAGS_TO_SKIP = [
    "script",
    "style",
    "noscript",
    "iframe",
    "object",
    "embed",
    "svg",
    "math",
    "template",
    "link",
    "meta",
    "head",
    "nav",
  ];

  // Skip elements with these classes or IDs (common UI patterns)
  const CLASS_ID_PATTERNS_TO_SKIP = [
    "nav",
    "menu",
    "sidebar",
    "footer",
    "header",
    "theme",
    "toolbar",
    "button",
    "toggle",
    "dropdown",
    "modal",
  ];

  function shouldSkipElement(element) {
    // Skip by tag
    if (TAGS_TO_SKIP.includes(element.tagName.toLowerCase())) {
      return true;
    }

    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      element === shadowHost
    ) {
      return true;
    }

    // Skip by class/id patterns
    if (element.className && typeof element.className === "string") {
      for (const pattern of CLASS_ID_PATTERNS_TO_SKIP) {
        if (element.className.toLowerCase().includes(pattern)) {
          return true;
        }
      }
    }

    if (element.id) {
      for (const pattern of CLASS_ID_PATTERNS_TO_SKIP) {
        if (element.id.toLowerCase().includes(pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  // Process an element to extract meaningful content
  function processElement(element, depth = 0) {
    if (shouldSkipElement(element)) {
      return;
    }

    const tag = element.tagName.toLowerCase();

    // Identify standalone code blocks vs inline code
    const isStandaloneCodeBlock =
      tag === "pre" ||
      (tag === "code" &&
        element.parentElement?.tagName.toLowerCase() === "pre") ||
      (element.className &&
        typeof element.className === "string" &&
        (element.className.includes("hljs") ||
          element.className.includes("code-block") ||
          element.className.includes("language-")));

    // Handle standalone code blocks
    if (isStandaloneCodeBlock) {
      const text = element.textContent.trim();
      if (text) {
        semanticElements.push({
          type: "code",
          element: element,
          tag: tag,
          text: text,
          depth: depth,
          isCodeBlock: true,
          isStandalone: true,
        });
      }
      return; // Don't process children of code blocks
    }

    // For normal elements, collect text INCLUDING inline code elements
    let combinedText = "";

    // Process all child nodes to handle inline code properly
    for (const childNode of element.childNodes) {
      // Text nodes - add directly
      if (childNode.nodeType === Node.TEXT_NODE) {
        const trimmed = childNode.textContent.trim();
        if (trimmed) {
          combinedText += trimmed + " ";
        }
      }
      // Inline code elements - wrap with backticks
      else if (
        childNode.nodeType === Node.ELEMENT_NODE &&
        childNode.tagName.toLowerCase() === "code"
      ) {
        const codeText = childNode.textContent.trim();
        if (codeText) {
          combinedText += "`" + codeText + "` ";
        }
      }
    }

    combinedText = combinedText.trim();

    if (combinedText) {
      if (!seenContent.has(combinedText)) {
        seenContent.add(combinedText);

        semanticElements.push({
          type: "text",
          element: element,
          tag: tag,
          text: combinedText,
          depth: depth,
          containsInlineCode: combinedText.includes("`"),
        });
      }
    }

    // For headings and semantic block elements, add regardless of direct text
    if (
      /^h[1-6]$/.test(tag) ||
      ["p", "li", "blockquote", "table", "tr"].includes(tag)
    ) {
      let fullText = "";
      let hasInlineCode = false;

      // Collect all text including properly formatted inline code
      function collectTextWithInlineCode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const trimmed = node.textContent.trim();
          if (trimmed) {
            fullText += trimmed + " ";
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const childTag = node.tagName.toLowerCase();

          // Handle inline code
          if (
            childTag === "code" &&
            node.parentElement !== element.parentElement
          ) {
            const codeText = node.textContent.trim();
            if (codeText) {
              fullText += "`" + codeText + "` ";
              hasInlineCode = true;
            }
            return;
          }

          if (
            ["div", "p", "blockquote", "section", "article"].includes(childTag)
          ) {
            return;
          }

          // Process children recursively
          for (const child of node.childNodes) {
            collectTextWithInlineCode(child);
          }
        }
      }

      collectTextWithInlineCode(element);
      fullText = fullText.trim();

      if (fullText && fullText !== combinedText) {
        // Skip if we've seen this text before
        if (!seenContent.has(fullText)) {
          seenContent.add(fullText);

          semanticElements.push({
            type: "block",
            element: element,
            tag: tag,
            text: fullText,
            depth: depth,
            containsInlineCode: hasInlineCode,
          });
        }
      }
    }

    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i];
      if (!(child.tagName.toLowerCase() === "code" && !isStandaloneCodeBlock)) {
        processElement(child, depth + 1);
      }
    }
  }

  processElement(rootNode);

  return semanticElements;
}
/**
 * Creates semantic chunks from the extracted elements
 * @param {Array} elements - Array of semantic elements
 * @returns {Array} Array of chunks ready for processing
 */
async function createSemanticChunks(elements) {
  const systemPromptResponse = await chrome.runtime.sendMessage({
    action: "countTokens",
    includeSystemPrompt: true,
    text: "",
  });

  const systemPromptTokens = systemPromptResponse.success
    ? systemPromptResponse.tokenCount
    : CONSTANTS.SYSTEM_PROMPT_TOKENS;

  console.log(`System prompt uses ${systemPromptTokens} tokens`);

  // Available tokens for content
  const AVAILABLE_TOKENS =
    CONSTANTS.MAX_TOKENS - systemPromptTokens - CONSTANTS.RESPONSE_TOKENS;

  const chunks = [];
  let currentChunk = {
    elements: [],
    text: "",
    elementTypes: {},
    headings: [],
    estimatedTokens: 0,
  };

  // Process each semantic element
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];

    const elementTokens = Math.ceil(element.text.length / 4);

    // Check if this is a heading to track for context
    if (/^h[1-6]$/.test(element.tag)) {
      // Add heading to tracking regardless of chunk boundaries
      const headingLevel = parseInt(element.tag.substring(1));

      // If we already have headings, only add if it's equal or higher level
      if (
        currentChunk.headings.length === 0 ||
        headingLevel <=
          currentChunk.headings[currentChunk.headings.length - 1].level
      ) {
        currentChunk.headings.push({
          level: headingLevel,
          text: element.text,
          tag: element.tag,
        });
      }
    }

    // Handle large elements that exceed chunk size
    if (elementTokens > AVAILABLE_TOKENS * 0.8) {
      console.log(`Large element found (${elementTokens} tokens), splitting`);

      // If we have accumulated content, finalize current chunk
      if (currentChunk.elements.length > 0) {
        const chunk = finalizeChunk(currentChunk);
        chunks.push(chunk);

        // Create new chunk with context from previous
        currentChunk = createNewChunkWithContext(currentChunk);
      }

      // Split large element into sub-chunks
      const subChunks = splitLargeElement(element, AVAILABLE_TOKENS * 0.8);

      for (const subChunk of subChunks) {
        const subChunkTokens = Math.ceil(subChunk.text.length / 4);

        const subElement = {
          ...element,
          text: subChunk.text,
          isSplit: true,
          splitIndex: subChunk.index,
          totalSplits: subChunks.length,
        };

        const subChunkWrapper = {
          elements: [subElement],
          text: addChunkMetadata(
            subElement.text,
            [subElement],
            currentChunk.headings
          ),
          elementTypes: { [element.type]: 1 },
          headings: [...currentChunk.headings],
          estimatedTokens: subChunkTokens,
        };

        chunks.push(finalizeChunk(subChunkWrapper));

        // Update context for next chunk
        currentChunk = createNewChunkWithContext(subChunkWrapper);
      }

      continue;
    }

    // Check if adding this element would exceed the token limit
    const newTokenEstimate = currentChunk.estimatedTokens + elementTokens;

    if (
      newTokenEstimate > AVAILABLE_TOKENS * 0.8 &&
      currentChunk.elements.length > 0
    ) {
      // Finalize current chunk
      chunks.push(finalizeChunk(currentChunk));

      // Create new chunk with context from previous
      currentChunk = createNewChunkWithContext(currentChunk);
    }

    currentChunk.elements.push(element);

    if (!currentChunk.elementTypes[element.type]) {
      currentChunk.elementTypes[element.type] = 0;
    }
    currentChunk.elementTypes[element.type]++;

    if (currentChunk.text) {
      currentChunk.text += "\n\n";
    }

    const elementWithMetadata = `[${element.type}:${element.tag}] ${element.text}`;
    currentChunk.text += elementWithMetadata;
    currentChunk.estimatedTokens += elementTokens;
  }

  // Add the final chunk if not empty
  if (currentChunk.elements.length > 0) {
    chunks.push(finalizeChunk(currentChunk));
  }
  const chunksr = await Promise.all(chunks);
  return chunksr;
}

/**
 * Adds semantic metadata to chunk text
 */
function addChunkMetadata(text, elements, headings) {
  const metadata = [];

  if (headings && headings.length > 0) {
    metadata.push("# Document Structure Context");
    headings.forEach((heading) => {
      const indent = "  ".repeat(heading.level - 1);
      metadata.push(`${indent}${heading.tag}: ${heading.text}`);
    });
  }

  // Add element type summary
  const elementTypes = {};
  elements.forEach((el) => {
    if (!elementTypes[el.type]) elementTypes[el.type] = 0;
    elementTypes[el.type]++;
  });

  const typeSummary = Object.entries(elementTypes)
    .map(([type, count]) => `${type}: ${count}`)
    .join(", ");

  metadata.push(
    `\n# Semantic Elements (${elements.length} total - ${typeSummary})`
  );

  return metadata.join("\n") + "\n\n" + text;
}

/**
 * Creates a new chunk with context from the previous chunk
 */
function createNewChunkWithContext(previousChunk) {
  // Find important elements for context overlap
  const contextElements = getContextElements(
    previousChunk.elements,
    CONSTANTS.OVERLAP_TOKENS
  );

  // Create new chunk with context
  return {
    elements: [...contextElements],
    text: "",
    elementTypes: {},
    headings: [...previousChunk.headings],
    estimatedTokens: 0,
    hasContextFromPrevious: true,
  };
}

/**
 * Gets important elements from the previous chunk to provide context
 */
function getContextElements(elements, maxTokens) {
  if (elements.length === 0) return [];

  const contextElements = [];
  let tokenCount = 0;
  const headings = elements.filter((el) => /^h[1-6]$/.test(el.tag));

  for (const heading of headings) {
    contextElements.push(heading);
    tokenCount += Math.ceil(heading.text.length / 4);
  }

  const nonHeadings = elements
    .filter((el) => !/^h[1-6]$/.test(el.tag))
    .sort((a, b) => b.importance - a.importance);

  // Include high importance elements first
  for (const element of nonHeadings) {
    const elementTokens = Math.ceil(element.text.length / 4);

    if (tokenCount + elementTokens <= maxTokens) {
      contextElements.push(element);
      tokenCount += elementTokens;
    }

    if (tokenCount >= maxTokens) break;
  }

  return contextElements;
}

/**
 * Finalizes a chunk with proper metadata and accurate token count
 */
async function finalizeChunk(chunk) {
  const enhancedText = chunk.text;

  try {
    const tokenResponse = await chrome.runtime.sendMessage({
      action: "countTokens",
      text: enhancedText,
      includeSystemPrompt: true,
    });

    const actualTokens = tokenResponse.success
      ? tokenResponse.tokenCount - CONSTANTS.SYSTEM_PROMPT_TOKENS
      : chunk.estimatedTokens;

    return {
      ...chunk,
      text: enhancedText,
      estimatedTokens: chunk.estimatedTokens,
      actualTokens: actualTokens,
      chunkId: `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  } catch (error) {
    console.error("Error getting token count:", error);
    return {
      ...chunk,
      text: enhancedText,
      chunkId: `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }
}

/**
 * Splits a large element into smaller chunks
 */
function splitLargeElement(element, maxTokens) {
  const chunks = [];
  const text = element.text;

  if (element.isCodeBlock) {
    const lines = text.split("\n");
    let currentChunk = { text: "", index: 0 };
    let chunkIndex = 0;

    for (const line of lines) {
      const lineTokens = Math.ceil(line.length / 4);
      const currentChunkTokens = Math.ceil(currentChunk.text.length / 4);

      if (currentChunkTokens + lineTokens > maxTokens && currentChunk.text) {
        chunks.push({ ...currentChunk, index: chunkIndex++ });
        currentChunk = { text: "", index: chunkIndex };
      }

      currentChunk.text += (currentChunk.text ? "\n" : "") + line;
    }

    if (currentChunk.text) {
      chunks.push({ ...currentChunk, index: chunkIndex });
    }
  } else {
    // Split normal text by paragraphs, then sentences
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = { text: "", index: 0 };
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const paraTokens = Math.ceil(paragraph.length / 4);

      if (paraTokens > maxTokens) {
        // This paragraph alone is too large, split by sentences
        const sentences = paragraph.split(/(?<=[.!?])\s+/);

        for (const sentence of sentences) {
          const sentenceTokens = Math.ceil(sentence.length / 4);
          const currentChunkTokens = Math.ceil(currentChunk.text.length / 4);

          if (
            currentChunkTokens + sentenceTokens > maxTokens &&
            currentChunk.text
          ) {
            chunks.push({ ...currentChunk, index: chunkIndex++ });
            currentChunk = { text: "", index: chunkIndex };
          }

          currentChunk.text += (currentChunk.text ? " " : "") + sentence;
        }
      } else {
        const currentChunkTokens = Math.ceil(currentChunk.text.length / 4);

        if (currentChunkTokens + paraTokens > maxTokens && currentChunk.text) {
          chunks.push({ ...currentChunk, index: chunkIndex++ });
          currentChunk = { text: "", index: chunkIndex };
        }

        currentChunk.text += (currentChunk.text ? "\n\n" : "") + paragraph;
      }
    }

    if (currentChunk.text) {
      chunks.push({ ...currentChunk, index: chunkIndex });
    }
  }

  return chunks;
}

/**
 * Processes chunks through the LLM and applies highlighting
 */
async function processChunks(chunks) {
  const outputElement = shadowRoot.getElementById(CONSTANTS.outputElementID);
  let allResults = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    outputElement.innerHTML = `
      <div style="padding:10px;text-align:center">
        Processing chunk ${i + 1} of ${chunks.length}...
        <div style="height:4px;background:#333;margin-top:8px;border-radius:2px">
          <div style="height:100%;background:#4285f4;width:${Math.round(
            (i / chunks.length) * 100
          )}%;border-radius:2px"></div>
        </div>
      </div>
    `;

    // Build context for this chunk
    let textToProcess = chunk.text;

    // If not the first chunk, include a summary of results so far
    if (i > 0 && allResults.length > 0) {
      const contextSummary = createContextSummary(allResults);
      textToProcess = `PREVIOUS ANALYSIS SUMMARY:\n${contextSummary}\n\nCURRENT TEXT TO ANALYZE:\n${chunk.text}`;
    }

    try {
      console.log("Text to process:", textToProcess);
      // Send to LLM for processing
      const response = await chrome.runtime.sendMessage({
        action: "callGemini",
        text: textToProcess,
        isChunk: true,
        chunkIndex: i,
        totalChunks: chunks.length,
        idOffset: i * 10000,
      });

      if (response.success) {
        const chunkResults = JSON.parse(cleanLLMResponse(response.data));
        console.log(`Chunk ${i + 1} results:`, chunkResults);
        chunkResults.forEach((item) => {
          item.sourceChunkIndex = i;
          item.elements = findMatchingElements(item.text, chunk.elements);
        });

        allResults = allResults.concat(chunkResults);
      } else {
        console.error(`Error processing chunk ${i + 1}:`, response.error);
      }
    } catch (error) {
      console.error(`Error processing chunk ${i + 1}:`, error);
    }
  }

  // Process is complete, apply highlighting
  applyHighlighting(allResults);

  // Update UI with summary
  const priorityCounts = {
    high: allResults.filter((i) => i.priority >= 4).length,
    medium: allResults.filter((i) => i.priority === 3).length,
    low: allResults.filter((i) => i.priority < 3).length,
  };

  outputElement.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>Text Prioritization Complete</div>
      <button style="background:transparent;border:none;color:#aaa;cursor:pointer;font-size:18px">×</button>
    </div>
    <div style="background:#252525;padding:12px;border-radius:6px;font-size:13px">
      <p>Highlighted ${allResults.length} text segments across ${chunks.length} chunks.</p>
      <div style="margin:8px 0;font-size:12px">
        <div>High priority: ${priorityCounts.high}</div>
        <div>Medium priority: ${priorityCounts.medium}</div>
        <div>Low priority: ${priorityCounts.low}</div>
      </div>
      <div style="display:flex;gap:10px;margin:12px 0;flex-wrap:wrap">
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

  window.lastPrioritizedText = allResults;
}

/**
 * Creates a summary of previous analysis for context
 */
function createContextSummary(results) {
  if (results.length === 0) return "";
  const topItems = results.sort((a, b) => b.priority - a.priority).slice(0, 3);

  return (
    `I've analyzed ${results.length} elements so far. Key points from previous chunks:\n` +
    topItems
      .map((item) => `- ${item.summary} (priority: ${item.priority})`)
      .join("\n")
  );
}

/**
 * Finds elements that match the given text
 */
function findMatchingElements(text, elements) {
  // First try exact matches
  let matches = elements.filter((element) => element.text === text);
  if (matches.length === 0) {
    const normalizedText = text.replace(/\s+/g, " ").trim();

    matches = elements.filter((element) => {
      const normalizedElement = element.text.replace(/\s+/g, " ").trim();
      return (
        normalizedElement.includes(normalizedText) ||
        normalizedText.includes(normalizedElement)
      );
    });
  }

  // If still no matches, try word overlap
  if (matches.length === 0) {
    const textWords = new Set(
      text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
    );

    const candidates = elements.map((element) => {
      const elementWords = new Set(
        element.text
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3)
      );
      const overlap = [...textWords].filter((word) =>
        elementWords.has(word)
      ).length;
      const overlapScore =
        overlap / Math.max(textWords.size, elementWords.size);
      return { element, overlapScore };
    });

    candidates.sort((a, b) => b.overlapScore - a.overlapScore);

    if (candidates.length > 0 && candidates[0].overlapScore > 0.5) {
      matches = candidates.slice(0, 1).map((c) => c.element);
    }
  }

  return matches.map((match) => ({
    ...match,
    node: match.element,
  }));
}

/**
 * Applies highlighting to the page based on LLM results
 */
function applyHighlighting(results) {
  const highlightedElements = new Map();

  results.forEach((item) => {
    if (!item.elements || item.elements.length === 0) return;

    // Determine highlight color
    const highlightColor =
      item.color === "green"
        ? "#4CAF50"
        : item.color === "yellow"
        ? "#FFC107"
        : item.color === "red"
        ? "#F44336"
        : item.color;

    item.elements.forEach((element) => {
      if (highlightedElements.has(element.node)) return;

      if (element.isCodeBlock) {
        highlightCodeBlock(element, item, highlightColor);
      } else {
        highlightTextNode(element, item, highlightColor);
      }

      highlightedElements.set(element.node, true);
    });
  });
}

/**
 * Highlights a code block
 */
function highlightCodeBlock(element, item, color) {
  const node = element.element;
  if (!node) return;

  const parent = node.parentElement;
  if (!parent) return;

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    position: relative;
    display: block;
    margin: 5px 0;
    border: 2px solid ${color};
    border-radius: 5px;
    overflow: hidden;
  `;
  wrapper.className = "priority-highlight";
  wrapper.dataset.priorityId = item.id;

  const overlay = document.createElement("div");
  overlay.dataset.priorityId = item.id;
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${color};
    opacity: 0.4;
    pointer-events: none;
    z-index: 1;
  `;

  // const infoButton = document.createElement("span");
  // infoButton.innerHTML = "ⓘ";
  // infoButton.style.cssText = `
  //   position: absolute;
  //   top: 5px;
  //   right: 5px;
  //   background: #555;
  //   color: white;
  //   border-radius: 50%;
  //   width: 16px;
  //   height: 16px;
  //   font-size: 12px;
  //   text-align: center;
  //   line-height: 16px;
  //   cursor: pointer;
  //   opacity: 1;
  //   transition: opacity 0.2s;
  //   z-index: 2;
  //   box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  // `;

  const contentWrapper = document.createElement("div");
  contentWrapper.style.cssText = `
    position: relative;
    z-index: 1;
  `;
  contentWrapper.appendChild(node.cloneNode(true));

  wrapper.addEventListener("mouseenter", () => {
    // infoButton.style.opacity = "1";
    overlay.style.opacity = "0.6";
  });

  wrapper.addEventListener("mouseleave", () => {
    // infoButton.style.opacity = "0.7";
    overlay.style.opacity = "0.4";
  });

  wrapper.appendChild(contentWrapper);
  wrapper.appendChild(overlay);
  // wrapper.appendChild(infoButton);
  addInfoButton(item, wrapper);

  parent.replaceChild(wrapper, node);
}

/**
 * Highlights a text node
 */
function highlightTextNode(element, item, color) {
  const node = element.element;
  if (!node) return;

  const parent = node.parentElement;
  if (!parent) return;

  const span = document.createElement("span");
  span.style.cssText = `
    background-color: ${color};
    opacity: 0.7;
    position: relative;
    padding: 2px 4px;
    border-radius: 3px;
    border: 1px solid ${color.replace(/[^,]+(?=\))/, "1")};
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    display: inline-block;
  `;
  span.className = "priority-highlight";
  span.dataset.priorityId = item.id;

  // Clone node content into the span
  const wrapper = document.createElement("span");
  wrapper.appendChild(node.cloneNode(true));
  span.innerHTML = wrapper.innerHTML;

  // Add info button
  // const infoButton = document.createElement("span");
  // infoButton.innerHTML = "ⓘ";
  // infoButton.style.cssText = `
  //   position: absolute;
  //   top: -8px;
  //   right: -8px;
  //   background: #555;
  //   color: white;
  //   border-radius: 50%;
  //   width: 16px;
  //   height: 16px;
  //   font-size: 12px;
  //   text-align: center;
  //   line-height: 16px;
  //   cursor: pointer;
  //   opacity: 1;
  //   transition: opacity 0.2s;
  //   z-index: 3;
  // `;

  // span.appendChild(infoButton);

  span.addEventListener("mouseenter", () => {
    // infoButton.style.opacity = "1";
    span.style.opacity = "0.9";
  });

  span.addEventListener("mouseleave", () => {
    // infoButton.style.opacity = "0.7";
    span.style.opacity = "0.7";
  });

  // infoButton.addEventListener("click", (e) => {
  //   e.stopPropagation();
  //   showSummary(item, span);
  // });

  addInfoButton(item, span);
  parent.replaceChild(span, node);
}

function addInfoButton(item, wrapper) {
  const info = document.createElement("button");
  info.type = "button";
  info.className = "priority-info";
  info.setAttribute("aria-label", "Show summary");
  info.dataset.priorityId = item.id;

  info.innerHTML = "ⓘ";
  info.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10002;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    border: none;
    background: rgba(0,0,0,0.65);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 120ms ease, background 120ms ease;
  `;

  info.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    showSummary(item, wrapper);
  });

  wrapper.appendChild(info);
}

/**
 * Shows a summary tooltip
 */
function showSummary(item, element) {
  const existingDoc = document.querySelector(".priority-tooltip");
  if (existingDoc) existingDoc.remove();
  if (typeof shadowRoot !== "undefined" && shadowRoot) {
    const existingShadow = shadowRoot.querySelector(".priority-tooltip");
    if (existingShadow) existingShadow.remove();
  }

  let priorityId = null;
  if (element.dataset && element.dataset.priorityId) {
    priorityId = element.dataset.priorityId;
  } else if (element.querySelector) {
    const elementWithId = element.querySelector("[data-priority-id]");
    if (elementWithId) priorityId = elementWithId.dataset.priorityId;
  }
  if (!priorityId && item) priorityId = item.id;

  let displayItem = item;
  if (
    priorityId &&
    window.lastPrioritizedText &&
    window.lastPrioritizedText.length > 0
  ) {
    const foundItem = window.lastPrioritizedText.find(
      (t) => Number(t.id) === Number(priorityId)
    );
    if (foundItem) displayItem = foundItem;
  }

  const tooltip = document.createElement("div");
  tooltip.className = "priority-tooltip";
  tooltip.style.cssText = `
    position: fixed;
    z-index: 10001;
    background: #333;
    color: white;
    padding: 10px;
    border-radius: 4px;
    max-width: 300px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    visibility: hidden;
    pointer-events: auto;
  `;

  let supportingText = "";
  if (
    displayItem.supporting &&
    displayItem.supporting !== -1 &&
    window.lastPrioritizedText
  ) {
    const supporting = window.lastPrioritizedText.find(
      (t) => t.id === displayItem.supporting
    );
    if (supporting) {
      supportingText = `<p><strong>Supporting:</strong> ${supporting.text}</p>`;
    }
  }

  tooltip.innerHTML = `
    <h4 style="margin-top:0">Priority: ${displayItem.priority}/5</h4>
    <p>${displayItem.summary || "No summary available"}</p>
    ${supportingText}
    <div style="text-align:right"><small>Click anywhere to dismiss</small></div>
  `;

  const insertRoot =
    typeof shadowRoot !== "undefined" && shadowRoot
      ? shadowRoot
      : document.body;
  insertRoot.appendChild(tooltip);

  const elRect = element.getBoundingClientRect();
  const ttRect = tooltip.getBoundingClientRect();

  const MARGIN = 8;
  let top = elRect.bottom + MARGIN;
  if (top + ttRect.height > window.innerHeight - MARGIN) {
    top = elRect.top - ttRect.height - MARGIN;
  }
  if (top < MARGIN) top = MARGIN;

  let left = elRect.left;
  if (left + ttRect.width > window.innerWidth - MARGIN) {
    left = Math.max(MARGIN, window.innerWidth - ttRect.width - MARGIN);
  }
  if (left < MARGIN) left = MARGIN;

  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.visibility = "visible";

  const closeTooltip = (e) => {
    const path = e.composedPath ? e.composedPath() : e.path || [];
    for (const node of path) {
      try {
        if (
          node &&
          node.classList &&
          node.classList.contains("priority-tooltip")
        ) {
          return;
        }
        if (node && node.dataset && node.dataset.priorityId) {
          return;
        }
      } catch (err) {}
    }

    tooltip.remove();
    document.removeEventListener("click", closeTooltip, true);
    if (typeof shadowRoot !== "undefined" && shadowRoot) {
      try {
        shadowRoot.removeEventListener("click", closeTooltip, true);
      } catch (err) {}
    }
  };

  setTimeout(() => {
    document.addEventListener("click", closeTooltip, true);
    if (typeof shadowRoot !== "undefined" && shadowRoot) {
      shadowRoot.addEventListener("click", closeTooltip, true);
    }
  }, 50);
}

/**
 * Resets all highlights on the page
 */
function resetHighlights() {
  const highlights = document.querySelectorAll(".priority-highlight");
  console.log(`Found ${highlights.length} highlights to reset`);

  highlights.forEach((highlight) => {
    try {
      const parent = highlight.parentElement;
      if (parent) {
        const codeBlock =
          highlight.querySelector("pre") || highlight.querySelector("code");
        if (codeBlock && parent) {
          parent.replaceChild(codeBlock, highlight);
        } else {
          const textContent = highlight.textContent.replace("ⓘ", "");
          const textNode = document.createTextNode(textContent);
          parent.replaceChild(textNode, highlight);
        }
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

/**
 * Cleans the LLM response to ensure valid JSON
 */
function cleanLLMResponse(response) {
  try {
    let c = JSON.parse(response);

    return c["highlights"] ? JSON.stringify(c["highlights"]) : "[]";
  } catch (e) {
    try {
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
    } catch (cleaningError) {
      console.error("Unable to parse LLM response as JSON:", cleaningError);
      console.log("Raw response:", response);
      return "[]";
    }
  }
}

// Initialize UI
document.addEventListener("DOMContentLoaded", createUI);

// If document already loaded, create UI immediately
if (document.readyState !== "loading") {
  createUI();
}
