# Conector Frazão Leilões (frazaoleiloes.com.br)

- **robots.txt** (verificado 2026-11-12): `Allow: /`, `Disallow: /Auction/Index/` e `/Comitente/Dashboard`. Sem CAPTCHA/login. Sitemap público.
- **Descoberta:** `GET /sitemap-lotes.xml` → `/lote/{id}-{slug}` (398 lotes em 2026-11-12; todos imóveis). A listagem por leilão não traz preço nem endereço, então cada lote é buscado (~1 req/s ≈ 7 min).
  Filtro `--uf` só se aplica quando o slug termina em UF (alguns slugs são genéricos, ex. `casa-padrao-1-vagas-de-garagem`).
- **Lote** (3 famílias de HTML, mesmos seletores-chave): `h1.lot-title`, `h2.lot-subtitle` (endereço), `.auction-status`, `h4.label-grey` (datas das praças),
  `#minimum-increment` ("Lance inicial"), `Valor Avaliado` (só no formato estruturado), `Endereço Completo` com CEP (estruturado),
  `input#lat`/`#long` (coordenadas fornecidas pela fonte → `geoPrecision = SOURCE`, dispensa geocodificação), fotos em `cdn.frazaoleiloes.com.br/images/lot/…`.
  Alienação fiduciária (Itaú) traz 1º/2º leilão e o valor de cada praça no texto.
- **Cuidados:** todo regex de campo roda só na seção "Informações sobre o Lote" (o rodapé traz o CEP/endereço da própria Frazão).
  Judicial só com termos de execução ("Leilão Judicial", Exequente/Executado, Carta de Arrematação, "Juízo da…"); "Comarca de" e ações paralelas citadas nas condições não contam. Comitente só quando é pessoa jurídica.
  Descrição guardada para antes de observações/condições (LGPD). Edital é carregado por ajax: não é coletado.
- Resultado de referência (2026-11-12): 398 lotes, 0 erros, todos com preço, UF e cidade; 396 com coordenadas; judiciais contados com a regra estrita (a regra anterior, por número CNJ/Vara, superestimava).

Fixtures: `test/fixtures/frazao/`; testes: `test/frazao.test.ts`.
