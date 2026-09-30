#!/usr/bin/env node
/**
 * Politica de alerta com `condition_matched_log` tem UMA condicao so.
 *
 * POR QUE ISTO E LINT E NAO UMA NOTA NA DOCUMENTACAO.
 *
 * O Cloud Monitoring recusa, no `apply`, uma politica de correspondencia de log
 * com mais de uma condicao: "Alert policies with a log matching condition can
 * only have a single condition" (HTTP 400). O `terraform plan` NAO valida essa
 * regra — ela mora na API, nao no provider —, entao o `plan` do PR passa verde e
 * o erro so aparece no deploy, depois do merge. Foi o que aconteceu com o PR #38
 * (`clamav_job_falhou`, tres condicoes): o apply aplicou parte do que havia e
 * parou, e a `main` ficou com uma politica que quebra todo deploy seguinte.
 *
 * Cada alerta baseado em log precisa ser uma politica propria, com o seu proprio
 * roteamento em `alertas-roteamento.json`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = 'infra/terraform';
const INICIO = /resource\s+"google_monitoring_alert_policy"\s+"([^"]+)"/g;

const problemas = [];

for (const arquivo of readdirSync(PASTA).filter((n) => n.endsWith('.tf'))) {
  const texto = readFileSync(join(PASTA, arquivo), 'utf8');
  const inicios = [...texto.matchAll(INICIO)];

  inicios.forEach((achado, i) => {
    const fim = inicios[i + 1]?.index ?? texto.length;
    const corpo = texto.slice(achado.index, fim);

    const condicoes = (corpo.match(/^\s*conditions\s*\{/gm) ?? []).length;
    const deLog = (corpo.match(/\bcondition_matched_log\s*\{/g) ?? []).length;

    if (deLog > 0 && condicoes > 1) {
      problemas.push(
        `${arquivo}: "${achado[1]}" tem ${String(condicoes)} condicoes e ` +
          `${String(deLog)} de correspondencia de log.`,
      );
    }
  });
}

if (problemas.length > 0) {
  console.error(
    'Politica de alerta por log com mais de uma condicao:\n' +
      problemas.map((linha) => `  - ${linha}`).join('\n') +
      '\n\nO Cloud Monitoring recusa isso no apply (HTTP 400), e o plan nao ve.\n' +
      'Divida em uma politica por condicao.',
  );
  process.exit(1);
}

console.log('✔ Politicas de alerta por log: uma condicao cada.');
