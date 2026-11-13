# Conector VendasGov — Imóveis da União (SPU, INSS e outros)

- **Source.id = `vendasgov`** (tipo `GOVERNMENT`, intervalo padrão 24 h). Portal oficial do governo federal (Serpro): `imoveis.vendasgov.serpro.gov.br`.
- **API pública JSON** (a mesma que a página Angular usa; sem login, CORS aberto): robots.txt do portal devolve a própria página (sem regras).
  - Lista: `GET /api/direct/imoveis?page=N&size=100` → `{content:[ids], totalElements:2826, totalPages:29}`. **Só ids; nenhum filtro de situação funciona**.
  - Imóvel: `GET /api/public/imoveis/{id}` (~12 KB): tipo, endereço (+ CEP), matrícula/cartório, coordenadas, áreas, fotos, `sala`, `estagioAlienacao`, e `itens[]` com os editais (data do certame, valor de reserva, PDF).
  - Fotos e editais abrem sob `/api` (ex.: `/api/public/imoveis/456/fotos/…jpg`). Página humana: `/imovel/{id}`.
- **O que está à venda:** decidido pela *sala* do imóvel (`sala.subtipo`): `venda` → OPEN (venda direta); `autorizados` → UPCOMING (autorizado, aguardando edital; vale o valor do último certame); `concorrencia`/`leilao` → UPCOMING com a data do certame futuro, OPEN se o certame foi nos últimos 30 dias; **ignora** `emProcesso`, `vendido`, `pai`, `fundo` e concorrência com edital antigo (dado velho do portal). `parse` devolve `null` para isso e o runner pula.
- **Volume:** ~2.800 ids, mas só uns 5–10% estão em sala de venda. Uma coleta completa = ~2.800 requisições de detalhe (≈ 50 min a 1 req/s). Rode do PC (`CRAWLER_MIN_INTERVAL_MS=500 … --concurrency 2`) ou deixe o worker do servidor fazer 1×/dia.
- **Limitações:** valor é a reserva do último edital (pode ser antigo); a SPU raramente informa avaliação; endereços às vezes em texto livre.
- Resultado de referência (2026-11-13): amostra de 244 imóveis → ~14% em sala de venda (autorizados, concorrência, venda direta); 60 primeiros ids → 13 imóveis, 0 erros.

Fixtures: `test/fixtures/vendasgov/`; testes: `test/vendasgov.test.ts`.
