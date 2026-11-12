/** Interpreta data/hora brasileira (America/Sao_Paulo, UTC-3 sem horário de verão desde 2019). */
export function parseBRDateTime(input: string | null | undefined): Date | null {
  if (!input) return null;
  const m = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2})[:h](\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0"] = m;
  const dt = new Date(Date.UTC(+y!, +mo! - 1, +d!, +h + 3, +mi));
  if (dt.getUTCMonth() !== +mo! - 1) return null;
  return dt;
}
