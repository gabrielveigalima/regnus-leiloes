# Conector Biasi Leilões (biasileiloes.com.br)

- **robots.txt** (verificado 2026-11-12): `Allow: /`. Sem CAPTCHA/login. Mesma plataforma de leilão da Frazão, mas **template diferente** (por isso parser próprio).
- **Descoberta:** o sitemap lista mais de 2.500 lotes (muitos antigos/removidos, inclusive de teste). Usamos o endpoint que o próprio site chama para montar a listagem:
  `GET /Sale/LotListSearch?categoria=&subcategoria=&term=&start=N&limit=48&buscaImovel=false` (HTML parcial; `#leilao-lista-lote[total]` = total, hoje 388 → 9 páginas).
  O card traz id, URL, título "… - Cidade/UF", "Valor Inicial", status e o comitente (alt do logo).
- **Lote** (1 req/lote, ~7 min; desligue com `BIASI_DETAIL=0` para publicar só o card): datas (`Data:` ou `Nº Leilão dia …`), "Lance Inicial", endereço
  (`Endereço Completo` com CEP, ou subtítulo), áreas, matrícula/ofício, ocupação, fotos (`img.foto-leilao[key]`), edital (`.file-list`) e `input#lat/#long` (coordenadas da fonte → `SOURCE`).
- **Cuidados:** cidade/UF vêm do título (o subtítulo às vezes traz outra cidade por erro do comitente); título ambíguo ("… no Centro de X/UF") deixa a cidade vazia até o detalhe.
  CEP do rodapé (04304-010) nunca é usado. Judicial só com termos de execução — "ação revisional" etc. nas condições não conta. Coordenada fora do Brasil é descartada.
  Descrição guardada para antes de cláusulas/observações (LGPD).
- Resultado de referência (2026-11-12): 388 lotes, 0 erros, todos com cidade/UF/preço/data; 387 com coordenadas; comitentes: Santander (211), Itaú (140), consórcios.

Fixtures: `test/fixtures/biasi/`; testes: `test/biasi.test.ts`.
