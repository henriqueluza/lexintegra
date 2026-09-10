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
 *
 * Semeia tambem o catalogo de produtos e, desde a Etapa 9, clientes e pedidos —
 * todos com os DADOS FICTICIOS de `scripts/dados-ficticios/`, ver o LEIA-ME de
 * la. As mesmas guardas valem: a escrita no Firestore vai pela REST do emulador,
 * com `Bearer owner`, que o servico real recusa.
 */

import { congelarProduto } from '../packages/shared/src/esquemas/produto.ts';
import { normalizarParaBusca } from '../packages/shared/src/texto.ts';
import { CATALOGO_FICTICIO } from './dados-ficticios/catalogo-produtos.ts';
import {
  CLIENTES_FICTICIOS,
  PEDIDOS_FICTICIOS,
} from './dados-ficticios/clientes-pedidos.ts';
import {
  confirmarEmuladorFirestore,
  gravarDocumento,
} from './firestore-emulador.mjs';

const HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const HOST_FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
const PROJETO = process.env.GCLOUD_PROJECT ?? 'demo-lexintegra';

const SENHA = 'senha-de-desenvolvimento';
const CONTAS = [
  {
    email: 'cliente@exemplo.test',
    nome: 'Clara Nunes de Sa',
    perfil: 'cliente',
  },
  // O SEGUNDO CLIENTE nao e enfeite: a Etapa 9 precisa provar que um cliente nao
  // ve o pedido do outro, e isso nao e verificavel com um cliente so.
  {
    email: 'bruno.cliente@exemplo.test',
    nome: 'Bruno Alves Machado',
    perfil: 'cliente',
  },
  { email: 'advogado@exemplo.test', nome: 'Ana Souza', perfil: 'advogado' },
  // O SEGUNDO ADVOGADO, pelo mesmo motivo: sem ele nao ha como demonstrar que a
  // demanda de um nao aparece para o outro (item 2.6.1).
  {
    email: 'carlos.advogado@exemplo.test',
    nome: 'Carlos Prado',
    perfil: 'advogado',
  },
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

if (HOST_FIRESTORE === undefined || HOST_FIRESTORE === '') {
  abortar(
    'FIRESTORE_EMULATOR_HOST nao esta definido. Rode por ' +
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

/**
 * Id deterministico e com prefixo que se le. `ficticio-01` reaparece igual a cada
 * semeadura — entao rodar de novo atualiza em vez de duplicar — e denuncia a
 * origem do dado a quem abrir o banco procurando entender de onde saiu um produto.
 */
async function semearCatalogo() {
  const agora = new Date();
  const ids = [];

  for (const [indice, produto] of CATALOGO_FICTICIO.entries()) {
    const id = `ficticio-${String(indice + 1).padStart(2, '0')}`;

    await gravarDocumento(HOST_FIRESTORE, PROJETO, `produtos/${id}`, {
      ...produto,
      ativo: true,
      criadoEm: agora,
      criadoPor: 'seed-do-emulador',
      atualizadoEm: agora,
      atualizadoPor: 'seed-do-emulador',
    });

    ids.push(id);
    console.log(`  ${id}  ${produto.nome}`);
  }

  return ids;
}

/**
 * Clientes, pedidos, entregaveis, trilha, observacoes e anamnese (Etapa 9).
 *
 * O SNAPSHOT SAI DE `congelarProduto`, a mesma funcao que o checkout usa — nunca
 * de um espalhamento do produto aqui. E a regra inviolavel 5 valendo tambem para
 * o seed: um campo novo no produto entra no snapshot nos dois lugares de uma vez,
 * ou em nenhum. Um `{ ...produto }` aqui levaria `ativo` e os carimbos para
 * dentro do pedido e o dado de desenvolvimento deixaria de parecer com o real.
 *
 * A FORMA DO ENTREGAVEL E DA TRANSICAO esta escrita a mao, e essa duplicacao e
 * conhecida: o script fala com a REST do emulador de proposito (ver o cabecalho)
 * e nao pode importar `PedidosService`, que depende do Nest e do Admin SDK. Quem
 * pega divergencia e a suite de integracao, que exercita os servicos de verdade
 * contra o mesmo emulador.
 */
async function semearClientesEPedidos(idsDeProduto, uidPorEmail) {
  const agora = new Date();
  const uidDoCliente = new Map();

  for (const cliente of CLIENTES_FICTICIOS) {
    const uid = uidPorEmail.get(cliente.email);
    if (uid === undefined) {
      abortar(`Cliente ficticio ${cliente.email} nao tem conta em CONTAS.`);
    }
    uidDoCliente.set(cliente.chave, uid);

    const produtos = PEDIDOS_FICTICIOS.filter(
      (pedido) => pedido.clienteChave === cliente.chave,
    ).map((pedido) => CATALOGO_FICTICIO[pedido.produtoIndice].nome);

    await gravarDocumento(HOST_FIRESTORE, PROJETO, `clientes/${uid}`, {
      nome: cliente.nome,
      email: cliente.email,
      // Os campos de busca do item 2.5.8 saem da MESMA funcao que o formulario
      // do administrador usa no termo digitado (arquitetura 5.5).
      nomeNormalizado: normalizarParaBusca(cliente.nome),
      emailNormalizado: normalizarParaBusca(cliente.email),
      produtosContratados: [...new Set(produtos)],
      criadoEm: agora,
    });

    await gravarDocumento(
      HOST_FIRESTORE,
      PROJETO,
      `clientes/${uid}/anamnese/ficha-01`,
      { campos: [...cliente.anamnese], criadoEm: agora },
    );

    console.log(`  cliente   ${cliente.nome}`);
  }

  const advogados = {
    ana: uidPorEmail.get('advogado@exemplo.test'),
    carlos: uidPorEmail.get('carlos.advogado@exemplo.test'),
  };

  for (const pedido of PEDIDOS_FICTICIOS) {
    const produto = CATALOGO_FICTICIO[pedido.produtoIndice];
    const snapshot = congelarProduto(produto);
    const clienteId = uidDoCliente.get(pedido.clienteChave);
    const advogadoId =
      pedido.advogado === null ? null : advogados[pedido.advogado];
    const caminho = `pedidos/${pedido.chave}`;

    await gravarDocumento(HOST_FIRESTORE, PROJETO, caminho, {
      clienteId,
      pagamentoId: pedido.pagamentoChave,
      produtoOrigemId: idsDeProduto[pedido.produtoIndice],
      snapshot,
      criadoEm: agora,
      advogadoId,
      distribuido: advogadoId !== null,
    });

    for (const [indice, nome] of snapshot.entregaveis.entries()) {
      const ordem = indice + 1;
      const id = String(ordem).padStart(3, '0');

      await gravarDocumento(
        HOST_FIRESTORE,
        PROJETO,
        `${caminho}/entregaveis/${id}`,
        {
          nome,
          ordem,
          estado: 'solicitado',
          revisoesUsadas: 0,
          arquivoAtual: null,
          transicoes: 1,
          atualizadoEm: agora,
        },
      );

      await gravarDocumento(
        HOST_FIRESTORE,
        PROJETO,
        `${caminho}/entregaveis/${id}/transicoes/0001`,
        {
          de: null,
          para: 'solicitado',
          evento: 'criar-pedido',
          por: 'sistema',
          atorUid: clienteId,
          em: agora,
        },
      );
    }

    for (const [indice, observacao] of pedido.observacoes.entries()) {
      await gravarDocumento(
        HOST_FIRESTORE,
        PROJETO,
        `${caminho}/observacoes/obs-${String(indice + 1).padStart(2, '0')}`,
        {
          texto: observacao.texto,
          autorUid: observacao.de === 'cliente' ? clienteId : advogadoId,
          autorPerfil: observacao.de,
          criadoEm: agora,
        },
      );
    }

    const destino = advogadoId === null ? 'na fila' : `com ${pedido.advogado}`;
    console.log(`  pedido    ${pedido.chave.padEnd(18)} ${destino}`);
  }
}

await confirmarEmulador();
await confirmarEmuladorFirestore(HOST_FIRESTORE, PROJETO);

console.log(`Semeando ${PROJETO} em ${HOST}\n`);
const uidPorEmail = new Map();
for (const conta of CONTAS) {
  const uid = await semear(conta);
  uidPorEmail.set(conta.email, uid);
  console.log(`  ${conta.perfil.padEnd(9)} ${conta.email.padEnd(30)} ${uid}`);
}

console.log(`\n  Senha de todas: ${SENHA}`);
console.log('  Sao contas de EMULADOR. Nao existem em lugar nenhum alem dele.');

console.log(`\nCatalogo ficticio em ${HOST_FIRESTORE}\n`);
const idsDeProduto = await semearCatalogo();

console.log('\nClientes e pedidos ficticios\n');
await semearClientesEPedidos(idsDeProduto, uidPorEmail);

console.log(
  '\n  DADOS FICTICIOS. Substituir pelo catalogo real da B&C antes de producao,',
);
console.log(
  '  e revalidar clientes/pedidos contra o checkout quando a Etapa 8 existir',
);
console.log('  (scripts/dados-ficticios/LEIA-ME.md).');
