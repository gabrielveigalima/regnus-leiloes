const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export function normalizeUf(input: string | null | undefined): string | null {
  const u = (input ?? "").trim().toUpperCase();
  return UFS.has(u) ? u : null;
}

export function normalizeZip(input: string | null | undefined): string | null {
  const d = (input ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

export function normalizeText(input: string | null | undefined): string {
  return (input ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\b(rua|r|avenida|av|travessa|tv|alameda|al)\b\.?/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function titleCaseCity(input: string | null | undefined): string | null {
  const s = (input ?? "").trim().toLowerCase();
  if (!s) return null;
  return s.split(/\s+/).map((w, i) => (i > 0 && ["de", "da", "do", "das", "dos", "e"].includes(w) ? w : w[0]!.toUpperCase() + w.slice(1))).join(" ");
}
