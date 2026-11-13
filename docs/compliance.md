# Compliance, termos de uso e LGPD

> **Antes de comercializar (SaaS)**: este documento NÃO substitui revisão jurídica. É preciso que um advogado revise os termos de uso de cada site coletado e, idealmente, firmar acordos/feeds com os leiloeiros e bancos. A situação abaixo vale para o uso interno do Grupo Regnus.

## Princípios aplicados no código
1. **Educação com os servidores**: User-Agent `RegnusBot/1.0 (+contato)`, respeito ao `robots.txt` (fonte bloqueada fica marcada no admin), 1 req/s por domínio, retry com backoff e `Retry-After`. Preferimos listas/endpoints que o próprio site expõe (CSV da Caixa, sitemap, endpoint de listagem).
2. **Sem evasão**: nenhum CAPTCHA, login, paywall ou anti-bot é contornado; não há proxies rotativos. Fontes que respondem 403 ao robô (Sodré Santoro, Superbid, Leje) ficaram como **precisa de parceria**.
3. **Atribuição**: todo anúncio exibe a fonte e linka o anúncio original (web, e-mail, CSV e API). Editais, matrículas e laudos (PDF) são apenas linkados — nunca baixados nem republicados.
4. **Imagens**: não são baixadas; usamos o link original (`referrerPolicy=no-referrer`).

## LGPD
- Não armazenamos nome, CPF ou dados de devedores/partes. Guardamos número do processo e a vara quando públicos.
- Descrições são truncadas **antes** de trechos que citam ações, débitos e histórico registral (onde aparecem nomes); `Autor`/`Réu` nunca são lidos.
- Comitente só é guardado quando é pessoa jurídica identificável (banco/consórcio/S.A./Ltda).
- Dados de usuários do sistema: e-mail, nome e hash de senha (bcrypt). Chaves de API: apenas prefixo e hash. Logs de auditoria sem conteúdo sensível.
- Direitos do titular (exclusão/correção): tratar por solicitação ao controlador; remover o registro em `Listing`/`Property` e a linha em `RawSnapshot`, se houver.

## Situação por fonte (verificado em 2026-11-12)
| Fonte | robots.txt | Observação | Revisão dos termos de uso |
|---|---|---|---|
| Caixa | `/robots.txt` = 404 (sem restrições) | CSV público de listagem | **pendente** |
| Mega Leilões | `Allow: /`, `Disallow: /login` | HTML público | **pendente** |
| Frazão | `Disallow: /Auction/Index/` e `/Comitente/Dashboard` | sitemap + páginas de lote | **pendente** |
| Biasi | `Allow: /` | endpoint de listagem usado pelo próprio site | **pendente** |
| Portal Zuk | `Disallow: /ajax-lote*` | paginação só por ajax proibido → não coletado | n/a |
| Sodré Santoro, Superbid, Leje | — | HTTP 403 ao robô → "precisa de parceria" | n/a |
| VendasGov (Serpro) | portal devolve a SPA para /robots.txt (sem regras) | API JSON pública que o próprio portal usa; dados de órgãos públicos | **pendente** |
| Pestana | `Disallow:` vazio (site); API só nega `/edital/` | API de dados atrás de anti-bot (Radware) → "precisa de parceria" | n/a |

## Checklist antes de vender
- [ ] Revisão jurídica dos termos de cada fonte ativa (e das vedações a "scraping"/redistribuição).
- [ ] Contratos/feeds com leiloeiros e bancos (principalmente Caixa, Mega, Frazão, Biasi).
- [ ] Política de privacidade e termos de uso do Regnus Leilões; DPO/encarregado.
- [ ] Revisar se a API pública pode redistribuir os dados de cada fonte.
- [ ] Contato do robô (`CRAWLER_USER_AGENT`) funcionando (página `/bot` com e-mail de contato).
