# Pendências (revisão de 2026-11-12)

Estado: Fases 1–6 e 8 do plano implementadas e testadas (91 testes, incluindo MySQL real); Fase 7 depende de aprovação. **Nada foi implantado** e a interface **nunca foi vista num navegador** (extensão do Chrome indisponível na sessão) — tudo foi verificado por testes e HTTP (`curl`).

## 1. Antes de colocar no ar (bloqueantes)
| # | Item | Observação |
|---|---|---|
| 1 | Validar a interface no navegador | Login, mapa (Leaflet + tiles OSM), formulários/server actions e **CSP** (`unsafe-inline` em script/estilo). Se algo quebrar com a CSP, ajustar `next.config.js`. |
| 2 | Deploy real | Hostinger (web) + VPS ou cron (worker), SMTP real, `NEXTAUTH_SECRET`, monitor em `/api/health`. `deploy/backup-db.sh`, `Dockerfile`, `docker-compose.yml`, PM2 e o workflow `crawl-tick.yml` **nunca foram executados**. |
| 3 | Ativar fontes e subir o worker | Todas as `Source` nascem desativadas. Ativar `caixa`, `megaleiloes`, `frazao`, `biasi` em Admin → Fontes. Sem worker, "Rodar agora" só enfileira. |
| 4 | Trocar a senha do admin | Agora existe: **Minha conta** (`/conta`) e **Esqueci minha senha** (`/esqueci-senha`, exige SMTP). Falta executar no ambiente real. |
| 5 | Página `/bot` | O User-Agent `RegnusBot/1.0 (+https://regnus.com.br/bot)` promete uma página de contato; ela não existe. |
| 6 | Revisão jurídica dos termos de uso das fontes | Obrigatória antes de comercializar (ver `docs/compliance.md`). |

## 2. Funcionalidades do plano ainda não feitas
- **Conectores:** bancos (Banco do Brasil, Santander, Itaú, Bradesco) — Santander e Itaú já aparecem como comitentes no Frazão/Biasi; Portal Zuk (paginação só via ajax proibido pelo robots.txt); Lance Judicial e Freitas (a investigar). **Meta de 10+ leiloeiros: 4 ativos** (Caixa, Mega, Frazão, Biasi). Sodré Santoro, Superbid, Leje e Pestana: anti-bot → "precisa de parceria".
- **SaaS:** feito em 2026-11-12: `/usuarios` (convite, papel, remoção, limite `maxUsers`), `/conta` (perfil e senha), recuperação de senha por e-mail, `/admin/organizacoes` (onboarding e troca de plano). Falta: interface `BillingProvider` (não criada) e login em mais de uma organização (usa a primeira).
- **Sessões:** o JWT dura 12 h e não é revogado ao trocar a senha; remoção de membro e mudança de papel valem na hora (a sessão é conferida no banco a cada requisição). Ações que falham (ex.: remover o último proprietário) lançam erro em vez de mostrar mensagem na tela.
- **Fase 7:** botão "Enviar para análise" no house-flipping-app — aguarda sua aprovação (altera outro projeto).
- **Busca:** filtros de **fonte** e **ocupação** funcionam na URL/API mas faltam no formulário; busca livre usa `contains` (o índice FULLTEXT existe mas não é usado); busca por raio (SQL em `prisma/manual/001_property_point.sql` não aplicado); preço/m² e "dias até o leilão" não são exibidos.
- **Normalização:** tabela de municípios do IBGE (`prisma/data/municipios.json`) não existe; cidades são só capitalizadas.
- **Coleta:** `RawSnapshot`/`snapshot.ts` (HTML bruto para depurar parser) e Playwright (`requiresBrowser`) não implementados — nenhum conector precisa ainda.
- **Alertas:** sem link de descadastro no e-mail (só "Gerenciar alertas", que exige login); sem envio de teste de SMTP.
- **Exportação:** só CSV (sem `.xlsx`). **API:** OpenAPI apenas em `docs/api.md` (não é servido por endpoint).
- **Admin:** alerta de queda de volume é só visual (não notifica); sem edição do intervalo de coleta.

## 3. Dados e qualidade
- **Cruzamento entre fontes nunca foi exercitado com dados reais.** O Mega Leilões, sem `MEGA_DETAIL=1`, não traz endereço/número, então a deduplicação não casa com Frazão/Biasi/Caixa (que têm). A Caixa sem `CAIXA_DETAIL=1` não traz matrícula/CEP/praças. Decidir quais fontes rodam com detalhe (custo: ~1 req/s).
- Geocodificar ~25 mil imóveis no Nominatim público leva horas; Frazão/Biasi já trazem coordenadas (`SOURCE`). Considerar provedor pago ou Nominatim próprio.
- Revisar os candidatos de duplicado gerados (Frazão ~8, Biasi 2, Caixa 1) em `/admin/duplicados`. Sem varredura retroativa: a dedup só vale para o que entra na coleta. Depois de mesclar, o registro do par some (o histórico fica no `AuditLog`).
- Lacunas observadas: Biasi 24 lotes sem matrícula e 81 sem área; Frazão 15 sem matrícula e 39 sem área.
- Judicial vs. extrajudicial usa heurística por termos (Frazão/Biasi): conferir amostras.

## 4. Segurança e operação
- Limites de **login** e **API** são em memória: não valem com mais de uma instância web (mover para Redis/DB).
- `npm audit` (dependências de produção): corrigido nesta revisão (`nodemailer` → 10.5.0, `zod` → 4.6.7). Restam 7 avisos *moderados* só em ferramentas de desenvolvimento (`typescript-eslint`/`minimatch`).
- Não há CI: os testes com MySQL só rodam se `TEST_DATABASE_URL` estiver definida. Sugestão: workflow com serviço `mysql:8.4` rodando `typecheck`, `lint` e `test`.
- Ambiente local de teste usou MySQL temporário (`mysql-memory-server`); a imagem Docker oficial `mysql:8` pedida no plano não foi usada.

## 5. Repositório
- Existe `origin` (`github.com/gabrielveigalima/regnus-leiloes`) e o commit "first commit" (73aa003) foi feito por você durante a sessão; `origin/main` está em `f7702d0`. Os commits posteriores (Pestana, dependências, esta lista) **não foram enviados** — não fiz push.
