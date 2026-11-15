import { JSDOM } from "jsdom";

/**
 * PTG streams parts of a page: the server first sends a card with `<template id="P:n">` where a piece is
 * still loading, and later the piece itself in `<div hidden id="S:n">`. A browser runs React's `$RS`
 * script to move the piece into place; here there is no JavaScript, so do the same move.
 */
function resolveStreamedSegments(doc: Document): void {
  for (const placeholder of Array.from(doc.querySelectorAll('template[id^="P:"]'))) {
    const segment = doc.getElementById(`S:${placeholder.id.slice(2)}`);
    if (!segment || !placeholder.parentNode) continue;
    while (segment.firstChild) placeholder.parentNode.insertBefore(segment.firstChild, placeholder);
    placeholder.remove();
    segment.remove();
  }
}

/** Parses HTML the way a browser does, which matters: PTG nests `<div>` inside `<span>`. */
export function parseHtml(html: string): Document {
  const doc = new JSDOM(html).window.document;
  resolveStreamedSegments(doc);
  return doc;
}

export const text = (node: Element | null | undefined): string => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
