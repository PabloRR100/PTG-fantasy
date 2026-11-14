import { JSDOM } from "jsdom";

/** Parses HTML the way a browser does, which matters: PTG nests `<div>` inside `<span>`. */
export function parseHtml(html: string): Document {
  return new JSDOM(html).window.document;
}

export const text = (node: Element | null | undefined): string => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
