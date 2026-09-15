#!/bin/bash
INPUT=$(cat)

# O comando so e extraido para a MENSAGEM. A comparacao e feita contra a entrada
# INTEIRA, e isso e deliberado: a extracao anterior era um `grep` sobre o JSON que
# parava na primeira aspas escapada, entao `echo "x"; terraform apply` virava
# `echo \` e passava por todos os padroes. Comparar o JSON cru e um superconjunto
# do comando — pode bloquear a mais (um padrao citado na descricao), nunca a menos.
COMMAND=$(printf '%s' "$INPUT" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { process.stdout.write(String(JSON.parse(s).tool_input.command)); }
    catch { process.stdout.write(s); }
  });
' 2>/dev/null || printf '%s' "$INPUT")

BLOCKED_PATTERNS=(
  "terraform apply"
  "terraform destroy"
  "firebase deploy"
  "gcloud run deploy"
  "gcloud .* delete"
  "gsutil rm"
  "\.env"
  "service-account.*\.json"
  "\.config/gcloud"
  # Chave de producao do AbacatePay (Etapa 8). Sandbox e producao usam a MESMA
  # URL; o que decide o ambiente e a chave. Uma cobranca ou um estorno criado por
  # engano com ela e dinheiro real do escritorio.
  "abc_prod_"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if printf '%s' "$INPUT" | grep -qiE "$pattern"; then
    echo "Bloqueado pelo hook: comando '$COMMAND' corresponde ao padrão restrito '$pattern'. Peça ao humano para executar isso manualmente." >&2
    exit 2
  fi
done

exit 0
