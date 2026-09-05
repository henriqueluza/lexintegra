#!/usr/bin/env node
/**
 * Semeia o emulador de Auth com um usuario de cada perfil, para desenvolvimento
 * local e para a demonstracao da Etapa 4.
 *
 * POR QUE ESTE SCRIPT PODE ESCREVER CUSTOM CLAIM E OS DE `scripts/manual-only/`
 * NAO PODEM SER TOCADOS
 *
 * Ele nao fala com o Firebase. Ele fala com o EMULADOR, pela API de
 * administracao que so o emulador expoe — `Authorization: Bearer owner` e um
 * atalho que existe unicamente ali e que o Identity Toolkit de verdade recusa.
 * Nao ha `firebase-admin` importado aqui, nao ha credencial resolvida, nao ha
 * caminho de codigo que alcance um projeto real. Mesmo apontado a mao para
 * producao, o pedido seria negado.
 *
 * Somado a isso, tres guardas explicitas abaixo: exige a variavel de ambiente do
 * emulador, exige um projeto com prefixo `demo-` e confirma que o host responde
 * como emulador antes de escrever qualquer coisa.
 *
 * Elevacao de privilegio em PRODUCAO continua sendo operacao manual, por script
 * auditavel, fora de qualquer sessao de agente (item 2.4.2 e CLAUDE.md).
 *
 * Uso:
 *   scripts/emuladores.sh 'node scripts/semear-emulador.mjs'
 */

const HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJETO = process.env.GCLOUD_PROJECT ?? 'demo-lexintegra';

const SENHA = 'senha-de-desenvolvimento';
const CONTAS = [
  { email: 'cliente@exemplo.test', nome: 'Clara Nunes', perfil: 'cliente' },
  { email: 'advogado@exemplo.test', nome: 'Ana Souza', perfil: 'advogado' },
  { email: 'admin@exemplo.test', nome: 'Marcos Braga', perfil: 'admin' },
];

function abortar(mensagem) {
  console.error(`\n  ${mensagem}\n`);
  process.exit(1);
}

if (HOST === undefined || HOST === '') {
  abortar(
    'FIREBASE_AUTH_EMULATOR_HOST nao esta definido. Rode por ' +
      "scripts/emuladores.sh 'node scripts/semear-emulador.mjs'.",
  );
}

if (!PROJETO.startsWith('demo-')) {
  abortar(
    `Projeto "${PROJETO}" nao tem o prefixo demo-. Este script so semeia ` +
      'emulador; recusando.',
  );
}

const base = `http://${HOST}/identitytoolkit.googleapis.com/v1`;

async function chamar(caminho, corpo) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Credencial de administrador do EMULADOR. O servico real nao a aceita.
      authorization: 'Bearer owner',
    },
    body: JSON.stringify(corpo),
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(
      `${caminho} respondeu ${resposta.status}: ${JSON.stringify(dados)}`,
    );
  }
  return dados;
}

async function confirmarEmulador() {
  const resposta = await fetch(`http://${HOST}/`);
  const corpo = await resposta.json().catch(() => ({}));
  if (corpo.authEmulator === undefined) {
    abortar(
      `${HOST} nao respondeu como emulador de Auth. Recusando escrever claim.`,
    );
  }
}

async function semear({ email, nome, perfil }) {
  let localId;

  try {
    const criado = await chamar('/accounts:signUp', {
      email,
      password: SENHA,
      displayName: nome,
      returnSecureToken: false,
    });
    localId = criado.localId;
  } catch (erro) {
    if (!String(erro.message).includes('EMAIL_EXISTS')) throw erro;
    // Semear duas vezes e normal: o emulador guarda estado enquanto esta no ar.
    const busca = await chamar(`/projects/${PROJETO}/accounts:lookup`, {
      email: [email],
    });
    localId = busca.users[0].localId;
  }

  await chamar(`/projects/${PROJETO}/accounts:update`, {
    localId,
    customAttributes: JSON.stringify({ role: perfil }),
  });

  return localId;
}

await confirmarEmulador();

console.log(`Semeando ${PROJETO} em ${HOST}\n`);
for (const conta of CONTAS) {
  const uid = await semear(conta);
  console.log(`  ${conta.perfil.padEnd(9)} ${conta.email.padEnd(24)} ${uid}`);
}

console.log(`\n  Senha de todas: ${SENHA}`);
console.log('  Sao contas de EMULADOR. Nao existem em lugar nenhum alem dele.');
