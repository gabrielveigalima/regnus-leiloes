# Conector Caixa (venda-imoveis.caixa.gov.br)

- **robots.txt:** `/robots.txt` retorna 404 (sem restrições) — verificado em 2026-11-12.
- **Lista:** `GET /listaweb/Lista_imoveis_{UF}.csv` (27 UFs). ISO-8859-1, separador `;`, 2 linhas de cabeçalho.
  Colunas: nº do imóvel; UF; cidade; bairro; endereço; preço; valor de avaliação; desconto; financiamento (Sim/Não); descrição; modalidade; link.
  Modalidades vistas: `Leilão SFI - Edital Único` (EXTRAJUDICIAL), `Venda Direta Online` e `Venda Online` (DIRECT_SALE), `Licitação Aberta`.
  Descrição: `Tipo, N de área total, N de área privativa, N de área do terreno, N qto(s), ... N vaga(s)` (decimal com ponto; 0.00 = ausente).
- **Detalhe (opcional):** `GET /sistema/detalhe-imovel.asp?hdnimovel={id}` (UTF-8). Traz matrícula, comarca/ofício, CEP, datas e valores das praças
  (leilão SFI), link do edital (`ExibeDoc('/editais/...')`), fotos (`/fotos/F{id}21.jpg`) e FGTS.
  É 1 requisição por imóvel (~1 req/s ⇒ horas para o Brasil todo), por isso só roda com `CAIXA_DETAIL=1`.
- Não há CAPTCHA/login nas páginas usadas. Termos de uso ainda precisam de revisão jurídica antes de comercializar (ver docs/compliance.md).
- Matrícula (PDF) e edital: apenas linkar, nunca republicar.

Fixtures em `test/fixtures/caixa/`; testes em `test/caixa.test.ts`.
