# Fontes

| Fonte | Tipo | Status | Volume | Frequência | Última verificação |
|---|---|---|---|---|---|
| caixa | Banco | ativa em teste: 27 UFs coletadas (24.042 imóveis; RJ 8.183, GO 3.451, SP 3.390) | 24.042 | 12h | 2026-11-12 |
| bb, santander, itau, bradesco | Banco | não iniciado | — | — | — |
| zuk, megaleiloes, sodresantoro, frazao, biasi, lancejudicial, superbid, freitas, leje, pestana | Leiloeiro | não iniciado | — | — | — |

Cada conector exige: README próprio, fixtures reais em `test/fixtures/<id>/`, testes de `parse` e `crawl --dry-run` real antes de ativar a `Source`.
Fontes que exijam CAPTCHA/login/anti-bot: marcar "precisa de parceria" e pular.
