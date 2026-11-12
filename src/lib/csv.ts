/** Escapa uma célula CSV (separador `;`, padrão do Excel pt-BR) e neutraliza injeção de fórmulas. */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`; // =cmd|..., +, -, @ viram texto
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: unknown[]) => cells.map(csvCell).join(";");

/** BOM UTF-8 para o Excel reconhecer acentos. */
export const csvDocument = (rows: unknown[][]) => "﻿" + rows.map(csvRow).join("\r\n") + "\r\n";

export const dec = (v: unknown, digits = 2) => (v == null ? "" : Number(v).toFixed(digits).replace(".", ","));
