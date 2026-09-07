import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  setLogLevel,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

/**
 * As regras do Firestore, exercitadas contra o emulador.
 *
 * O QUE ESTAS REGRAS SAO, E POR QUE
 *
 * Elas negam tudo, para todo mundo, em todo caminho. Nao e um estado provisorio
 * a ser afrouxado nas proximas etapas: e a decisao da regra inviolavel 7 e da
 * secao 6.1 da arquitetura. O SDK do Firebase no navegador serve so para
 * autenticacao, e toda leitura ou escrita de dado passa pela API.
 *
 * Isso torna qualquer `allow` aqui pior do que inutil. A API usa o Admin SDK, que
 * IGNORA as regras — uma regra permissiva nunca seria exercitada pelo caminho
 * real, nunca falharia num teste de aplicacao, e ficaria como uma porta aberta
 * que ninguem visita. A autorizacao por perfil e por atribuicao vive nos guards e
 * nos servicos da API, onde e exercitada a cada requisicao.
 *
 * A SUITE E TABULAR de proposito: quatro perfis x cada caminho do modelo de dados
 * (arquitetura 5.1) x cinco operacoes. Escrever caso a caso deixaria buracos, e
 * um buraco aqui e uma colecao que ninguem lembrou de negar.
 */

const PROJETO = 'demo-lexintegra';

/**
 * Todos os caminhos que o modelo de dados preve (arquitetura, 5.1 e subcolecoes),
 * mais um que nao existe.
 *
 * O caminho inexistente e o teste do catch-all `/{document=**}`. Sem ele, a suite
 * so provaria que as colecoes que alguem lembrou de listar estao negadas — e a
 * colecao que a Etapa 5 criar amanha nao estaria na lista.
 */
const CAMINHOS = [
  ['produtos', 'produto-1'],
  /*
   * A colecao da Etapa 6. Ela guarda nome, e-mail e telefone de quem ainda nao e
   * cliente — dado pessoal coletado antes de existir relacao contratual
   * (arquitetura, secao 13). E a colecao mais sensivel a leitura direta do
   * navegador que o sistema tem: uma base de leads de escritorio de advocacia e a
   * lista de quem procurou um advogado.
   */
  ['pre-cadastros', 'hash-do-email'],
  ['clientes', 'cliente-1'],
  ['clientes/cliente-1/anamnese', 'anamnese-1'],
  ['pagamentos', 'pagamento-1'],
  ['pedidos', 'pedido-1'],
  ['pedidos/pedido-1/entregaveis', 'entregavel-1'],
  ['pedidos/pedido-1/entregaveis/entregavel-1/transicoes', 'transicao-1'],
  ['pedidos/pedido-1/reunioes', 'reuniao-1'],
  ['advogados', 'advogado-1'],
  ['disponibilidades', 'advogado-1_2026-09-04T14:00:00Z'],
  ['outbox', 'definir-senha_uid-1'],
  ['colecao-que-nao-existe', 'documento-1'],
] as const;

/**
 * Os quatro perfis de acesso da arquitetura, secao 6. A claim `role` e forjada
 * aqui com o mesmo nome que a aplicacao usa — se o nome divergir, este arnes
 * estaria testando um usuario que a aplicacao nao reconhece.
 */
const PERFIS = [
  ['anonimo', null],
  ['cliente', { role: 'cliente' }],
  ['advogado', { role: 'advogado' }],
  ['admin', { role: 'admin' }],
] as const;

let ambiente: RulesTestEnvironment;

/*
 * Silencia o SDK. Cada uma das centenas de negacoes esperadas produz um aviso
 * `PERMISSION_DENIED` com pilha completa, e o resultado e um log de CI onde a
 * unica falha de verdade fica enterrada em ruido que o teste PEDIU para
 * acontecer.
 */
setLogLevel('silent');

beforeAll(async () => {
  ambiente = await initializeTestEnvironment({
    projectId: PROJETO,
    firestore: {
      // O arquivo de verdade, o mesmo que o pipeline publica. Uma copia do
      // conteudo aqui dentro testaria as regras que o teste inventou.
      rules: readFileSync(
        fileURLToPath(new URL('../../../firestore.rules', import.meta.url)),
        'utf8',
      ),
    },
  });
});

afterAll(async () => {
  await ambiente?.cleanup();
});

beforeEach(async () => {
  await ambiente.clearFirestore();
});

