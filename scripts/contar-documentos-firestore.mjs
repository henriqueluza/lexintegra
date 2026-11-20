#!/usr/bin/env node
/**
 * Conta os documentos de cada colecao de um banco do Firestore, para conferir uma
 * RESTAURACAO de backup contra o banco de origem (lote de novembro de 2026,
 * ADR-23; roteiro em `docs/runbooks/restaurar-backup.md`).
 *
 * SO LE, E SO CONTA. As duas chamadas que ele faz sao `listCollectionIds` (os
 * nomes das colecoes raiz) e `runAggregationQuery` com `count` — nenhuma devolve
 * o conteudo de um documento, e nenhuma escreve. Nao ha caminho deste script ate
 * um dado de titular: o que sai na tela sao nomes de colecao e numeros.
 *
 * EXECUCAO HUMANA. Ele fala com o projeto de VERDADE, com a credencial de quem
 * roda (`gcloud auth print-access-token`), e por isso nao e executado por agente
 * nem pelo CI. O token fica em memoria e nao e impresso.
 *
 * Uso:
 *   node scripts/contar-documentos-firestore.mjs <projeto> [banco]
 *   node scripts/contar-documentos-firestore.mjs <projeto> --comparar <banco> <outro>
 *
 * `banco` e `(default)` quando omitido. Com `--comparar`, conta os dois e sai
 * com codigo 1 se alguma colecao tiver contagem diferente.
 *
 * AS SUBCOLECOES sao contadas por GRUPO (todas as `entregaveis` de todos os
 * pedidos, e assim por diante). A lista abaixo e a da arquitetura, secao 5.1;
 * subcolecao nova precisa entrar aqui.
 */
import { execFileSync } from 'node:child_process';

const SUBCOLECOES = [
  'anamnese',
  'entregaveis',
  'transicoes',
  'reunioes',
  'observacoes',
  'anexos',
];

const API = 'https://firestore.googleapis.com/v1';

/* Ids como o Google os aceita; qualquer outra coisa nao entra numa URL. */
const PROJETO_VALIDO = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const BANCO_VALIDO = /^(\(default\)|[a-z][a-z0-9-]{2,61}[a-z0-9])$/u;

function abortar(mensagem) {
  console.error(`\n  ${mensagem}\n`);
  process.exit(2);
}

function lerArgumentos(argumentos) {
  const [projeto, ...resto] = argumentos;
  if (projeto === undefined || !PROJETO_VALIDO.test(projeto)) {
    abortar(
      'Uso: node scripts/contar-documentos-firestore.mjs <projeto> [banco]\n' +
        '       node scripts/contar-documentos-firestore.mjs <projeto> --comparar <banco> <outro>',
    );
  }

  const bancos =
    resto[0] === '--comparar' ? resto.slice(1) : [resto[0] ?? '(default)'];
  const esperados = resto[0] === '--comparar' ? 2 : 1;
  if (
    bancos.length !== esperados ||
    bancos.some((banco) => banco === undefined || !BANCO_VALIDO.test(banco))
  ) {
    abortar('Banco invalido. Use `(default)` ou o id do banco restaurado.');
  }
  return { projeto, bancos };
}

function tokenDeAcesso() {
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return abortar(
      'Nao foi possivel obter o token. Rode `gcloud auth login` e tente de novo.',
    );
  }
}

async function chamar(url, token, corpo) {
  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    /* O corpo do erro do Google nao traz o token; o status basta para o roteiro. */
    throw new Error(
      `HTTP ${String(resposta.status)} em ${new URL(url).pathname}`,
    );
  }
  return resposta.json();
}

async function colecoesRaiz(base, token) {
  const ids = [];
  let pageToken;
  do {
    const pagina = await chamar(`${base}/documents:listCollectionIds`, token, {
      pageSize: 300,
      ...(pageToken === undefined ? {} : { pageToken }),
    });
    ids.push(...(pagina.collectionIds ?? []));
    pageToken = pagina.nextPageToken;
  } while (pageToken !== undefined && pageToken !== '');
  return ids.sort();
}

async function contar(base, token, colecao, todosOsDescendentes) {
  const linhas = await chamar(`${base}/documents:runAggregationQuery`, token, {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId: colecao, allDescendants: todosOsDescendentes }],
      },
      aggregations: [{ alias: 'total', count: {} }],
    },
  });
  const valor = linhas?.[0]?.result?.aggregateFields?.total?.integerValue;
  const total = Number(valor);
  if (!Number.isInteger(total)) {
    throw new Error(`contagem ilegivel para ${colecao}`);
  }
  return total;
}

async function contarBanco(projeto, banco, token) {
  const base = `${API}/projects/${projeto}/databases/${banco}`;
  const contagens = new Map();

  for (const colecao of await colecoesRaiz(base, token)) {
    contagens.set(colecao, await contar(base, token, colecao, false));
  }
  for (const subcolecao of SUBCOLECOES) {
    contagens.set(
      `*/${subcolecao}`,
      await contar(base, token, subcolecao, true),
    );
  }
  return contagens;
}

function imprimir(titulos, tabelas) {
  const nomes = [...new Set(tabelas.flatMap((tabela) => [...tabela.keys()]))];
  const largura = Math.max(...nomes.map((nome) => nome.length), 8);
  let diferencas = 0;

  console.log('');
  console.log(
    `  ${'colecao'.padEnd(largura)}  ${titulos.map((t) => t.padStart(18)).join('  ')}`,
  );
  for (const nome of nomes) {
    const valores = tabelas.map((tabela) => tabela.get(nome));
    const difere = new Set(valores).size > 1;
    if (difere) diferencas += 1;
    console.log(
      `  ${nome.padEnd(largura)}  ${valores
        .map((valor) => String(valor ?? '(ausente)').padStart(18))
        .join('  ')}${difere ? '   <-- difere' : ''}`,
    );
  }
  console.log('');
  return diferencas;
}

const { projeto, bancos } = lerArgumentos(process.argv.slice(2));
const token = tokenDeAcesso();

const inicio = Date.now();
const tabelas = [];
for (const banco of bancos) {
  tabelas.push(await contarBanco(projeto, banco, token));
}

const diferencas = imprimir(bancos, tabelas);
console.log(
  `  ${String(tabelas[0].size)} colecao(oes) contada(s) em ${String(Math.round((Date.now() - inicio) / 1000))} s.`,
);

if (bancos.length === 2) {
  if (diferencas === 0) {
    console.log('  As contagens dos dois bancos sao iguais.\n');
  } else {
    console.error(
      `  ${String(diferencas)} colecao(oes) com contagem diferente. Um banco restaurado de um backup\n` +
        '  antigo tem MENOS documentos que o de origem no que foi escrito depois do backup:\n' +
        '  confira se a diferenca e so essa.\n',
    );
    process.exit(1);
  }
}
