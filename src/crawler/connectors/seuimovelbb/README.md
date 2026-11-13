# Conector Banco do Brasil — Seu Imóvel BB (seuimovelbb.com.br)

- **Source.id = `bb`**. O Seu Imóvel BB é a vitrine online de imóveis do Banco do Brasil (operada por parceiro, "The Resale"), que reúne anúncios de leiloeiros parceiros.
- **robots.txt** (verificado 2026-11-12): só comentários de *content signals* da Cloudflare, sem `Disallow`. Sem CAPTCHA/login nas páginas usadas.
- **Listagem:** o próprio site chama `POST /catalogo` (`pagina`, `categorias`, … `cppnp`). Exige o cookie `PHPSESSID` do `GET /catalogo` **e** o token `#_cppnp` dessa sessão (o `HttpClient` mantém cookies e ganhou `post()`).
  Resposta JSON: `lista` (HTML dos cards, 50 por página), `imoveis` (total, hoje 975 = 20 páginas), `paginacao`.
  Card: id, tipo, cidade-UF, preço ("Valor para proposta"/"lance inicial"; **ausente nos imóveis "Aceita BB?"**), data do leilão sem ano (`17/11 às 10h`), parceiro.
- **Imóvel** (`/imovel/id/{id}`, 1 req/imóvel; `BB_DETAIL=0` publica só o card): descrição legal (matrícula, ofício, endereço, áreas, quartos), condições (ocupação, locação), `Data do leilão`, fotos (`/imagem/imovel/{id}_{n}.jpg`) e coordenadas no script do mapa (`lat/lng` → `SOURCE`).
- **Cuidados:** o preço do imóvel vem antes de "Descrição"; depois há cards de "Imóveis relacionados" (outro preço). Só a descrição legal é guardada (as condições a), b)… ficam de fora). Tipo do card prevalece sobre o texto.
- Limitação: ~5% dos imóveis ("Aceita BB?") não exibem preço publicamente → `minBid` nulo.
- Resultado de referência (2026-11-12): 975 imóveis, 0 erros.

Fixtures: `test/fixtures/seuimovelbb/`; testes: `test/seuimovelbb.test.ts`.
