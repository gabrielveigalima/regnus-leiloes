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

if [ -z "$ENVF" ] && [ ! -f .env ]; then
  echo "Falta o .env com o banco local. Crie-o:  cp .env.example .env  (DATABASE_URL já aponta para mysql://root:root@127.0.0.1:3306/regnus_leiloes)"; exit 1
fi
# confere se o MySQL responde antes de disparar 8 processos que falhariam juntos
if ! node ${ENVF:+$ENVF} -e '
require("dotenv/config");
const u=new URL((process.env.DATABASE_URL||"").replace(/^"|"$/g,""));
const s=require("net").connect(+(u.port||3306),u.hostname);
s.setTimeout(4000);
s.on("connect",()=>{s.end();process.exit(0)});
s.on("error",()=>process.exit(1));s.on("timeout",()=>process.exit(1));' 2>/dev/null; then
  echo "O MySQL não responde. Suba-o primeiro:  docker compose up -d mysql   (ou: sudo service mysql start)"
  echo "Primeira vez: npx prisma migrate deploy && npm run db:seed"; exit 1
fi

echo "== Banco: ${ENVF:-.env (local)} | fontes: $FONTES | em paralelo (1 processo por fonte) =="
mkdir -p logs

# Cada fonte é um site diferente, então rodam ao mesmo tempo sem quebrar o limite de 1 req/s POR SITE.
paralelo() { # $1 = rótulo, resto = comando
  local nome="$1"; shift
  ( "$@" 2>&1 | sed -u "s/^/[$nome] /" | tee "logs/$nome.log" >/dev/null; exit "${PIPESTATUS[0]}" ) &
  PIDS+=("$!"); NOMES+=("$nome")
}
esperar() {
  for i in "${!PIDS[@]}"; do wait "${PIDS[$i]}" || FALHAS="$FALHAS ${NOMES[$i]}"; done
  PIDS=(); NOMES=()
}
FALHAS=""; PIDS=(); NOMES=()

echo "-- 1/2 varrendo listagens ($(date +%H:%M)); acompanhe com: tail -f logs/*.log"
for s in ${FONTES//,/ }; do paralelo "varrer-$s" npx tsx $ENVF src/crawler/cli.ts --source "$s"; done
esperar

if [ "$SO_VARRER" = 0 ]; then
  echo "-- 2/2 enriquecendo (uma fonte por processo) e geocodificando, por ${HORAS}h (Ctrl+C é seguro; retoma na próxima)"
  for s in caixa megaleiloes biasi; do
    case ",$FONTES," in *",$s,"*) paralelo "enriquecer-$s" npx tsx $ENVF src/overnight.ts --hours "$HORAS" --sources "$s" --no-geocode ;; esac
  done
  paralelo "geocodificar" npx tsx $ENVF src/overnight.ts --hours "$HORAS" --sources "" 
  esperar
fi

[ "$DUMP" = 1 ] && { echo "-- gerando dump"; bash deploy/export-data.sh; }

if [ -n "$FALHAS" ]; then echo "== Terminou com falhas em:$FALHAS =="; exit 1; fi
echo "== Pronto =="
