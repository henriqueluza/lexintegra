#!/usr/bin/env node
/**
 * Toda politica de alerta precisa de uma entrada no roteamento, e vice-versa.
 *
 * POR QUE ISTO E LINT E NAO UMA NOTA NA DOCUMENTACAO.
 *
 * "Quais alertas acordam alguem" e decisao operacional da CONTRATANTE (plano de
 * execucao, "So voce" da Etapa 12), e por isso o roteamento e um ARQUIVO, lido
 * pelo Terraform, e nao um valor dentro de cada politica. O preco dessa escolha
 * e a possibilidade de os dois lados se separarem, e as duas formas de separar
 * falham CALADAS:
 *
 * - politica nova sem entrada no arquivo: `local.canais_por_alerta[...]` estoura
 *   no plan, o que ate e barulhento — mas so no plan, e depois de o PR existir;
 * - entrada no arquivo sem politica: alguem responde "este acorda alguem" para
 *   um alerta que nao existe mais, e fica com a sensacao de ter decidido.
 *
 * O segundo e o que motiva este script: ninguem descobre sozinho.
 */
import { readFileSync } from 'node:fs';

const TERRAFORM = 'infra/terraform/observabilidade.tf';
const ROTEAMENTO = 'infra/terraform/alertas-roteamento.json';

const DESTINOS = ['acordar', 'pendente', 'registrar'];

const terraform = readFileSync(TERRAFORM, 'utf8');
const roteamento = JSON.parse(readFileSync(ROTEAMENTO, 'utf8'));

/** As chaves que as politicas realmente consultam. */
const usadas = new Set(
  [...terraform.matchAll(/canais_por_alerta\["([^"]+)"\]/g)].map(
    ([, chave]) => chave,
  ),
);

/** `_leia-me` e documentacao dentro do proprio arquivo, nao um alerta. */
const declaradas = Object.keys(roteamento).filter(
  (chave) => !chave.startsWith('_'),
);

const problemas = [];

for (const chave of usadas) {
  if (!declaradas.includes(chave)) {
    problemas.push(
      `A politica usa "${chave}", que nao existe em ${ROTEAMENTO}. ` +
        'Acrescente a entrada com o destino desejado.',
    );
  }
}

for (const chave of declaradas) {
  if (!usadas.has(chave)) {
    problemas.push(
      `"${chave}" esta no roteamento e nenhuma politica a consulta. ` +
        'Ou a politica sumiu, ou o nome divergiu — e alguem esta decidindo o ' +
        'destino de um alerta que nao existe.',
    );
  }

  if (!DESTINOS.includes(roteamento[chave])) {
    problemas.push(
      `"${chave}" tem destino "${String(roteamento[chave])}". ` +
        `Use um de: ${DESTINOS.join(', ')}.`,
    );
  }
}

if (problemas.length > 0) {
  console.error('Roteamento de alertas inconsistente:\n');
  for (const problema of problemas) console.error(`  - ${problema}`);
  process.exit(1);
}

const pendentes = declaradas.filter(
  (chave) => roteamento[chave] === 'pendente',
).length;

console.log(
  `✔ ${String(declaradas.length)} alerta(s) roteado(s)` +
    (pendentes > 0
      ? `; ${String(pendentes)} ainda em "pendente" — decisao da CONTRATANTE (Etapa 12).`
      : '.'),
);
