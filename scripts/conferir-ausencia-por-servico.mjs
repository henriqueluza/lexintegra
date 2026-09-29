#!/usr/bin/env node
/**
 * Condicao de AUSENCIA sobre `cloud_run_revision` precisa agrupar por servico.
 *
 * Sem `cross_series_reducer`, cada revisao da API e uma serie. Depois de todo
 * deploy a serie da revisao anterior para de receber pontos, e a politica de
 * ausencia dispara com o sistema saudavel: a sonda ~25 min depois de cada merge,
 * a retencao 23 h depois (falsos positivos de 29/09/2026). O `plan` nao pega, e
 * o alarme falso so aparece em producao.
 */
import { readFileSync } from 'node:fs';

const ARQUIVO = 'infra/terraform/observabilidade.tf';
const texto = readFileSync(ARQUIVO, 'utf8');

const problemas = [];

for (const trecho of texto.split('condition_absent {').slice(1)) {
  // O bloco vai ate o proximo `condition_absent`/recurso; o filtro e a agregacao
  // ficam sempre nas primeiras linhas.
  const bloco = trecho.split(/\n(?:resource|# ---)/)[0];
  const filtro = /filter\s*=\s*"([^\n]*)"/.exec(bloco)?.[1] ?? '';

  if (!filtro.includes('cloud_run_revision')) continue;

  if (
    !bloco.includes('cross_series_reducer') ||
    !bloco.includes('resource.label.service_name')
  ) {
    problemas.push(
      `Ausencia sobre cloud_run_revision sem agrupar por service_name: ${filtro.slice(0, 90)}...`,
    );
  }
  if (
    bloco.includes('revision_name') &&
    /group_by_fields[^\n]*revision_name/.test(bloco)
  ) {
    problemas.push(
      `Ausencia agrupada por revision_name: ${filtro.slice(0, 90)}...`,
    );
  }
}

if (problemas.length > 0) {
  console.error('Condicoes de ausencia por revisao:\n');
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('✔ Condicoes de ausencia sobre revisao agrupam por servico.');
