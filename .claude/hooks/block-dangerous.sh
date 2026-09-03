#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

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
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qiE "$pattern"; then
    echo "Bloqueado pelo hook: comando '$COMMAND' corresponde ao padrão restrito '$pattern'. Peça ao humano para executar isso manualmente." >&2
    exit 2
  fi
done

exit 0