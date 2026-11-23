#!/usr/bin/env node
/**
 * Monta a tabela de tempos da verificacao de seguranca dos arquivos (lote de
 * novembro de 2026, ajuste 13; roteiro em `docs/runbooks/medir-varredura.md`).
 *
 * SO LE. A unica chamada e `gcloud logging read`, com a credencial de quem roda,
 * pedindo as linhas `arquivo.varrido` (uma por arquivo que recebeu veredito, com
 * a duracao de cada fase) e `scanner.pronto` (uma por instancia do scanner que
 * subiu). Nenhuma das duas carrega nome de arquivo, caminho de objeto nem
 * conteudo: o que sai na tela sao duracoes e contagens.
 *
 * Uso:
 *   node scripts/medir-varredura.mjs <projeto> [dias]
 *
 * `dias` e a janela de leitura, de 1 a 30; 7 quando omitido.
 *
 * A saida e Markdown, para colar no PR: as contagens, a tabela de p50 e p95 por
 * fase (a frio, a quente e todas) e o tempo de subida do scanner.
 */
import { execFileSync } from 'node:child_process';
import './fonte-ts.mjs';

/* Ids como o Google os aceita; qualquer outra coisa nao vira argumento. */
const PROJETO_VALIDO = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const LIMITE_DE_LINHAS = 5000;

function abortar(mensagem) {
  console.error(`\n  ${mensagem}\n`);
  process.exit(1);
}

function lerArgumentos() {
  const [projeto, dias = '7'] = process.argv.slice(2);

  if (projeto === undefined || !PROJETO_VALIDO.test(projeto)) {
    abortar('Uso: node scripts/medir-varredura.mjs <projeto> [dias]');
  }
  if (!/^\d{1,2}$/u.test(dias) || Number(dias) < 1 || Number(dias) > 30) {
    abortar('`dias` precisa ser um inteiro de 1 a 30.');
  }

  return { projeto, dias: Number(dias) };
}

/**
 * `execFileSync` com lista de argumentos, e nao linha de comando: nada do que
 * veio de `process.argv` passa por um shell.
 */
function lerLinhas(projeto, dias, sinal) {
  const saida = execFileSync(
    'gcloud',
    [
      'logging',
      'read',
      `resource.type="cloud_run_revision" AND jsonPayload.sinal="${sinal}"`,
      `--project=${projeto}`,
      `--freshness=${String(dias)}d`,
      `--limit=${String(LIMITE_DE_LINHAS)}`,
      '--format=json',
    ],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );

  const linhas = JSON.parse(saida);
  if (!Array.isArray(linhas)) abortar('Resposta inesperada do gcloud.');
  return linhas;
}

function linhaDeContagem(rotulo, contagem) {
  const partes = Object.entries(contagem)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, quantidade]) => `${chave}: ${String(quantidade)}`);
  return `- ${rotulo}: ${partes.length === 0 ? 'nenhum' : partes.join(', ')}`;
}

/** O boot do scanner: uma amostra por instancia que subiu na janela. */
function tabelaDoBoot(linhas, percentil, formatarDuracao) {
  const fases = [
    ['baixarBaseMs', 'Baixar a base de assinaturas'],
    ['clamdMs', 'Subir o clamd (até o socket abrir)'],
    ['bootMs', 'Boot inteiro (script de entrada até o servidor ouvir)'],
  ];

  const corpo = fases.map(([campo, rotulo]) => {
    const valores = linhas
      .map((linha) => linha?.jsonPayload?.[campo])
      .filter((valor) => typeof valor === 'number' && Number.isFinite(valor));
    return `| ${rotulo} | ${formatarDuracao(percentil(valores, 50))} | ${formatarDuracao(percentil(valores, 95))} | ${String(valores.length)} |`;
  });

  return [
    '| Fase do boot | p50 | p95 | n |',
    '|---|---|---|---|',
    ...corpo,
  ].join('\n');
}

const { projeto, dias } = lerArgumentos();
const {
  amostrasDe,
  contagensDe,
  formatarDuracao,
  formatarTabela,
  percentil,
  tabelaDeFases,
} = await import('./medir-varredura/tabela.ts');

const amostras = amostrasDe(lerLinhas(projeto, dias, 'arquivo.varrido'));
const boots = lerLinhas(projeto, dias, 'scanner.pronto');
const contagens = contagensDe(amostras);

console.log(`## Tempos da varredura, últimos ${String(dias)} dia(s)\n`);
console.log(
  `- Arquivos varridos: ${String(contagens.total)} (${String(contagens.frias)} a frio, ${String(contagens.quentes)} a quente)`,
);
console.log(
  `- Só passaram depois de reentrega da fila: ${String(contagens.reentregues)}`,
);
console.log(linhaDeContagem('Por fluxo', contagens.porFluxo));
console.log(linhaDeContagem('Por veredito', contagens.porVeredito));

if (contagens.total === LIMITE_DE_LINHAS) {
  console.log(
    `- ATENÇÃO: a leitura bateu no limite de ${String(LIMITE_DE_LINHAS)} linhas; use uma janela menor.`,
  );
}

console.log(`\n${formatarTabela(tabelaDeFases(amostras))}\n`);
console.log(`### Subida do scanner (${String(boots.length)} instância(s))\n`);
console.log(`${tabelaDoBoot(boots, percentil, formatarDuracao)}\n`);
