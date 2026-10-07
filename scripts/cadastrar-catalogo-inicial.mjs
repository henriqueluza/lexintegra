#!/usr/bin/env node
/**
 * Cadastra o catalogo inicial do escritorio (`scripts/catalogo-inicial/`).
 *
 * PELA API, E NAO PELO FIRESTORE. O script faz o que a tela "Cadastrar produto"
 * faz: `POST /api/admin/produtos` com o token de um administrador. Assim passam
 * no caminho o `ZodPipe` com `esquemaNovoProduto`, os guards (`@Perfis('admin')`)
 * e o `ProdutosService`, que carimba `criadoPor` com o uid de quem rodou. Nada
 * aqui conhece a forma do documento em `produtos`.
 *
 * IDEMPOTENTE PELO NOME. O modelo nao tem slug, e o id do documento e aleatorio.
 * Antes de gravar, o script lista o catalogo e PULA todo produto cujo nome ja
 * existe — nao atualiza: depois do primeiro cadastro, a verdade e o painel, e
 * uma edicao feita la nao pode ser desfeita por uma segunda execucao.
 *
 * Uso:
 *   node scripts/cadastrar-catalogo-inicial.mjs --dry-run
 *       valida os seis produtos e imprime o que seria enviado; nao abre rede
 *   node scripts/cadastrar-catalogo-inicial.mjs
 *       contra o `pnpm dev` (API em 127.0.0.1:8080, emulador de Auth), entrando
 *       como o admin da semente; recusa endereco que nao seja loopback
 *   node scripts/cadastrar-catalogo-inicial.mjs --prod
 *       contra lexintegra.com.br. Pede e-mail e senha de um administrador no
 *       terminal (a senha nao aparece nem e guardada), mostra o plano e so grava
 *       depois de voce digitar o dominio
 */

import { createInterface } from 'node:readline/promises';
import './fonte-ts.mjs';
import { esquemaNovoProduto } from '../packages/shared/src/esquemas/produto.ts';
import { paraCorpo } from './catalogo-inicial/expandir.ts';
import { CATALOGO_INICIAL } from './catalogo-inicial/produtos.data.ts';

const DOMINIO_PRODUCAO = 'lexintegra.com.br';

/* As mesmas de `scripts/semear-emulador.mjs`: so existem no emulador. */
const ADMIN_DA_SEMENTE = 'admin@exemplo.test';
const SENHA_DA_SEMENTE = 'senha-de-desenvolvimento';

const argumentos = new Set(process.argv.slice(2));
const conhecidos = new Set(['--dry-run', '--prod']);
for (const argumento of argumentos) {
  if (!conhecidos.has(argumento))
    abortar(`Argumento desconhecido: ${argumento}`);
}
const ENSAIO = argumentos.has('--dry-run');
const PRODUCAO = argumentos.has('--prod');

function abortar(mensagem) {
  console.error(`\n  ${mensagem}\n`);
  process.exit(1);
}

function reais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Valida os seis ANTES de qualquer rede, com o mesmo schema da API. Um produto
 * invalido derruba a execucao inteira: cadastrar cinco e falhar no sexto
 * deixaria o catalogo pela metade.
 */
function prepararProdutos() {
  const slugs = new Set();
  const nomes = new Set();
  const produtos = [];

  for (const inicial of CATALOGO_INICIAL) {
    const resultado = esquemaNovoProduto.safeParse(paraCorpo(inicial));
    if (!resultado.success) {
      const problemas = resultado.error.issues
        .map((p) => `    ${p.path.join('.') || '(raiz)'}: ${p.message}`)
        .join('\n');
      abortar(`${inicial.slug} nao passa no esquemaNovoProduto:\n${problemas}`);
    }
    if (slugs.has(inicial.slug)) abortar(`slug repetido: ${inicial.slug}`);
    if (nomes.has(resultado.data.nome)) {
      abortar(`nome repetido: ${resultado.data.nome}`);
    }
    slugs.add(inicial.slug);
    nomes.add(resultado.data.nome);
    produtos.push({ slug: inicial.slug, corpo: resultado.data });
  }
  return produtos;
}

function imprimirResumo(produtos) {
  console.log('');
  for (const { slug, corpo } of produtos) {
    console.log(`  ${slug}`);
    console.log(`    ${corpo.nome} — ${reais(corpo.precoCentavos)}`);
    console.log(
      `    reunioes ${corpo.quantidadeReunioes} | prazo ${corpo.prazoValidadeReunioesDias} dias | intervalo ${corpo.intervaloMinimoReunioesDias} dias | revisoes ${corpo.numeroRevisoesPermitidas}`,
    );
    console.log(
      `    ${corpo.entregaveis.length} entregaveis, ${corpo.textosOrientativos.length} textos orientativos`,
    );
  }
  const total = produtos.reduce((s, p) => s + p.corpo.entregaveis.length, 0);
  console.log(
    `\n  ${produtos.length} produtos, ${total} entregaveis no total.\n`,
  );
}

