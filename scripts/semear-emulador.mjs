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
import {
  dataLocal,
  semanaDe,
  somarDias,
} from '../packages/shared/src/semana.ts';
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

/**
 * O RELOGIO DA SEMENTE E O MESMO DO SERVIDOR (Etapa 10).
 *
 * As telas de reuniao dependem da data: a lista de horarios so mostra a semana
 * corrente e a seguinte (ADR-06), e a agenda do advogado so mostra o futuro. Com
 * a grade semeada num relogio e a API lendo outro, o cliente abriria o seletor e
 * veria "nenhum horario disponivel" — sem erro nenhum e sem nada que dissesse
 * por que.
 *
 * `RELOGIO_FIXO` e a MESMA variavel que a API le (`apps/api/src/relogio.ts`), e
 * quem a passa aqui e o arnes das jornadas, junto com o `page.clock` do
 * navegador. Ausente — o caso de `pnpm semear` e de `pnpm dev` —, vale o relogio
 * de verdade e a grade sai relativa a hoje. E o que mantem a demonstracao manual
 * funcionando em qualquer dia do ano, sem a semente ter de escolher entre ser
 * deterministica e ser util.
 *
 * TODO CARIMBO DA SEMENTE SAI DESTE INSTANTE, `criadoEm` de pedido incluido: a
 * tela do cliente mostra ate quando as reunioes valem, e essa data e
 * `criadoEm + prazo`. Com o relogio de verdade ali, a imagem de referencia da
 * regressao visual mudaria de um dia para o outro — e um baseline que precisa
 * ser regravado por calendario treina a equipe a regravar sem olhar, que e como
 * uma suite de regressao visual morre.
 */
const RELOGIO = process.env.RELOGIO_FIXO;
const AGORA =
  RELOGIO === undefined || RELOGIO === '' ? new Date() : new Date(RELOGIO);

/**
 * Tres horarios de atendimento, a tres e quatro dias do relogio: quinta as 14h e
 * sexta as 10h e 14h, quando o relogio cai numa segunda.
 *
 * TRES E QUATRO DIAS, e nao "amanha": a antecedencia minima para marcar e de 24
 * horas (ADR-21, decisao F), e um slot mais perto seria recusado pelo servidor —
 * a lista sairia vazia e pareceria defeito de tela.
 *
 * Nunca escapam das duas semanas editaveis, qualquer que seja o dia de partida:
 * o pior caso e um domingo, e quatro dias dali ainda caem na semana seguinte.
 *
 * O FUSO E FIXO EM -03:00 (ver `semana.ts` e o ADR-21): 14h em Sao Paulo e 17h
 * em UTC, sempre. E por isso que da para montar o instante concatenando a data
 * civil com a hora, sem nenhuma conversao.
 */
function slotsDaGrade(base) {
  const dia = (quantos) => somarDias(dataLocal(base), quantos);

  return [
    { inicio: `${dia(3)}T17:00:00.000Z`, fim: `${dia(3)}T18:00:00.000Z` },
    { inicio: `${dia(4)}T13:00:00.000Z`, fim: `${dia(4)}T14:00:00.000Z` },
    { inicio: `${dia(4)}T17:00:00.000Z`, fim: `${dia(4)}T18:00:00.000Z` },
  ];
}

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

/* Sem esta guarda, um valor mal escrito viraria `Invalid Date` e a semente
 * gravaria carimbos nulos — que e o tipo de dado que so denuncia a origem tres
 * telas adiante. A API recusa subir pelo mesmo motivo. */
if (Number.isNaN(AGORA.getTime())) {
  abortar(`RELOGIO_FIXO invalido: "${RELOGIO}". Use um instante ISO 8601.`);
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
  const agora = AGORA;
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
 * Os documentos `advogados/{uid}` (Etapa 12).
 *
 * FALTAVAM, e a falta so aparecia na tela: a lista de advogados do administrador
 * le esta colecao, entao o seletor da caixa de distribuicao vinha VAZIO e
 * `DistribuicaoService.atribuir` respondia 404 para um advogado que existe no
 * Auth. Quem semeia conta precisa semear o documento que a conta representa.
 *
 * `status: 'ativo'` porque a tela de distribuicao filtra por ele (item 2.4.6): um
 * advogado suspenso continua sendo advogado, mas nao recebe demanda nova.
 */
async function semearAdvogados(uidPorEmail) {
  const agora = AGORA;

  for (const conta of CONTAS.filter((atual) => atual.perfil === 'advogado')) {
    const uid = uidPorEmail.get(conta.email);

    await gravarDocumento(HOST_FIRESTORE, PROJETO, `advogados/${uid}`, {
      nome: conta.nome,
      email: conta.email,
      status: 'ativo',
      criadoEm: agora,
      criadoPor: 'seed-do-emulador',
    });

    console.log(`  advogado  ${conta.nome}`);
  }
}

/**
 * A grade de disponibilidade do advogado (Etapa 10, ADR-06).
 *
 * Sem ela a jornada de reuniao nao tem o que escolher e a tela do cliente mostra
 * "nenhum horario disponivel" — que e um estado legitimo, mas nao o que se quer
 * exercitar. Os instantes saem do relogio da semente: ver a nota em `AGORA`.
 *
 * A SEMANA E CALCULADA POR SLOT, e nao uma so para os tres. Quando o relogio cai
 * perto do fim de semana, os slots caem na semana SEGUINTE — e um campo `semana`
 * que nao case com o `inicio` faria o slot sumir da consulta sem sumir do banco.
 *
 * `reserva: null` SEMPRE ESCRITO, como o servico faz: consulta por igualdade
 * ignora documento sem o campo, e um slot semeado sem ele cairia fora de
 * qualquer filtro de "livre".
 */
async function semearDisponibilidade(uidPorEmail) {
  const advogado = CONTAS.find((conta) => conta.perfil === 'advogado');
  const uid = uidPorEmail.get(advogado.email);
  const slots = slotsDaGrade(AGORA);

  for (const slot of slots) {
    await gravarDocumento(
      HOST_FIRESTORE,
      PROJETO,
      `disponibilidades/${uid}_${slot.inicio}`,
      {
        advogadoId: uid,
        inicio: slot.inicio,
        fim: slot.fim,
        semana: semanaDe(new Date(slot.inicio)),
        reserva: null,
        criadoEm: AGORA,
      },
    );
  }

  console.log(
    `  grade     ${slots.length} slots a partir de ${slots[0].inicio}`,
  );
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
  const agora = AGORA;
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
      // Etapa 8: sempre escrito, como o `PedidosService.gravar` escreve.
      situacao: 'ativo',
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

console.log('\nAdvogados, clientes e pedidos ficticios\n');
await semearAdvogados(uidPorEmail);
await semearDisponibilidade(uidPorEmail);
await semearClientesEPedidos(idsDeProduto, uidPorEmail);

console.log(
  '\n  DADOS FICTICIOS. Substituir pelo catalogo real da B&C antes de producao,',
);
console.log(
  '  e revalidar clientes/pedidos contra o checkout quando a Etapa 8 existir',
);
console.log('  (scripts/dados-ficticios/LEIA-ME.md).');
