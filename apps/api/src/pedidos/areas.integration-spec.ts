import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { CATALOGO_FICTICIO } from '../../../../scripts/dados-ficticios/catalogo-produtos.js';
import { normalizarParaBusca } from 'shared';
import { AnexosService } from '../anexos/anexos.service.js';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { FilaFalsa } from '../varredura/fila.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { ObservacoesService } from '../observacoes/observacoes.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { AcessoPedidoService } from './acesso.service.js';
import { ConsultaPedidosService } from './consulta.service.js';
import { DistribuicaoService } from './distribuicao.service.js';
import { PedidosService, type NovoPedido } from './pedidos.service.js';

const ADMIN = 'uid-admin';
const CLARA = 'uid-clara';
const BRUNO = 'uid-bruno';
const ANA = 'uid-ana';
const CARLOS = 'uid-carlos';

const CONTRATO = CATALOGO_FICTICIO[0];
const PARECER = CATALOGO_FICTICIO[1];

let banco: Firestore;
let produtos: ProdutosService;
let pedidos: PedidosService;
let clientes: ClientesService;
let consulta: ConsultaPedidosService;
let distribuicao: DistribuicaoService;
let entregaveis: EntregaveisService;
let observacoes: ObservacoesService;
let anexos: AnexosService;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  produtos = new ProdutosService(banco);
  pedidos = new PedidosService(banco);
  clientes = new ClientesService(banco);
  consulta = new ConsultaPedidosService(banco, clientes);
  distribuicao = new DistribuicaoService(banco, clientes);
  entregaveis = new EntregaveisService(banco);

  const acesso = new AcessoPedidoService(banco);
  observacoes = new ObservacoesService(acesso);
  anexos = new AnexosService(acesso, new ArmazenamentoFalso(), new FilaFalsa());
});

async function comprar(itens: NovoPedido[]): Promise<void> {
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(transacao, await pedidos.preparar(transacao, itens));
  });
}

async function cadastrarCliente(uid: string, nome: string): Promise<void> {
  await banco
    .collection('clientes')
    .doc(uid)
    .set({
      nome,
      email: `${uid}@exemplo.test`,
      nomeNormalizado: normalizarParaBusca(nome),
      emailNormalizado: normalizarParaBusca(`${uid}@exemplo.test`),
      produtosContratados: [CONTRATO.nome],
      criadoEm: new Date(),
    });
}

async function cadastrarAdvogado(uid: string, nome: string): Promise<void> {
  await banco
    .collection('advogados')
    .doc(uid)
    .set({ nome, email: `${uid}@escritorio.test`, status: 'ativo' });
}

/**
 * O cenario do entregavel da etapa: Clara com DOIS pedidos, Bruno com um, dois
 * advogados, e um pedido ainda na fila.
 */
async function cenario(): Promise<void> {
  const contrato = await produtos.criar(CONTRATO, ADMIN);
  const parecer = await produtos.criar(PARECER, ADMIN);

  await comprar([
    {
      pedidoId: 'clara-contrato',
      clienteId: CLARA,
      pagamentoId: 'pag-clara',
      produtoOrigemId: contrato.id,
    },
    {
      pedidoId: 'clara-parecer',
      clienteId: CLARA,
      pagamentoId: 'pag-clara',
      produtoOrigemId: parecer.id,
    },
  ]);
  await comprar([
    {
      pedidoId: 'bruno-parecer',
      clienteId: BRUNO,
      pagamentoId: 'pag-bruno',
      produtoOrigemId: parecer.id,
    },
  ]);

  await cadastrarCliente(CLARA, 'Clara Nunes de Sá');
  await cadastrarCliente(BRUNO, 'Bruno Alves Machado');
  await cadastrarAdvogado(ANA, 'Ana Souza');
  await cadastrarAdvogado(CARLOS, 'Carlos Prado');
}

/* -------------------------------------------------------------------------- */

