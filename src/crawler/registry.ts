import type { Connector } from "./core/connector";

/** Conectores implementados. Adicione aqui após criar connectors/<id>/ com fixtures e testes. */
import { caixa } from "./connectors/caixa";
import { megaleiloes } from "./connectors/megaleiloes";
import { frazao } from "./connectors/frazao";
import { biasi } from "./connectors/biasi";

export const connectors: Record<string, Connector> = { [caixa.id]: caixa, [megaleiloes.id]: megaleiloes, [frazao.id]: frazao, [biasi.id]: biasi };

export function getConnector(id: string): Connector {
  const c = connectors[id];
  if (!c) throw new Error(`Conector não implementado: ${id}. Disponíveis: ${Object.keys(connectors).join(", ") || "(nenhum)"}`);
  return c;
}
