# Arquitetura

```
 Fontes (Caixa, leiloeiros…)            Web (Next.js, Hostinger)              Worker (VPS / cron)
        │  HTTP educado                      busca · mapa · favoritos             agenda → fila → conectores
        ▼                                    alertas · admin · API v1                    │
  conector.discover/fetchDetail/parse ─────────────► MySQL 8 ◄───────────────────────────┘
                 (zod)                  Property · Listing · AuctionRound · CrawlRun/Job
                                         Organization/User/Plan · Favorite · SavedSearch · ApiKey
```

## Dados
- **Property** é o bem físico; **Listing** é o anúncio de uma fonte (`sourceId + externalId` únicos). O mesmo imóvel em duas fontes = 1 Property, 2 Listings.
- Mudanças de preço, status e data geram `ListingEvent` (linha do tempo e gatilho de alertas). `rawHash` evita escrita quando nada mudou.
- Dados de imóveis são **globais**; dados de usuário (favoritos, buscas salvas) só se acessam por `tenantDb(organizationId, userId)` (`src/lib/tenancy.ts`).
- Limites do plano (UFs, buscas salvas, API, CSV) vivem em `src/lib/access.ts`.

## Coleta (`src/crawler`)
- `core/http.ts`: User-Agent identificável, robots.txt (cache 24 h), 1 req/s por domínio, retry com backoff e `Retry-After`, ETag.
- `core/runner.ts`: executa um conector, faz upsert, grava eventos, fecha o que sumiu após **2 coletas completas** e registra o `CrawlRun`.
- `core/queue.ts`: fila em MySQL (`SELECT … FOR UPDATE SKIP LOCKED`, lease, retry exponencial). Atenção: consultas com `OR` travam intervalos e serializam workers; datas vão como parâmetro (UTC), nunca `NOW()`.
- Conectores: Caixa (CSV por UF), Mega Leilões (lista paginada), Frazão (sitemap + lote), Biasi (endpoint de listagem + lote). Contrato: `Connector { discover, fetchDetail?, parse }`, `parse` puro e testado com fixtures reais em `test/fixtures/<id>/`.
- **Proibido** contornar CAPTCHA, login, paywall ou anti-bot. Fonte que exigir isso fica como "precisa de parceria" em `docs/sources.md`.

## Pipeline de um anúncio
`parse` → `resolveProperty` (dedup) → `Property` + `Listing` + praças/fotos/eventos → geocodificação (worker, em lote) → alertas.

## Deduplicação (`src/lib/dedup.ts`)
Matrícula+ofício → CEP+número+complemento → similaridade de endereço (trigramas) + área ±5 %. Só funde sozinho com confiança ≥ 92 % **e** quando a mesma fonte não tem outro anúncio ativo no imóvel; o resto vai para `/admin/duplicados`.

## Geocodificação
`GeocodeProvider` plugável (Nominatim hoje), cache em `GeocodeCache` (inclusive negativo), tentativas endereço → rua → cidade (`geoPrecision`). Algumas fontes (Frazão, Biasi) já trazem coordenadas (`SOURCE`).

## Web
Rotas: `/busca` (filtros na URL, cursor, lista/mapa, CSV), `/imovel/[id]`, `/favoritos`, `/alertas`, `/chaves`, `/admin/{fontes,execucoes,duplicados}`, `/api/health`, `/api/v1/*`.
Autenticação: next-auth (credenciais + bcrypt, JWT). `src/proxy.ts` exige login em tudo, exceto `/login`, `/api/auth`, `/api/health` e `/api/v1` (chave de API). Cabeçalhos de segurança (CSP etc.) em `next.config.js`.

## Observabilidade
`/api/health` (banco + idade da última coleta), `CrawlRun`/`CrawlJob` no admin, alerta visual de queda de volume > 50 % (parser quebrado), `AuditLog` para ações administrativas.
