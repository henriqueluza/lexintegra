#!/usr/bin/env node
/**
 * A documentacao de entrega (Etapa 13) acompanha o codigo, e nao a memoria.
 *
 * POR QUE ISTO E LINT E NAO UMA NOTA NA DOCUMENTACAO.
 *
 * `docs/entrega/` e `docs/runbooks/` foram escritos para quem assume o sistema
 * sem acesso a quem o construiu. O que os envelhece nao e reescrita, e
 * acrescimo: uma variavel de ambiente nova, uma politica de alerta nova, um
 * secret novo — cada um entra num PR de codigo, e ninguem lembra de abrir o
 * documento. As quatro conferencias abaixo sao as quatro formas de o documento
 * mentir por omissao sem nada falhar:
 *
 * 1. variavel lida pela API e ausente de `operacao.md` — a pessoa de plantao
 *    le "recusando subir: FOO e obrigatoria" e nao acha FOO em lugar nenhum;
 * 2. politica de alerta sem runbook — o incidente chega e o campo de
 *    documentacao nao diz o que fazer;
 * 3. secret de `secrets.tf` ausente de `credenciais.md` — a rotacao da entrega
 *    esquece uma credencial;
 * 4. link relativo quebrado — o documento aponta para um arquivo que mudou de
 *    nome.
 *
 * Nao le valor de nada: so nomes, e so dos arquivos do repositorio.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const API = 'apps/api/src';
const OPERACAO = 'docs/entrega/operacao.md';
const CREDENCIAIS = 'docs/entrega/credenciais.md';
const OBSERVABILIDADE = 'infra/terraform/observabilidade.tf';
const SECRETS = 'infra/terraform/secrets.tf';
const PASTAS_DE_DOCS = ['docs/entrega', 'docs/runbooks'];

/** Todo `.ts` de producao: sem teste, sem arnes de teste. */
function arquivosDeProducao(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeProducao(caminho);
    const producao =
      caminho.endsWith('.ts') &&
      !/\.(spec|integration-spec)\.ts$/.test(caminho) &&
      !nome.startsWith('arnes-');
    return producao ? [caminho] : [];
  });
}

/**
 * As formas pelas quais a API le o ambiente. As duas ultimas sao indiretas: o
 * nome da fila chega por `variavelDaFila` (`tarefas/criar-fila.ts`), e o do
 * relogio por uma constante (`relogio.ts`). Uma forma nova de ler ambiente
 * precisa entrar aqui, senao a variavel passa despercebida.
 */
const LEITURAS = [
  /(?:process\.env|ambiente)\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
  /process\.env\.([A-Z][A-Z0-9_]+)/g,
  /variavelDaFila:\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  /const VARIAVEL = ['"]([A-Z][A-Z0-9_]+)['"]/g,
];

function variaveisLidasPelaApi() {
  const nomes = new Set();
  for (const arquivo of arquivosDeProducao(API)) {
    const texto = readFileSync(arquivo, 'utf8');
    for (const padrao of LEITURAS) {
      for (const [, nome] of texto.matchAll(padrao)) nomes.add(nome);
    }
  }
  return nomes;
}

function mencionado(documento, nome) {
  return new RegExp(`\\b${nome}\\b`).test(documento);
}

function conferirVariaveis(problemas) {
  const operacao = readFileSync(OPERACAO, 'utf8');
  const variaveis = variaveisLidasPelaApi();
  for (const nome of variaveis) {
    if (!mencionado(operacao, nome)) {
      problemas.push(
        `A API le ${nome}, que nao aparece em ${OPERACAO}. Acrescente a linha ` +
          'na tabela de variaveis (obrigatoriedade, valor em producao, efeito ' +
          'se faltar, onde e lida).',
      );
    }
  }
  return variaveis.size;
}

/** Cada politica, com o texto do seu bloco `documentation`. */
function politicasDeAlerta() {
  const texto = readFileSync(OBSERVABILIDADE, 'utf8');
  const inicios = [
    ...texto.matchAll(/resource "google_monitoring_alert_policy" "([^"]+)"/g),
  ];
  return inicios.map((inicio, i) => {
    const fim = inicios[i + 1]?.index ?? texto.length;
    return { nome: inicio[1], corpo: texto.slice(inicio.index, fim) };
  });
}

function conferirRunbooks(problemas) {
  const politicas = politicasDeAlerta();
  for (const { nome, corpo } of politicas) {
    const citado = /Runbook:\s*(docs\/runbooks\/[\w.-]+\.md)/.exec(corpo)?.[1];
    if (citado === undefined) {
      problemas.push(
        `A politica "${nome}" (${OBSERVABILIDADE}) nao cita runbook. Acrescente ` +
          '"Runbook: docs/runbooks/<arquivo>.md" ao fim do `documentation`.',
      );
    } else if (!existsSync(citado)) {
      problemas.push(`A politica "${nome}" cita ${citado}, que nao existe.`);
    }
  }
  return politicas.length;
}

function conferirSecrets(problemas) {
  const credenciais = readFileSync(CREDENCIAIS, 'utf8');
  const secrets = [
    ...readFileSync(SECRETS, 'utf8').matchAll(/secret_id\s*=\s*"([^"]+)"/g),
  ].map(([, id]) => id);
  for (const id of secrets) {
    if (!credenciais.includes(id)) {
      problemas.push(
        `O secret "${id}" (${SECRETS}) nao aparece em ${CREDENCIAIS}. ` +
          'Acrescente-o ao inventario, com quem o usa e como troca-lo.',
      );
    }
  }
  return secrets.length;
}

/**
 * Links relativos de Markdown: `[texto](alvo)`. Endereco externo, ancora na
 * propria pagina e `mailto:` ficam de fora; a ancora de um arquivo e ignorada,
 * porque o que envelhece e o nome do arquivo.
 */
function linksRelativos(texto) {
  return [...texto.matchAll(/\]\(([^)\s]+)\)/g)]
    .map(([, alvo]) => alvo)
    .filter((alvo) => !/^(?:[a-z]+:|#)/i.test(alvo))
    .map((alvo) => decodeURI(alvo.split('#')[0]));
}

function conferirLinks(problemas) {
  let total = 0;
  for (const pasta of PASTAS_DE_DOCS) {
    for (const nome of readdirSync(pasta).filter((n) => n.endsWith('.md'))) {
      const arquivo = join(pasta, nome);
      for (const alvo of linksRelativos(readFileSync(arquivo, 'utf8'))) {
        total += 1;
        if (!existsSync(resolve(dirname(arquivo), alvo))) {
          problemas.push(`${arquivo} aponta para "${alvo}", que nao existe.`);
        }
      }
    }
  }
  return total;
}

const problemas = [];
const variaveis = conferirVariaveis(problemas);
const politicas = conferirRunbooks(problemas);
const secrets = conferirSecrets(problemas);
const links = conferirLinks(problemas);

if (problemas.length > 0) {
  console.error('Documentacao de entrega desatualizada:\n');
  for (const problema of problemas) console.error(`  - ${problema}`);
  process.exit(1);
}

console.log(
  `✔ Documentacao de entrega: ${String(variaveis)} variavel(is) da API, ` +
    `${String(politicas)} politica(s) com runbook, ${String(secrets)} secret(s) ` +
    `inventariado(s), ${String(links)} link(s) relativo(s) validos.`,
);