describe('o cliente ve um cartao por pedido', () => {
  /**
   * O ENTREGAVEL DA ETAPA, contra o banco de verdade: um cliente com dois
   * pedidos ve dois cartoes DISTINTOS, cada um com seus proprios entregaveis.
   *
   * O dublê em memoria prova a mesma coisa; este prova que as duas consultas
   * indexadas (`clienteId` + `criadoEm`) devolvem o que se espera do Firestore,
   * com os carimbos de servidor ja materializados.
   */
  it('dois pedidos produzem dois cartoes com entregaveis proprios', async () => {
    await cenario();

    const cartoes = await consulta.listarDoCliente(CLARA);

    expect(cartoes).toHaveLength(2);
    expect(new Set(cartoes.map((cartao) => cartao.id))).toEqual(
      new Set(['clara-contrato', 'clara-parecer']),
    );

    const porId = new Map(cartoes.map((cartao) => [cartao.id, cartao]));
    expect(porId.get('clara-contrato')?.entregaveis).toHaveLength(
      CONTRATO.entregaveis.length,
    );
    expect(porId.get('clara-parecer')?.entregaveis).toHaveLength(
      PARECER.entregaveis.length,
    );
  });

  it('nao ve o pedido de outro cliente', async () => {
    await cenario();

    expect(
      (await consulta.listarDoCliente(BRUNO)).map((cartao) => cartao.id),
    ).toEqual(['bruno-parecer']);
    await expect(consulta.obterCartao('bruno-parecer', CLARA)).rejects.toThrow(
      NotFoundException,
    );
  });

  /** Os saldos sao isolados por pedido (arquitetura 5.4): gastar a revisao de um
   * nao mexe no outro. */
  it('o saldo de revisoes de um pedido nao afeta o do outro', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);

    const alvo = { pedidoId: 'clara-contrato', entregavelId: '001' };
    await entregaveis.iniciarTrabalho(alvo, ANA);
    await entregaveis.registrarArquivo(
      alvo,
      {
        nome: 'minuta.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 1000,
        caminho: 'entregaveis/clara-contrato/001/minuta',
      },
      ANA,
    );
    await entregaveis.pedirRevisao(alvo, CLARA);

    const cartoes = await consulta.listarDoCliente(CLARA);
    const porId = new Map(cartoes.map((cartao) => [cartao.id, cartao]));

    expect(porId.get('clara-contrato')?.entregaveis[0].revisoesUsadas).toBe(1);
    expect(porId.get('clara-parecer')?.entregaveis[0].revisoesUsadas).toBe(0);
  });
});

describe('distribuicao e isolamento do advogado', () => {
  /**
   * O CRITERIO DE ACEITE DA ETAPA 9, na forma que a Etapa 4 fixou.
   *
   * O criterio original falava em negacao "pela regra do Firestore". A Etapa 4
   * decidiu o contrario (arquitetura 6.1, regra inviolavel 7): as regras negam
   * TUDO e o Admin SDK as ignora, entao a autorizacao por atribuicao vive nos
   * guards e servicos da API, onde e exercitada a cada requisicao. E aqui que ela
   * e provada — contra o emulador, com o servico de verdade.
   *
   * A suite de `packages/regras-firestore` continua provando a outra metade: o
   * navegador nao tem caminho nenhum ate o banco.
   */
  it('o advogado nao alcanca demanda que nao e dele', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);
    await distribuicao.atribuir('bruno-parecer', CARLOS, ADMIN);

    expect((await consulta.listarDoAdvogado(ANA)).map((d) => d.id)).toEqual([
      'clara-contrato',
    ]);

    await expect(consulta.obterDemanda('bruno-parecer', ANA)).rejects.toThrow(
      NotFoundException,
    );
  });

  /** E nao consegue MEXER nela, que e o que separa "nao ve" de "nao pode". */
  it('o advogado nao move o estado de demanda alheia', async () => {
    await cenario();
    await distribuicao.atribuir('bruno-parecer', CARLOS, ADMIN);

    await expect(
      entregaveis.iniciarTrabalho(
        { pedidoId: 'bruno-parecer', entregavelId: '001' },
        ANA,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('pedido na fila nao e de advogado nenhum', async () => {
    await cenario();

    expect(await consulta.listarDoAdvogado(ANA)).toEqual([]);
    await expect(
      entregaveis.iniciarTrabalho(
        { pedidoId: 'clara-parecer', entregavelId: '001' },
        ANA,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('a caixa de entrada mostra o que ainda nao foi distribuido', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);

    const fila = await distribuicao.listar('nao_distribuidos');

    expect(new Set(fila.map((p) => p.id))).toEqual(
      new Set(['clara-parecer', 'bruno-parecer']),
    );
    expect(fila[0].cliente.nome).not.toBe('');
  });

  it('devolver a atribuicao recoloca o pedido na fila', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);
    await distribuicao.remover('clara-contrato', ADMIN);

    expect(await consulta.listarDoAdvogado(ANA)).toEqual([]);
    expect(
      (await distribuicao.listar('nao_distribuidos')).map((p) => p.id),
    ).toContain('clara-contrato');
  });
});

describe('o ciclo completo do entregavel', () => {
  /**
   * O outro entregavel da etapa: upload do advogado avanca o estado conforme o
   * ADR-11, e o anexo do cliente fica no pedido certo SEM se misturar ao fluxo de
   * entregaveis.
   */
  it('vai de solicitado a entregue, e o anexo do cliente nao interfere', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);
    const alvo = { pedidoId: 'clara-contrato', entregavelId: '001' };

    await entregaveis.iniciarTrabalho(alvo, ANA);

    await anexos.pedirEnvio(
      'clara-contrato',
      { uid: CLARA, perfil: 'cliente' },
      [{ nome: 'rg.jpg', tipo: 'image/jpeg', tamanhoBytes: 120_000 }],
    );

    // O anexo do cliente NAO muda o estado do entregavel.
    let cartao = await consulta.obterCartao('clara-contrato', CLARA);
    expect(cartao.entregaveis[0].estado).toBe('em_elaboracao');
    expect(cartao.entregaveis[0].temArquivo).toBe(false);

    await entregaveis.registrarArquivo(
      alvo,
      {
        nome: 'minuta.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 1000,
        caminho: 'entregaveis/clara-contrato/001/minuta',
      },
      ANA,
    );
    await entregaveis.confirmarEntrega(alvo, CLARA);

    cartao = await consulta.obterCartao('clara-contrato', CLARA);
    expect(cartao.entregaveis[0].estado).toBe('entregue');
    expect(
      await anexos.listar('clara-contrato', { uid: CLARA, perfil: 'cliente' }),
    ).toHaveLength(1);
  });

  /** O upload nao entra na trilha: ela registra MUDANCA DE ESTADO, e a trilha do
   * arquivo e `arquivoAtual.versao` (ADR-11). */
  it('o upload nao escreve na trilha de transicoes', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);
    const alvo = { pedidoId: 'clara-contrato', entregavelId: '001' };

    await entregaveis.iniciarTrabalho(alvo, ANA);
    await entregaveis.registrarArquivo(
      alvo,
      {
        nome: 'v1.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 1000,
        caminho: 'entregaveis/clara-contrato/001/v1',
      },
      ANA,
    );
    await entregaveis.registrarArquivo(
      alvo,
      {
        nome: 'v2.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 1000,
        caminho: 'entregaveis/clara-contrato/001/v2',
      },
      ANA,
    );

    const trilha = await banco
      .collection('pedidos')
      .doc('clara-contrato')
      .collection('entregaveis')
      .doc('001')
      .collection('transicoes')
      .get();

    // Criacao do pedido + inicio do trabalho. Os dois uploads nao entram.
    expect(trilha.size).toBe(2);
  });
});

