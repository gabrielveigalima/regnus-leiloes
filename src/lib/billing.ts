import { changePlan } from "./orgs";

/**
 * Ponto de integração para cobrança (Asaas, Stripe, Mercado Pago…). A v1 NÃO cobra: o plano é definido
 * manualmente pelo admin da plataforma (`ManualBillingProvider`). Um provedor real implementa esta interface,
 * cria a assinatura no gateway e atualiza `Subscription`/`Organization.planId` ao receber os webhooks.
 */
export interface BillingProvider {
  readonly name: string;
  /** Inicia/atualiza a assinatura da organização no plano indicado. */
  subscribe(organizationId: string, planId: string): Promise<{ ok: true; checkoutUrl?: string } | { ok: false; error: string }>;
  /** Cancela a assinatura (efeito ao fim do período, a critério do provedor). */
  cancel(organizationId: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Traduz o corpo de um webhook do gateway em mudança de estado; retorna null para eventos ignorados. */
  parseWebhook(headers: Headers, rawBody: string): Promise<{ organizationId: string; status: "ACTIVE" | "PAST_DUE" | "CANCELLED"; planId?: string } | null>;
}

export class ManualBillingProvider implements BillingProvider {
  readonly name = "manual";
  subscribe(organizationId: string, planId: string) { return changePlan(organizationId, planId); }
  async cancel() { return { ok: false as const, error: "Cancelamento manual: altere o plano em Admin → Organizações." }; }
  async parseWebhook() { return null; }
}

export const billing: BillingProvider = new ManualBillingProvider();
