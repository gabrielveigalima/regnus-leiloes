export type PropertyTypeValue = "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL" | "RURAL" | "OTHER";

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parsePropertyType(text: string | null | undefined): PropertyTypeValue {
  const t = strip(text ?? "");
  if (/\b(apto|apartamento|flat|cobertura|kitnet|studio)\b/.test(t)) return "APARTMENT";
  if (/\b(sitio|fazenda|chacara|rural|gleba)\b/.test(t)) return "RURAL";
  if (/\b(terreno|lote|area)\b/.test(t)) return "LAND";
  if (/\b(sala|loja|galpao|comercial|predio|conjunto)\b/.test(t)) return "COMMERCIAL";
  if (/\b(casa|sobrado|residencia|chale)\b/.test(t)) return "HOUSE";
  return "OTHER";
}