function bancoDe(claims: Readonly<Record<string, string>> | null): Firestore {
  const contexto =
    claims === null
      ? ambiente.unauthenticatedContext()
      : ambiente.authenticatedContext(`uid-${claims['role']}`, claims);
  return contexto.firestore() as unknown as Firestore;
}

/* -------------------------------------------------------------------------- */
/* Controle positivo                                                          */
/* -------------------------------------------------------------------------- */

/**
 * SEM ISTO, A SUITE INTEIRA PODERIA SER VACUAMENTE VERDADEIRA.
 *
 * Todos os casos abaixo afirmam que uma operacao falha. Um arnes quebrado — porta
 * errada, emulador nao carregado, contexto mal construido — faria tudo falhar, e
 * a suite passaria verde provando nada. Este teste escreve com as regras
 * desligadas: se ele nao passar, o problema e o arnes, e a negacao dos outros nao
 * significa nada.
 */
describe('arnes', () => {
  it('consegue escrever com as regras desligadas', async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore() as unknown as Firestore;
      await assertSucceeds(
        setDoc(doc(banco, 'produtos/produto-1'), { nome: 'Teste' }),
      );
    });
  });

  it('consegue ler o que escreveu com as regras desligadas', async () => {
    await ambiente.withSecurityRulesDisabled(async (contexto) => {
      const banco = contexto.firestore() as unknown as Firestore;
      await setDoc(doc(banco, 'produtos/produto-1'), { nome: 'Teste' });
      const lido = await getDoc(doc(banco, 'produtos/produto-1'));
      expect(lido.data()).toEqual({ nome: 'Teste' });
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Negacao por perfil, caminho e operacao                                     */
/* -------------------------------------------------------------------------- */

describe.each(PERFIS)('perfil %s', (_nome, claims) => {
  describe.each(CAMINHOS)('em %s/%s', (colecaoAlvo, id) => {
    const caminho = (): string => `${colecaoAlvo}/${id}`;

    /**
     * O documento existe de verdade antes da leitura. Uma leitura negada de
     * documento inexistente e ambigua: `get` de documento que nao existe tambem
     * "nao devolve dado". Semear com as regras desligadas remove a ambiguidade —
     * o dado esta la, e mesmo assim nao sai.
     */
    beforeEach(async () => {
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        const banco = contexto.firestore() as unknown as Firestore;
        await setDoc(doc(banco, caminho()), { semeado: true });
      });
    });

    it('nao le o documento', async () => {
      await assertFails(getDoc(doc(bancoDe(claims), caminho())));
    });

    it('nao lista a colecao', async () => {
      await assertFails(getDocs(collection(bancoDe(claims), colecaoAlvo)));
    });

    it('nao cria documento', async () => {
      await assertFails(
        setDoc(doc(bancoDe(claims), `${colecaoAlvo}/documento-novo`), {
          criado: true,
        }),
      );
    });

    it('nao atualiza documento', async () => {
      await assertFails(
        updateDoc(doc(bancoDe(claims), caminho()), { semeado: false }),
      );
    });

    it('nao apaga documento', async () => {
      await assertFails(deleteDoc(doc(bancoDe(claims), caminho())));
    });
  });
});

/* -------------------------------------------------------------------------- */
/* O proprio dono tambem nao passa                                            */
/* -------------------------------------------------------------------------- */

/**
 * O engano mais provavel de quem for mexer nestas regras e "o dono pode ler o
 * proprio documento" — e o padrao de quase todo projeto Firebase. Aqui NAO e:
 * mesmo o documento cujo id e o proprio uid fica fora do alcance do navegador,
 * porque o navegador nao le dado nenhum.
 */
describe('documento do proprio usuario', () => {
  it.each([
    ['cliente', { role: 'cliente' }, 'clientes'],
    ['advogado', { role: 'advogado' }, 'advogados'],
  ] as const)(
    '%s nao le o proprio documento',
    async (_nome, claims, colecaoAlvo) => {
      const uid = `uid-${claims.role}`;
      await ambiente.withSecurityRulesDisabled(async (contexto) => {
        const banco = contexto.firestore() as unknown as Firestore;
        await setDoc(doc(banco, `${colecaoAlvo}/${uid}`), { proprio: true });
      });

      await assertFails(getDoc(doc(bancoDe(claims), `${colecaoAlvo}/${uid}`)));
    },
  );
});
