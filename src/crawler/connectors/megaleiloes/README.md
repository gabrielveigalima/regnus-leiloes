# Conector Mega Leilões (megaleiloes.com.br)

- **robots.txt** (verificado 2026-11-12): `Allow: /`, `Disallow: /login`. Sem CAPTCHA/login nas páginas usadas.
- **Lista:** `GET /imoveis` e `GET /imoveis?pagina=N` (48 lotes por página; hoje 18 páginas = 835 itens, o mesmo total que o site exibe em "Exibindo 1 - 48 de 835 itens").
  Card (`div[data-key] > div.card`): código `X…` (extrajudicial) / `J…` (judicial) em `.card-number`, título "Tipo área - Bairro - Cidade - UF",
  preço da praça ativa, localidade, tipo de leilão, status ("Aberto para lances" / "Em breve"), ícone do comitente (`bank_icons/…`),
  e `.instance` com data e valor de cada praça (praça única = "Data:").
- **Lote (opcional):** `GET <url do lote>`. Blocos `.item` (`.header`/`.value`): Localização, Comitente (extrajudicial), Processo (judicial),
  Valor de Avaliação (`R$ 0,00` = não informado → ignorado); descrição em `#tab-description .content`; fotos em `data-mfp-src`; edital em `/auctions/{id}/…edital….pdf`.
  Uma requisição por lote (~1 req/s), por isso só roda com `MEGA_DETAIL=1`.
- **LGPD:** a descrição guardada para na primeira menção a ações/débitos/histórico registral (que cita partes). Autor/Réu nunca são lidos.
- **Comitente:** em leilões judiciais o ícone é do próprio leiloeiro e é descartado (`seller = null`).
- Matrícula, laudo e edital (PDF): apenas linkar.

Fixtures: `test/fixtures/megaleiloes/`; testes: `test/megaleiloes.test.ts`.
