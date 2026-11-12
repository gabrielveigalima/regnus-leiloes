/** "R$ 1.234.567,89" -> 1234567.89 ; null se inválido. */
export function parseBRL(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const m = input.replace(/R\$|\s/g, "").match(/-?[\d.,]+/);
  if (!m) return null;
  let s = m[0];
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function discountPct(appraisal: number | null, bid: number | null): number | null {
  if (!appraisal || !bid || appraisal <= 0 || bid < 0) return null;
  return Math.round((1 - bid / appraisal) * 10000) / 100;
}
