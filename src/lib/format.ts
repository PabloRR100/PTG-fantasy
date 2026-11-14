/** 1280 -> "1.280". Grouped by hand: Intl's es-ES skips the separator on 4-digit numbers. */
export function formatInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 5000000 -> "5.000.000 €". */
export function formatMoney(euros: number): string {
  return `${formatInt(euros)} €`;
}
