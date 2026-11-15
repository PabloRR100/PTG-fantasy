"use client";

import { ClauseForm } from "@/components/forms";
import { PlayersTable } from "@/components/PlayersTable";
import { clausePrice } from "@/services/clause";
import type { DirectoryRow } from "@/services/player-directory";

/** The player directory with a clause button on every player a rival owns. A client component: the `extra` cell is a function. */
export function ClausePlayersTable({ rows, myTeam, budget }: { rows: DirectoryRow[]; myTeam: string; budget: number }) {
  return (
    <PlayersTable rows={rows} extra={{
      label: "Cláusula",
      cell: (row) => row.owner === null || row.owner === myTeam ? null : <ClauseForm player={row.id} price={clausePrice(row.value)} name={row.name} budget={budget} />,
    }} />
  );
}
