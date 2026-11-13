# Freitas Leiloeiro

- Lista: `GET /Leiloes/PesquisarLotes?Categoria=2&PageNumber=N&TopRows=12` (fragmento HTML, `.cardlote`); termina em "Nenhum lote localizado".
- Detalhe: `/Leiloes/LoteDetalhes?leilaoId=X&loteNumero=Y` — endereço, descrição completa (matrícula, áreas, ocupação), abertura de lances, link do edital.
- `externalId` = `leilaoId-lote`. `FREITAS_DETAIL=0` usa só o card.
- Vendedor extraído do título do leilão quando é banco (ex.: Bradesco); leilões particulares ficam sem vendedor.
- PDFs apenas linkados. Fixtures em `test/fixtures/freitas/`.
