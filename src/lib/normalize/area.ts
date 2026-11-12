/** "85,5 m²" -> 85.5 ; "2 ha" -> 20000 (m²). */
export function parseAreaM2(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return input;
  const m = input.toLowerCase().match(/(\d[\d.,]*)\s*(m²|m2|ha|hectares?)?/);
  if (!m) return null;
  let s = m[1]!;
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return m[2] && m[2].startsWith("h") ? n * 10000 : n;
}
