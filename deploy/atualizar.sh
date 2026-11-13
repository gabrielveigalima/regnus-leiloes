#!/usr/bin/env bash
# Atualiza as bases no seu PC: varre todas as fontes, enriquece o detalhe, geocodifica e (opcional) gera o dump.
#   deploy/atualizar.sh                      varre tudo + enriquece/geocodifica por 2h (banco do .env)
#   deploy/atualizar.sh --prod               mesmo, mas no banco do .env.prod
#   deploy/atualizar.sh --horas 6            tempo para enriquecer/geocodificar
#   deploy/atualizar.sh --so-varrer          só a varredura das listagens (rápido)
#   deploy/atualizar.sh --fontes caixa,frazao
#   deploy/atualizar.sh --dump               ao final, gera o dump em export/ (para importar no phpMyAdmin)
set -uo pipefail
cd "$(dirname "$0")/.."

FONTES="caixa,megaleiloes,frazao,biasi,bb,vendasgov,lancejudicial,freitas"
HORAS=2; ENVF=""; SO_VARRER=0; DUMP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --prod) ENVF="--env-file=.env.prod" ;;
    --horas) HORAS="$2"; shift ;;
    --fontes) FONTES="$2"; shift ;;
    --so-varrer) SO_VARRER=1 ;;
    --dump) DUMP=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "opção desconhecida: $1"; exit 1 ;;
  esac; shift
done
[ -n "$ENVF" ] && [ ! -f .env.prod ] && { echo ".env.prod não existe"; exit 1; }

echo "== Banco: ${ENVF:-.env (local)} | fontes: $FONTES =="
FALHAS=""
for s in ${FONTES//,/ }; do
  echo "-- varrendo $s ($(date +%H:%M))"
  npx tsx $ENVF src/crawler/cli.ts --source "$s" || FALHAS="$FALHAS $s"
done

if [ "$SO_VARRER" = 0 ]; then
  echo "-- enriquecendo e geocodificando por ${HORAS}h (Ctrl+C é seguro; retoma na próxima)"
  npx tsx $ENVF src/overnight.ts --hours "$HORAS" --sources "caixa,megaleiloes,biasi" || FALHAS="$FALHAS overnight"
fi

[ "$DUMP" = 1 ] && { echo "-- gerando dump"; bash deploy/export-data.sh; }

if [ -n "$FALHAS" ]; then echo "== Terminou com falhas em:$FALHAS =="; exit 1; fi
echo "== Pronto =="
