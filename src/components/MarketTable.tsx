"use client";

import { BidForm } from "@/components/forms";
import { PlayersTable } from "@/components/PlayersTable";
import type { DirectoryRow } from "@/services/player-directory";

/** A player on an open listing: the directory facts plus what the bid needs. */
export type MarketRow = DirectoryRow & { listingId: string; myBid: number | null };

/** Mercado: the open listings in the player table (search, filters, sortable columns) with a bid control per row. */
export function MarketTable({ rows, budget }: { rows: MarketRow[]; budget: number }) {
  return (
    <PlayersTable
      rows={rows}
      omit={["owner", "called", "points", "average"]}
      extra={{ label: "Tu puja", cell: (row) => <BidForm listingId={row.listingId} minimum={row.value} budget={budget} current={row.myBid} /> }}
    />
  );
}
