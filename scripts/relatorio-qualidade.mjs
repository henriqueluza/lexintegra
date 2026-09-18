#!/usr/bin/env node
/**
 * O relatorio de qualidade que a Etapa 12 entrega.
 *
 * O plano de execucao pede "relatorio de qualidade com cobertura, escore de
 * mutacao, complexidade maxima por funcao e ausencia de ciclos entre modulos".
 * Os quatro numeros ja existiam espalhados — no resumo do Jest, no relatorio do
 * Stryker, nas mensagens de erro do ESLint e na saida do dependency-cruiser —, e
 * espalhados eles nao respondem a pergunta que a clausula 4.3 faz: "este sistema
 * esta em que estado?".
 *
 * ELE NAO REPROVA NADA, e isso e deliberado. Quem reprova e o limiar de cada
 * ferramenta, no lugar dela: cobertura no `jest.config.mjs`, mutacao no
 * `stryker.config.mjs`, complexidade no `eslint.config.mjs`. Um segundo lugar
 * decidindo o mesmo criterio produziria as duas piores situacoes possiveis —
 * build vermelha com relatorio verde, ou o contrario.
 *
 * LE O QUE JA FOI GERADO, nao roda as ferramentas. Quem roda e o `pnpm quality`
 * (cobertura) e o `pnpm mutacao`. Assim o relatorio custa milissegundos e pode
 * ser regerado a vontade; o que faltar aparece como "nao medido", que e uma
 * informacao melhor do que um numero velho.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const SAIDA = join(RAIZ, 'docs', 'relatorio-qualidade.md');

const PACOTES = [
  ['apps/api', 'API (NestJS)'],
  ['apps/web', 'Web (Angular)'],
  ['apps/scanner', 'Scanner (ClamAV)'],
  ['packages/shared', 'shared'],
];

function lerJson(caminho) {
  return existsSync(caminho) ? JSON.parse(readFileSync(caminho, 'utf8')) : null;
}

function cobertura() {
  const linhas = [
    '| Pacote | Statements | Branches | Functions | Lines |',
    '|---|---|---|---|---|',
  ];

  for (const [caminho, nome] of PACOTES) {
    const resumo = lerJson(
      join(RAIZ, caminho, 'coverage/coverage-summary.json'),
    );
    if (resumo === null) {
      linhas.push(`| ${nome} | — | — | — | nao medido |`);
      continue;
    }

    const t = resumo.total;
    linhas.push(
      `| ${nome} | ${t.statements.pct}% | ${t.branches.pct}% | ` +
        `${t.functions.pct}% | ${t.lines.pct}% |`,
    );
  }

  return linhas.join('\n');
}

function mutacao() {
  const linhas = [
    '| Alvo | Escore | Mortos | Sobreviventes | Limiar de quebra |',
    '|---|---|---|---|---|',
  ];

  for (const [arquivo, nome, limiar] of [
    ['reports/mutacao-shared.json', 'shared', 96],
    ['reports/mutacao-api.json', 'API', 86],
  ]) {
    const relatorio = lerJson(join(RAIZ, arquivo));
    if (relatorio === null) {
      linhas.push(`| ${nome} | nao medido | — | — | ${limiar} |`);
      continue;
    }

    const mutantes = Object.values(relatorio.files).flatMap((f) => f.mutants);
    const mortos = mutantes.filter((m) =>
      ['Killed', 'Timeout'].includes(m.status),
    ).length;
    const vivos = mutantes.filter((m) => m.status === 'Survived').length;
    const escore = ((mortos / (mortos + vivos)) * 100).toFixed(2);

    linhas.push(`| ${nome} | ${escore}% | ${mortos} | ${vivos} | ${limiar} |`);
  }

  return linhas.join('\n');
}

async function complexidade() {
  const { ESLint } = await import('eslint');

  /*
   * `complexity: ['warn', 0]` faz o ESLint reportar TODA funcao, com o numero
   * dela na mensagem. E o mesmo motor que o `pnpm lint` usa com o limite de 10,
   * entao nao ha risco de o relatorio medir uma coisa e a build outra.
   */
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfig: { rules: { complexity: ['warn', 0] } },
  });

  const resultados = await eslint.lintFiles([
    'apps/**/*.ts',
    'packages/**/*.ts',
  ]);
  const funcoes = [];

  for (const resultado of resultados) {
    for (const aviso of resultado.messages) {
      if (aviso.ruleId !== 'complexity') continue;
      const numero = /complexity of (\d+)/.exec(aviso.message);
      if (numero === null) continue;

      funcoes.push({
        arquivo: resultado.filePath.replace(`${RAIZ}/`, ''),
        linha: aviso.line,
        valor: Number(numero[1]),
        nome: /^[^']*'([^']+)'/.exec(aviso.message)?.[1] ?? 'anonima',
      });
    }
  }

  funcoes.sort((a, b) => b.valor - a.valor);

  const linhas = [
    `Funcoes analisadas: **${String(funcoes.length)}**. Limite do lint: **10**.`,
    '',
    '| Complexidade | Funcao | Arquivo |',
    '|---|---|---|',
  ];

  for (const f of funcoes.slice(0, 10)) {
    linhas.push(
      `| ${String(f.valor)} | \`${f.nome}\` | ${f.arquivo}:${String(f.linha)} |`,
    );
  }

  return linhas.join('\n');
}

function dependencias() {
  const saida = execFileSync(
    'pnpm',
    [
      'exec',
      'depcruise',
      'apps',
      'packages',
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'json',
    ],
    { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  const grafo = JSON.parse(saida);
  const ciclos = grafo.summary.violations.filter(
    (v) => v.rule.name === 'sem-ciclos',
  ).length;

  return [
    `- Modulos no grafo: **${String(grafo.summary.totalCruised)}**`,
    `- Dependencias: **${String(grafo.summary.totalDependenciesCruised)}**`,
    `- Ciclos: **${String(ciclos)}**`,
    `- Violacoes de fronteira: **${String(grafo.summary.error)}** erro(s), ` +
      `${String(grafo.summary.warn)} aviso(s)`,
  ].join('\n');
}

const conteudo = `# Relatorio de qualidade

Gerado por \`pnpm relatorio:qualidade\` em ${new Date().toISOString().slice(0, 10)}.

Este relatorio LE o que as ferramentas ja produziram; ele nao reprova nada. Quem
reprova e o limiar de cada uma, no lugar dela — cobertura no \`jest.config.mjs\`,
mutacao no \`stryker.config.mjs\`, complexidade e fronteiras no \`pnpm lint\`.

## Cobertura

${cobertura()}

Rode \`pnpm test:coverage\` para atualizar.

## Analise de mutacao

Alvos definidos pela arquitetura, secao 10: transicao de status do entregavel,
regras de autorizacao e assinatura do webhook. O calculo de saldo e intervalo de
reunioes entra quando a Etapa 10 existir.

${mutacao()}

Rode \`pnpm mutacao\` para atualizar.

## Complexidade ciclomatica

${await complexidade()}

## Dependencias

${dependencias()}
`;

mkdirSync(dirname(SAIDA), { recursive: true });
writeFileSync(SAIDA, conteudo);
console.log(`✔ Relatorio escrito em ${SAIDA.replace(`${RAIZ}/`, '')}`);