function imprimirDetalhes(produtos) {
  for (const { slug, corpo } of produtos) {
    console.log(`  --- ${slug} ---`);
    console.log(JSON.stringify(corpo, null, 2).replace(/^/gm, '  '));
  }
}

async function perguntar(pergunta, { oculta = false } = {}) {
  const leitor = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  if (oculta) {
    /* Escreve so a pergunta; o que se digita nao aparece no terminal. */
    leitor._writeToOutput = (texto) => {
      if (texto.includes(pergunta)) process.stdout.write(pergunta);
    };
  }
  const resposta = await leitor.question(pergunta);
  leitor.close();
  if (oculta) process.stdout.write('\n');
  return resposta.trim();
}

async function entrar(urlDoLogin, email, senha) {
  const resposta = await fetch(urlDoLogin, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || typeof corpo.idToken !== 'string') {
    abortar(
      `Nao foi possivel entrar como ${email}: ${corpo.error?.message ?? resposta.status}`,
    );
  }
  return corpo.idToken;
}

/** Desenvolvimento: so loopback, e o Auth precisa responder como emulador. */
async function alvoDeDesenvolvimento() {
  const hostAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
  const api = process.env.CATALOGO_API_URL ?? 'http://127.0.0.1:8080/api';

  const loopback = ['127.0.0.1', 'localhost', '[::1]'];
  for (const url of [`http://${hostAuth}`, api]) {
    if (!loopback.includes(new URL(url).hostname)) {
      abortar(`${url} nao e loopback. Para producao, use --prod.`);
    }
  }

  const emulador = await fetch(`http://${hostAuth}/`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (emulador.authEmulator === undefined) {
    abortar(
      `${hostAuth} nao respondeu como emulador de Auth. Suba o \`pnpm dev\` (e rode \`pnpm semear\` para o admin existir).`,
    );
  }

  const token = await entrar(
    `http://${hostAuth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulador`,
    ADMIN_DA_SEMENTE,
    SENHA_DA_SEMENTE,
  );
  return { api, token, rotulo: `desenvolvimento (${api})` };
}

/**
 * Producao: a chave publica do Firebase vem do proprio Hosting, como no
 * navegador, e as credenciais sao digitadas por quem roda. Nada e lido de
 * arquivo nem de variavel de ambiente.
 */
async function alvoDeProducao() {
  const api = `https://${DOMINIO_PRODUCAO}/api`;
  const configuracao = await fetch(
    `https://${DOMINIO_PRODUCAO}/__/firebase/init.json`,
  )
    .then((r) => r.json())
    .catch(() => ({}));
  if (typeof configuracao.apiKey !== 'string') {
    abortar('Nao foi possivel ler a configuracao publica do Firebase.');
  }

  const email = await perguntar('  E-mail do administrador: ');
  const senha = await perguntar('  Senha: ', { oculta: true });
  const token = await entrar(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${configuracao.apiKey}`,
    email,
    senha,
  );
  return { api, token, rotulo: `PRODUCAO (${api})` };
}

async function chamarApi(alvo, metodo, caminho, corpo) {
  const resposta = await fetch(`${alvo.api}${caminho}`, {
    method: metodo,
    headers: {
      authorization: `Bearer ${alvo.token}`,
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    abortar(
      `${metodo} ${caminho} respondeu ${resposta.status}: ${JSON.stringify(dados)}`,
    );
  }
  return dados;
}

const produtos = prepararProdutos();
imprimirResumo(produtos);

if (ENSAIO) {
  imprimirDetalhes(produtos);
  console.log('\n  --dry-run: nada foi enviado.\n');
  process.exit(0);
}

const alvo = PRODUCAO ? await alvoDeProducao() : await alvoDeDesenvolvimento();

const existentes = new Set(
  (await chamarApi(alvo, 'GET', '/admin/produtos?situacao=todos')).map(
    (produto) => produto.nome,
  ),
);
const plano = produtos.map((produto) => ({
  ...produto,
  acao: existentes.has(produto.corpo.nome) ? 'pular' : 'criar',
}));

console.log(`  Alvo: ${alvo.rotulo}`);
for (const { slug, acao } of plano) {
  console.log(
    `    ${acao === 'criar' ? 'criar' : 'pular (ja existe)'}  ${slug}`,
  );
}

const aCriar = plano.filter((item) => item.acao === 'criar');
if (aCriar.length === 0) {
  console.log('\n  Nada a criar.\n');
  process.exit(0);
}

if (PRODUCAO) {
  const confirmacao = await perguntar(
    `\n  Criar ${aCriar.length} produto(s) em PRODUCAO, ativos na vitrine. Digite ${DOMINIO_PRODUCAO} para confirmar: `,
  );
  if (confirmacao !== DOMINIO_PRODUCAO) abortar('Cancelado. Nada foi gravado.');
}

console.log('');
for (const { slug, corpo } of aCriar) {
  const criado = await chamarApi(alvo, 'POST', '/admin/produtos', corpo);
  console.log(`  criado  ${slug}  ->  produtos/${criado.id}`);
}
console.log('');
