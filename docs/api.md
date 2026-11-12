# API pública (somente leitura) — v1

Base: `https://<seu-dominio>/api/v1`. Disponível para organizações cujo plano inclui API. Chaves são criadas em **API** (menu) por `OWNER`/`ADMIN`.

## Autenticação
`Authorization: Bearer rl_xxxxxxxx_<segredo>` (ou `X-API-Key`). A chave só é exibida na criação; guardamos apenas o prefixo e o hash (sha256).
Chave ausente, inválida ou revogada → `401`. Plano sem API → `403`.

## Limites
60 requisições/minuto por chave (`API_RATE_LIMIT`). Cabeçalhos: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch s). Excedido → `429` com `Retry-After`.
Se o plano restringe UFs, a API só retorna imóveis dessas UFs (detalhe de outra UF → `404`).

## Atribuição obrigatória
Todo anúncio traz `listing.source` (`name` e `url` do anúncio original). Quem consome a API deve exibir a fonte e linkar o anúncio original; editais/matrículas (PDF) apenas linkados, nunca republicados.

## Endpoints
### `GET /properties`
Filtros (os mesmos da busca web): `uf`, `cidade`, `bairro`, `q`, `fonte`, `tipo` (`APARTMENT,HOUSE,LAND,COMMERCIAL,RURAL,OTHER`), `leilao` (`JUDICIAL,EXTRAJUDICIAL,DIRECT_SALE,LICITACAO_ABERTA`),
`status` (padrão `OPEN,UPCOMING`), `ocupacao`, `precoMin`, `precoMax`, `descMin`, `areaMin`, `areaMax`, `quartos`, `financia=1`, `fgts=1`, `pracaAte=AAAA-MM-DD`,
`ordem` (`desconto`|`preco`|`praca`|`recentes`). Paginação: `limit` (1–100, padrão 25) e `cursor` (valor de `next_cursor`).
Resposta: `{ "data": [Property + listing], "next_cursor": string|null, "total": number|null }` (`total` só na primeira página).

### `GET /properties/{id}`
Imóvel com todos os anúncios: `{ "data": { ...Property, "listings": [Listing] } }`.

## OpenAPI 3.0
```yaml
openapi: 3.0.3
info: { title: Regnus Leilões API, version: "1.0" }
servers: [{ url: https://SEU-DOMINIO/api/v1 }]
security: [{ bearer: [] }]
components:
  securitySchemes: { bearer: { type: http, scheme: bearer } }
  schemas:
    Error: { type: object, properties: { error: { type: object, properties: { code: { type: string }, message: { type: string } } } } }
    Round: { type: object, properties: { number: { type: integer }, date: { type: string, format: date-time, nullable: true }, min_bid: { type: number, nullable: true } } }
    Listing:
      type: object
      properties:
        id: { type: string }
        source: { type: object, properties: { id: { type: string }, name: { type: string }, url: { type: string, description: Link do anúncio original } } }
        external_id: { type: string }
        title: { type: string }
        seller: { type: string, nullable: true }
        auction_type: { type: string, enum: [JUDICIAL, EXTRAJUDICIAL, DIRECT_SALE, LICITACAO_ABERTA] }
        status: { type: string, enum: [UPCOMING, OPEN, CLOSED, SOLD, SUSPENDED, CANCELLED] }
        appraisal_value: { type: number, nullable: true }
        min_bid: { type: number, nullable: true }
        discount_pct: { type: number, nullable: true }
        next_auction_at: { type: string, format: date-time, nullable: true }
        accepts_financing: { type: boolean }
        accepts_fgts: { type: boolean }
        case_number: { type: string, nullable: true }
        notice_url: { type: string, nullable: true }
        rounds: { type: array, items: { $ref: "#/components/schemas/Round" } }
        images: { type: array, items: { type: string } }
        first_seen_at: { type: string, format: date-time }
        last_seen_at: { type: string, format: date-time }
    Property:
      type: object
      properties:
        id: { type: string }
        type: { type: string }
        address: { type: object, properties: { street: {type: string, nullable: true}, number: {type: string, nullable: true}, complement: {type: string, nullable: true}, neighborhood: {type: string, nullable: true}, city: {type: string, nullable: true}, uf: {type: string, nullable: true}, zip: {type: string, nullable: true} } }
        location: { type: object, nullable: true, properties: { lat: { type: number }, lng: { type: number }, precision: { type: string, nullable: true, description: "ADDRESS | STREET | CITY | SOURCE" } } }
        areas_m2: { type: object, properties: { private: {type: number, nullable: true}, total: {type: number, nullable: true}, land: {type: number, nullable: true} } }
        bedrooms: { type: integer, nullable: true }
        parking: { type: integer, nullable: true }
        occupation: { type: string, enum: [OCCUPIED, UNOCCUPIED, UNKNOWN] }
        registry: { type: string, nullable: true }
        registry_office: { type: string, nullable: true }
paths:
  /properties:
    get:
      summary: Lista imóveis em leilão
      parameters:
        - { name: uf, in: query, schema: { type: string } }
        - { name: cidade, in: query, schema: { type: string } }
        - { name: tipo, in: query, schema: { type: string }, description: Valores separados por vírgula }
        - { name: precoMax, in: query, schema: { type: number } }
        - { name: descMin, in: query, schema: { type: number } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 25 } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        "200": { description: OK }
        "401": { description: Chave inválida, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
        "403": { description: Plano sem API }
        "429": { description: Limite excedido }
  /properties/{id}:
    get:
      summary: Detalhe do imóvel com todos os anúncios
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { "200": { description: OK }, "404": { description: Não encontrado } }
```

## Exemplo
```bash
curl -H "Authorization: Bearer $REGNUS_KEY" "https://SEU-DOMINIO/api/v1/properties?uf=SP&tipo=HOUSE&descMin=30&limit=10"
```

## Exportação CSV (interface web)
Em **Buscar imóveis** → "Exportar CSV": até 5.000 linhas, UTF-8 com BOM, separador `;` (Excel pt-BR), com os filtros atuais e as UFs do plano. Células que começariam com `= + - @` são prefixadas com `'` (proteção contra injeção de fórmulas).
