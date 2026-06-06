/**
 * Minimal SSE frame parser for the status stream. Pure and incremental: feed it
 * the accumulated buffer, it returns complete messages plus the unparsed
 * remainder to carry into the next chunk.
 *
 * @internal
 */

export type SseMessage = { event: string; data: string };

/** Parse a single `\n`-separated SSE block into a message, or null for comments/heartbeats. */
function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith(":")) {
      continue; // comment / heartbeat
    }
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }
  return { event, data: dataLines.join("\n") };
}

/**
 * Extract complete SSE messages from a buffer. Messages are separated by a
 * blank line (`\n\n`); any trailing partial frame is returned as `rest`.
 */
export function parseSseBuffer(buffer: string): {
  messages: SseMessage[];
  rest: string;
} {
  const messages: SseMessage[] = [];
  let rest = buffer;

  let separator = rest.indexOf("\n\n");
  while (separator !== -1) {
    const block = rest.slice(0, separator);
    rest = rest.slice(separator + 2);
    const message = parseBlock(block);
    if (message) {
      messages.push(message);
    }
    separator = rest.indexOf("\n\n");
  }

  return { messages, rest };
}
