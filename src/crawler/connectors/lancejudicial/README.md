# Conector Lance Judicial / Grupo Lance (grupolance.com.br)

- **Source.id = `lancejudicial`**. Leiloeiro de leilões judiciais, extrajudiciais e trabalhistas. **Inclui os lotes da PGFN** (imóveis penhorados em execução fiscal, vendidos pelo Comprei): o conector marca `seller = PGFN` e usa o link do Comprei quando não há edital.
- **robots.txt** (verificado 2026-11-13): `Disallow: /entrar/ /temp/ /search/ /ajax/ /auditorio/ /*.pdf$`. Usamos só `/imoveis?pagina=N` e as páginas de lote; **nunca** baixamos PDFs (o edital é apenas linkado, no CDN).
- **Listagem:** `GET /imoveis?pagina=N`, renderizada no servidor, 32 lotes por página (hoje 286 = 9 páginas; `.summary` traz total e páginas). Card: id (`data-key`), título livre ("Casa, A.T.: 788m², A.C.: 233m², Vila Muriqui, Mangaratiba/RJ"), preço, Judicial/Extrajudicial, cidade-UF, status ("Faça seu lance"/"Em breve"), foto.
- **Lote** (1 req/lote, ~5 min; `LANCE_DETAIL=0` publica só o card): valor atual, valor de avaliação, praças (data de encerramento e valor), "Localização" (endereço), coordenadas no embed do Google Maps, edital (CDN), fotos, descrição, processo/vara/comarca.
- **LGPD:** "Autor" e "Réu" nunca são lidos (testado). O texto padrão longo dos lotes da PGFN não vira descrição.
- Resultado de referência (2026-11-13): 286 lotes, 0 erros.

Fixtures: `test/fixtures/lance/`; testes: `test/lancejudicial.test.ts`.
