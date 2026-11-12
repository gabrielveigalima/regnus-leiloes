#!/usr/bin/env bash
# Backup lógico do MySQL + verificação. Uso: DATABASE_URL=mysql://user:pass@host:3306/db deploy/backup-db.sh [diretório]
# Rode ANTES de cada deploy e agende diariamente (cron). Guarde os arquivos fora do diretório do deploy.
set -euo pipefail
: "${DATABASE_URL:?defina DATABASE_URL}"
out="${1:-./backups}"; mkdir -p "$out"
proto_stripped="${DATABASE_URL#mysql://}"; creds="${proto_stripped%%@*}"; hostdb="${proto_stripped#*@}"
user="${creds%%:*}"; pass="${creds#*:}"; hostport="${hostdb%%/*}"; db="${hostdb#*/}"; db="${db%%\?*}"
host="${hostport%%:*}"; port="${hostport#*:}"; [ "$port" = "$hostport" ] && port=3306
file="$out/${db}-$(date +%Y%m%d-%H%M%S).sql.gz"
MYSQL_PWD="$(python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1]))' "$pass")" \
  mysqldump -h "$host" -P "$port" -u "$(python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1]))' "$user")" \
  --single-transaction --routines --no-tablespaces "$db" | gzip > "$file"
# Verificação: gzip íntegro e dump contém as tabelas principais.
gzip -t "$file"
for t in Listing Property Source CrawlRun User; do zcat "$file" | grep -q "CREATE TABLE \`$t\`" || { echo "Backup inválido: tabela $t ausente" >&2; exit 1; }; done
echo "Backup OK: $file ($(du -h "$file" | cut -f1))"
# Retenção: mantém 14 dias
find "$out" -name "${db}-*.sql.gz" -mtime +14 -delete
