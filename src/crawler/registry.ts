import type { Connector } from "./core/connector";

/** Conectores implementados. Adicione aqui após criar connectors/<id>/ com fixtures e testes. */
import { caixa } from "./connectors/caixa";

export const connectors: Record<string, Connector> = { [caixa.id]: caixa };

export function getConnector(id: string): Connector {
  const c = connectors[id];
  if (!c) throw new Error(`Conector não implementado: ${id}. Disponíveis: ${Object.keys(connectors).join(", ") || "(nenhum)"}`);
  return c;
}
