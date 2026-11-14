import { parseHtml } from "@/lib/ptg/dom";
import { UUID } from "@/lib/ptg/types";

const MATCH_HREF = new RegExp(`^/partidos/(${UUID})$`);

/** Match ids listed on a group's results page, in page order. */
export function parseResultsList(html: string): string[] {
  const ids: string[] = [];
  for (const a of parseHtml(html).querySelectorAll('a[data-cta-id="resultados_to_match_detail"]')) {
    const id = MATCH_HREF.exec(a.getAttribute("href") ?? "")?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
