#!/usr/bin/env node
/**
 * Todo TIPO de recurso do Terraform precisa de um papel declarado para o CI.
 *
 * POR QUE ISTO E LINT, E POR QUE SO ISTO RESOLVE.
 *
 * Os papeis de projeto da `terraform-ci` sao concessao manual de bootstrap, fora
 * do Terraform, e por um bom motivo: geridos pelo proprio pipeline, um plan mal
 * revisado poderia revogar o acesso do CI a si mesmo, sem caminho de volta (ver
 * o cabecalho de `infra/terraform/iam.tf`).
 *
 * O preco dessa escolha e uma falha que chega SEMPRE tarde: o `plan` do PR passa
 * verde — ele nao cria nada — e o 403 aparece no `apply`, depois do merge, com o
 * deploy pela metade. Aconteceu na Etapa 7 (`cloudtasks`, `cloudscheduler`) e de
 * novo na Etapa 12, em que seis metricas por log e um uptime check foram
 * recusados.
 *
 * Este script nao consulta o IAM — nao ha credencial no lint, e nem deveria
 * haver. Ele faz a unica coisa que da para fazer antes do merge: obrigar quem
 * acrescenta um tipo de recurso novo a DECIDIR qual papel ele exige, e a
 * registrar essa decisao onde a proxima pessoa vai encontra-la.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = 'infra/terraform';
const TABELA = join(PASTA, 'papeis-de-bootstrap.json');

const papeis = JSON.parse(readFileSync(TABELA, 'utf8'));
const prefixos = Object.keys(papeis).filter((chave) => !chave.startsWith('_'));

const TIPO = /^resource\s+"([a-z0-9_]+)"/gm;

const tipos = new Set();
for (const arquivo of readdirSync(PASTA).filter((n) => n.endsWith('.tf'))) {
  const conteudo = readFileSync(join(PASTA, arquivo), 'utf8');
  for (const [, tipo] of conteudo.matchAll(TIPO)) tipos.add(tipo);
}

const semPapel = [...tipos].filter(
  (tipo) => !prefixos.some((prefixo) => tipo.startsWith(prefixo)),
);

if (semPapel.length > 0) {
  console.error('Tipo de recurso sem papel declarado para a conta do CI:\n');
  for (const tipo of semPapel.sort()) console.error(`  - ${tipo}`);
  console.error(
    `\nDeclare o papel em ${TABELA} e CONCEDA A MAO antes do merge:\n` +
      '  gcloud projects add-iam-policy-binding plataforma-juridica-36bda \\\n' +
      '    --member=serviceAccount:terraform-ci@plataforma-juridica-36bda.iam.gserviceaccount.com \\\n' +
      '    --role=<papel>\n\n' +
      'Sem isso o `plan` do PR passa verde e o `apply` do deploy falha com 403 —\n' +
      'que e exatamente como as Etapas 7 e 12 descobriram os papeis que faltavam.',
  );
  process.exit(1);
}

/* Papel declarado e nunca usado tambem e ruido: alguem concedeu a mais. */
const semUso = prefixos.filter(
  (prefixo) => ![...tipos].some((tipo) => tipo.startsWith(prefixo)),
);

if (semUso.length > 0) {
  console.warn(
    `Aviso: papel declarado sem recurso correspondente: ${semUso.join(', ')}.`,
  );
}

console.log(
  `✔ ${String(tipos.size)} tipo(s) de recurso, todos com papel declarado para o CI.`,
);
