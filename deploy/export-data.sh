#!/usr/bin/env bash
# Exporta os DADOS DE IMÓVEIS do banco local para arquivos .sql.gz que você importa no phpMyAdmin da produção.
# Uso:  DATABASE_URL=mysql://user:senha@127.0.0.1:3306/regnus_leiloes deploy/export-data.sh [pasta-saida] [tamanho-max-por-arquivo, padrão 20 = 20 MB]
#   (sem DATABASE_URL, lê o .env da pasta do projeto)
# Exporta: Property, Listing, AuctionRound, ListingImage, ListingEvent, DuplicateCandidate, GeocodeCache.
# NÃO exporta usuários, organizações, planos, fontes, favoritos, buscas, chaves de API nem execuções.
# Pensado para a CARGA INICIAL (produção sem imóveis). Os ids dos imóveis vêm daqui; as coletas incrementais
# do servidor depois só atualizam essas linhas (casam por fonte + id externo).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"; fi
: "${DATABASE_URL:?defina DATABASE_URL (banco LOCAL com os dados coletados)}"
out="${1:-./export}"; max="${2:-20}"; mkdir -p "$out"
case "$max" in *[kKmM]) ;; *) max="${max}m" ;; esac   # tamanho máximo por parte: 20 (MB), 500k, 2m...
# Cada INSERT ocupa uma linha e uma linha nunca pode ser cortada ao meio: limita o tamanho da linha a 1/8 da parte.
case "$max" in *[kK]) max_bytes=$(( ${max%[kK]} * 1024 )) ;; *) max_bytes=$(( ${max%[mM]} * 1024 * 1024 )) ;; esac
nbl=$(( max_bytes / 8 )); [ "$nbl" -gt 1000000 ] && nbl=1000000; [ "$nbl" -lt 16384 ] && nbl=16384

dec() { python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1]))' "$1"; }
rest="${DATABASE_URL#mysql://}"; creds="${rest%%@*}"; hostdb="${rest#*@}"
user="$(dec "${creds%%:*}")"; pass="$(dec "${creds#*:}")"; hostport="${hostdb%%/*}"; db="${hostdb#*/}"; db="${db%%\?*}"
host="${hostport%%:*}"; port="${hostport#*:}"; [ "$port" = "$hostport" ] && port=3306

TABLES=(Property Listing AuctionRound ListingImage ListingEvent DuplicateCandidate GeocodeCache)
if command -v mysqldump >/dev/null 2>&1; then
  dump() { MYSQL_PWD="$pass" mysqldump -h "$host" -P "$port" -u "$user" "$@"; }
elif command -v docker >/dev/null 2>&1; then
  echo "mysqldump não encontrado; usando o contêiner do docker compose (serviço mysql)." >&2
  dump() { docker compose exec -T mysql mysqldump -u"$user" -p"$pass" "$@"; }
else
  echo "Instale o cliente MySQL (sudo apt install mysql-client) ou use docker compose." >&2; exit 1
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "Exportando ${TABLES[*]} de $db ..."
dump --no-create-info --skip-triggers --skip-add-locks --skip-lock-tables --single-transaction --complete-insert \
     --extended-insert --net-buffer-length="$nbl" --hex-blob --no-tablespaces --skip-comments --default-character-set=utf8mb4 \
     "$db" "${TABLES[@]}" > "$tmp/body.sql"

# Partes com no máximo N MB, cortadas em limites de linha (cada INSERT ocupa uma linha); cada parte é autossuficiente.
split -C "$max" -d -a 3 "$tmp/body.sql" "$tmp/part-"
rm -f "$out"/regnus-dados-*.sql.gz
n=0
for f in "$tmp"/part-*; do
  n=$((n+1)); name="$out/regnus-dados-$(printf '%03d' "$n").sql.gz"
  { echo "SET NAMES utf8mb4; SET FOREIGN_KEY_CHECKS=0; SET UNIQUE_CHECKS=0; SET autocommit=0;"; cat "$f"; echo; echo "COMMIT;"; } | gzip -9 > "$name"
  gzip -t "$name"
done
echo "Pronto: $n arquivo(s) em $out (importe em ordem, 001, 002, ...):"
ls -lh "$out"/regnus-dados-*.sql.gz
