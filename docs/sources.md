# Fontes

| Fonte | Tipo | Status | Volume | Frequência | Última verificação |
|---|---|---|---|---|---|
| caixa | Banco | em desenvolvimento (conector pendente) | — | — | — |
| bb, santander, itau, bradesco | Banco | não iniciado | — | — | — |
| zuk, megaleiloes, sodresantoro, frazao, biasi, lancejudicial, superbid, freitas, leje, pestana | Leiloeiro | não iniciado | — | — | — |

Cada conector exige: README próprio, fixtures reais em `test/fixtures/<id>/`, testes de `parse` e `crawl --dry-run` real antes de ativar a `Source`.
Fontes que exijam CAPTCHA/login/anti-bot: marcar "precisa de parceria" e pular.
