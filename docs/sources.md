# Fontes

| Fonte | Tipo | Status | Volume | Frequência | Última verificação |
|---|---|---|---|---|---|
| caixa | Banco | ativa em teste: 27 UFs coletadas (24.042 imóveis; RJ 8.183, GO 3.451, SP 3.390) | 24.042 | 12h | 2026-11-12 |
| megaleiloes | Leiloeiro | conector pronto (lista + lote opcional); Source ainda desativada | 835 | 12h | 2026-11-12 |
| zuk | Leiloeiro | adiado: a listagem só traz 30 cards e a paginação é por `ajax-lote`, proibido no robots.txt | — | — | 2026-11-12 |
| sodresantoro, superbid, leje | Leiloeiro | **precisa de parceria**: HTTP 403 (anti-bot) para o RegnusBot | — | — | 2026-11-12 |
| lancejudicial, freitas | Leiloeiro | a investigar (redirecionamentos/robots 302) | — | — | 2026-11-12 |
| frazao | Leiloeiro | conector pronto (sitemap + lote, coordenadas da fonte); Source ainda desativada | 398 | 12h | 2026-11-12 |
| biasi | Leiloeiro | conector pronto (endpoint de listagem do site + lote, coordenadas da fonte); Source ainda desativada | 388 | 12h | 2026-11-12 |
| pestana | Leiloeiro | acessível (HTTP 200, robots permissivo); conector não iniciado | — | — | 2026-11-12 |
| bb, santander, itau, bradesco | Banco | não iniciado (muitos publicam via leiloeiros; ver Mega Leilões como comitente) | — | — | — |

Cada conector exige: README próprio, fixtures reais em `test/fixtures/<id>/`, testes de `parse` e `crawl --dry-run` real antes de ativar a `Source`.
Fontes que exijam CAPTCHA/login/anti-bot: marcar "precisa de parceria" e pular.