describe('observacoes e anexos do cartao', () => {
  it('cliente e advogado atribuido conversam no mesmo pedido', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);

    await observacoes.registrar(
      'clara-contrato',
      { uid: CLARA, perfil: 'cliente' },
      { texto: 'O terceiro socio entra com 20%.' },
    );
    await observacoes.registrar(
      'clara-contrato',
      { uid: ANA, perfil: 'advogado' },
      { texto: 'Recebido, preparo a minuta.' },
    );

    const lista = await observacoes.listar('clara-contrato', {
      uid: CLARA,
      perfil: 'cliente',
    });

    expect(lista.map((o) => o.autorPerfil)).toEqual(['cliente', 'advogado']);
  });

  it('advogado nao atribuido nao le as observacoes', async () => {
    await cenario();
    await distribuicao.atribuir('clara-contrato', ANA, ADMIN);

    await expect(
      observacoes.listar('clara-contrato', { uid: CARLOS, perfil: 'advogado' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('o anexo fica no pedido certo', async () => {
    await cenario();
    const quem = { uid: CLARA, perfil: 'cliente' as const };

    await anexos.pedirEnvio('clara-contrato', quem, [
      {
        nome: 'contrato.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 500_000,
      },
    ]);

    expect(await anexos.listar('clara-contrato', quem)).toHaveLength(1);
    expect(await anexos.listar('clara-parecer', quem)).toHaveLength(0);
  });
});

describe('busca de clientes (item 2.5.8)', () => {
  /** A consulta por `array-contains` mais `orderBy` e uma das que precisam de
   * indice composto declarado no Terraform. O emulador nao exige indice — este
   * teste prova o COMPORTAMENTO; o indice esta em `infra/terraform/firestore.tf`. */
  it('acha por nome sem acento e filtra por produto', async () => {
    await cenario();

    expect(
      (await clientes.buscar({ busca: 'clara nunes de sa' })).map((c) => c.uid),
    ).toEqual([CLARA]);

    expect(
      (await clientes.buscar({ produto: CONTRATO.nome }))
        .map((c) => c.uid)
        .sort(),
    ).toEqual([BRUNO, CLARA].sort());
  });
});
