#!/usr/bin/env node
/**
 * Confere, no HTML PRÉ-RENDERIZADO da home, os quatro itens que a análise do
 * AbacatePay exige no rodapé (05/10/2026): o nome LexIntegra, o CNPJ, o e-mail
 * de contato e os links para os termos de uso e a política de privacidade.
 *
 * O analista do gateway lê o HTML servido, não a página depois do JavaScript.
 * Um rodapé que só aparecesse depois da hidratação passaria em todo teste de
 * navegador e reprovaria a análise. Por isso a conferência é sobre o arquivo do
 * build, e roda no CI logo depois dele.
 *
 * Os valores esperados vêm de `packages/shared/src/contato-publico.ts`, lidos
 * como texto: um literal repetido aqui envelheceria na primeira troca.
 *
 * Uso: node scripts/conferir-rodape-prerenderizado.mjs [caminho/do/index.html]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const arquivo =
  process.argv[2] ?? join(raiz, 'apps/web/dist/web/browser/index.html');
const fonte = readFileSync(
  join(raiz, 'packages/shared/src/contato-publico.ts'),
  'utf8',
);

function campo(nome) {
  const achado = new RegExp(`${nome}: '([^']+)'`, 'u').exec(fonte);
  if (achado === null)
    throw new Error(`contato-publico.ts sem o campo ${nome}`);
  return achado[1];
}

const html = readFileSync(arquivo, 'utf8');
const inicio = html.indexOf('<app-rodape-publico');
const fim = html.indexOf('</app-rodape-publico>');
if (inicio < 0 || fim < 0) {
  console.error(`${arquivo}: o rodape publico nao foi pre-renderizado.`);
  process.exit(1);
}
const rodape = html.slice(inicio, fim);
const email = campo('email');
const exigidos = [
  ['nome', 'LexIntegra'],
  ['CNPJ', campo('cnpj')],
  ['e-mail de contato', `href="mailto:${email}"`],
  ['link dos termos de uso', 'href="/termos"'],
  ['link da politica de privacidade', 'href="/privacidade"'],
];
const faltando = exigidos.filter(([, trecho]) => !rodape.includes(trecho));
if (faltando.length > 0) {
  for (const [nome] of faltando)
    console.error(`Rodape pre-renderizado sem: ${nome}`);
  process.exit(1);
}
if (rodape.includes('href="tel:')) {
  console.error(
    'Rodape pre-renderizado com telefone: o e-mail e o unico contato.',
  );
  process.exit(1);
}
console.log(
  'Rodape pre-renderizado com nome, CNPJ, e-mail, termos e privacidade.',
);
