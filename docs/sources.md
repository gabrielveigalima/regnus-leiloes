# Fontes

| Fonte | Tipo | Status | Volume | Frequência | Última verificação |
|---|---|---|---|---|---|
| caixa | Banco | conector pronto (CSV por UF), Source ainda desativada até teste com MySQL | ~3.390 em SP | 12h | 2026-11-12 |
| bb, santander, itau, bradesco | Banco | não iniciado | — | — | — |
| zuk, megaleiloes, sodresantoro, frazao, biasi, lancejudicial, superbid, freitas, leje, pestana | Leiloeiro | não iniciado | — | — | — |

Cada conector exige: README próprio, fixtures reais em `test/fixtures/<id>/`, testes de `parse` e `crawl --dry-run` real antes de ativar a `Source`.
Fontes que exijam CAPTCHA/login/anti-bot: marcar "precisa de parceria" e pular.
