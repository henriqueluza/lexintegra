import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  FieldValue,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import type { EstadoEntregavel, NovoProduto } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { EntregaveisService } from './entregaveis.service.js';
import { comSnapshot } from '../arnes-pedidos.js';

const ADMIN = 'uid-admin';
const CLIENTE = 'uid-cliente';
const ADVOGADO = 'uid-advogado';
const ALVO = { pedidoId: 'pedido-1', entregavelId: '001' };
const CAMINHO = 'pedidos/pedido-1/entregaveis/001';

const PRODUTO: NovoProduto = {
  nome: 'Elaboracao de Contrato Social',
  descricao: 'Redacao do contrato social e clausulas societarias.',
  precoCentavos: 320_000,
  entregaveis: ['Minuta do contrato social'],
  textosOrientativos: [],
  quantidadeReunioes: 1,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 0,
  numeroRevisoesPermitidas: 2,
  parcelas: 1,
  tipoCobranca: 'assinatura',
  descricaoDetalhada:
    'Texto detalhado do produto, com o que ele cobre e como funciona.',
};

interface Arranjo {
  banco: FirestoreFalso;
  entregaveis: EntregaveisService;
}

/**
 * O pedido nasce SEM advogado (Etapa 9): quem distribui e o administrador. Como
 * a maioria dos casos deste arquivo exercita o trabalho do advogado, `montar`
 * atribui por padrao — e `montar({ atribuirA: null })` cobre o pedido que ainda
 * esta na caixa de entrada.
 */
async function montar(
  revisoes = 2,
  opcoes: { atribuirA?: string | null } = {},
): Promise<Arranjo> {
  const banco = new FirestoreFalso();
  const produtos = new ProdutosService(banco as unknown as Firestore);
  const pedidos = new PedidosService(banco as unknown as Firestore);

  const { id: produtoOrigemId } = await produtos.criar(
    { ...PRODUTO, numeroRevisoesPermitidas: revisoes },
    ADMIN,
  );
  await banco.runTransaction(async (transacao) => {
    const tr = transacao as unknown as Transaction;
    pedidos.gravar(
      tr,
      pedidos.preparar(
        await comSnapshot(pedidos, [
          {
            pedidoId: 'pedido-1',
            clienteId: CLIENTE,
            pagamentoId: 'pagamento-1',
            produtoOrigemId,
          },
        ]),
      ),
    );
  });

  const advogado = opcoes.atribuirA === undefined ? ADVOGADO : opcoes.atribuirA;
  if (advogado !== null) {
    await banco
      .collection('pedidos')
      .doc('pedido-1')
      .update({ advogadoId: advogado, distribuido: true });
  }

  return {
    banco,
    entregaveis: new EntregaveisService(banco as unknown as Firestore),
  };
}

/**
 * O `PUT` chegou ao bucket e o advogado confirmou o envio: e o que
 * `UploadDeEntregavelService.confirmarEnvio` grava. `registrarArquivo` sozinho
 * deixa o arquivo em `pendente_upload`, que e so a URL emitida — e ai NAO ha
 * arquivo para o cliente decidir (`arquivoFoiEnviado`, 19/11/2026).
 */
function arquivoChegou(banco: FirestoreFalso): void {
  const documento = banco.documentos.get(CAMINHO) as {
    arquivoAtual: Record<string, unknown>;
  };
  banco.documentos.set(CAMINHO, {
    ...documento,
    arquivoAtual: { ...documento.arquivoAtual, estado: 'pendente_scan' },
  });
}

/** Leva o entregavel ate `em_elaboracao` com arquivo enviado — o unico ponto de
 * onde o cliente pode confirmar ou pedir revisao. */
async function ateAguardandoCliente(revisoes = 2): Promise<Arranjo> {
  const arranjo = await montar(revisoes);
  await arranjo.entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
  await arranjo.entregaveis.registrarArquivo(
    ALVO,
    { nome: 'minuta.pdf' },
    ADVOGADO,
  );
  arquivoChegou(arranjo.banco);
  return arranjo;
}

function estado(banco: FirestoreFalso): EstadoEntregavel {
  return banco.documentos.get(CAMINHO)?.['estado'] as EstadoEntregavel;
}

describe('EntregaveisService', () => {
  describe('caminho feliz', () => {
    it('vai de solicitado a entregue por eventos de dominio', async () => {
      const { banco, entregaveis } = await montar();

      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
      expect(estado(banco)).toBe('em_elaboracao');

      await entregaveis.registrarArquivo(
        ALVO,
        { nome: 'minuta.pdf' },
        ADVOGADO,
      );
      expect(estado(banco)).toBe('em_elaboracao');
      arquivoChegou(banco);

      const final = await entregaveis.confirmarEntrega(ALVO, CLIENTE);
      expect(final.estado).toBe('entregue');
      expect(estado(banco)).toBe('entregue');
    });

    /**
     * O FIM DO CONTRATO, para a retencao (decisoes.md, 2.2): a confirmacao do
     * ULTIMO entregavel marca o pedido na mesma transacao. Ate o Bloco D da B2
     * ninguem marcava, e o job de retencao nunca encontrou pedido nenhum.
     */
    it('a confirmacao do ultimo entregavel inicia a retencao do pedido', async () => {
      const { banco, entregaveis } = await ateAguardandoCliente();

      await entregaveis.confirmarEntrega(ALVO, CLIENTE);

      expect(banco.documentos.get('pedidos/pedido-1')).toMatchObject({
        retencaoPendente: true,
        avisoDeExclusaoEnviado: false,
      });
    });

    it('com outro entregavel em aberto, a retencao nao comeca', async () => {
      const { banco, entregaveis } = await ateAguardandoCliente();
      banco.documentos.set('pedidos/pedido-1/entregaveis/999', {
        estado: 'em_elaboracao',
      });

      await entregaveis.confirmarEntrega(ALVO, CLIENTE);

      expect(
        banco.documentos.get('pedidos/pedido-1')?.['retencaoPendente'],
      ).toBeUndefined();
    });

    it('percorre o ciclo de revisao e volta a elaboracao', async () => {
      const { banco, entregaveis } = await ateAguardandoCliente();

      const pedido = await entregaveis.pedirRevisao(ALVO, CLIENTE);
      expect(pedido.estado).toBe('em_revisao');
      expect(pedido.revisoesUsadas).toBe(1);

      await entregaveis.retomarTrabalho(ALVO, ADVOGADO);
      expect(estado(banco)).toBe('em_elaboracao');
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Criterio de aceite: entregue forcado e rejeitado no servidor              */
  /* ------------------------------------------------------------------------ */

  /**
   * A outra ponta do ADR-12 (Etapa 8): pedido cancelado ou estornado nao comeca a
   * ser trabalhado. Sem esta trava, o advogado poderia iniciar um pedido cujo
   * dinheiro ja foi devolvido.
   */
  describe('pedido cancelado ou estornado', () => {
    it.each(['cancelado', 'estornado'])(
      'recusa iniciar o trabalho num pedido %s',
      async (situacao) => {
        const { banco, entregaveis } = await montar();
        await banco.collection('pedidos').doc('pedido-1').update({ situacao });

        await expect(
          entregaveis.iniciarTrabalho(ALVO, ADVOGADO),
        ).rejects.toThrow('cancelado ou estornado');
        expect(estado(banco)).toBe('solicitado');
      },
    );

    it('pedido anterior ao campo de situacao continua podendo ser iniciado', async () => {
      const { banco, entregaveis } = await montar();
      await banco
        .collection('pedidos')
        .doc('pedido-1')
        .update({ situacao: FieldValue.delete() });

      await expect(
        entregaveis.iniciarTrabalho(ALVO, ADVOGADO),
      ).resolves.toMatchObject({ estado: 'em_elaboracao' });
    });
  });

  describe('trava do entregue (ADR-11)', () => {
    /**
     * O criterio de aceite da etapa. `entregue` so sai de `em_elaboracao`, e
     * qualquer atalho a partir dos outros dois estados e recusado — mesmo que a
     * interface nao ofereca esse caminho, porque a chamada e alcancavel com curl.
     */
    it('recusa confirmar a partir de solicitado', async () => {
      const { banco, entregaveis } = await montar();

      await expect(entregaveis.confirmarEntrega(ALVO, CLIENTE)).rejects.toThrow(
        ConflictException,
      );
      expect(estado(banco)).toBe('solicitado');
    });

    it('recusa confirmar a partir de em_revisao', async () => {
      const { banco, entregaveis } = await ateAguardandoCliente();
      await entregaveis.pedirRevisao(ALVO, CLIENTE);

      await expect(entregaveis.confirmarEntrega(ALVO, CLIENTE)).rejects.toThrow(
        ConflictException,
      );
      expect(estado(banco)).toBe('em_revisao');
    });

    /**
     * A trava que o campo `arquivoAtual` existe para dar. Sem ela, confirmar
     * seria aceito num entregavel que o advogado nunca tocou — e o ADR-11 exige
     * upload E confirmacao, nao so confirmacao.
     */
    it('recusa confirmar sem arquivo enviado', async () => {
      const { banco, entregaveis } = await montar();
      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);

      await expect(entregaveis.confirmarEntrega(ALVO, CLIENTE)).rejects.toThrow(
        /ainda nao tem arquivo/,
      );
      expect(estado(banco)).toBe('em_elaboracao');
    });

    /**
     * `entregue` e terminal. Depois dele nao ha evento nenhum — nem do cliente,
     * nem do advogado, nem de administrador, que sequer tem metodo aqui.
     */
    it('nao aceita evento nenhum depois de entregue', async () => {
      const { entregaveis } = await ateAguardandoCliente();
      await entregaveis.confirmarEntrega(ALVO, CLIENTE);

      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow(
        ConflictException,
      );
      await expect(entregaveis.iniciarTrabalho(ALVO, ADVOGADO)).rejects.toThrow(
        ConflictException,
      );
      await expect(entregaveis.retomarTrabalho(ALVO, ADVOGADO)).rejects.toThrow(
        ConflictException,
      );
      await expect(
        entregaveis.registrarArquivo(ALVO, { nome: 'outro.pdf' }, ADVOGADO),
      ).rejects.toThrow(ConflictException);
    });

    /**
     * ENTREGUE SO DEPOIS DO UPLOAD (regra inviolavel 14), e upload e arquivo no
     * bucket. `registrarArquivo` deixa `arquivoAtual` em `pendente_upload`: a URL
     * assinada foi emitida e o `PUT` ainda nao aconteceu — ou falhou, como falhou
     * todo envio em producao ate 19/11/2026. Ate ali o servidor aceitava a
     * confirmacao so por existir o registro, e o cliente confirmava a entrega de
     * um arquivo que nunca chegou.
     */
    it('recusa confirmar a entrega de arquivo que nao chegou ao bucket', async () => {
      const { banco, entregaveis } = await montar();
      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
      await entregaveis.registrarArquivo(
        ALVO,
        { nome: 'minuta.pdf' },
        ADVOGADO,
      );

      await expect(entregaveis.confirmarEntrega(ALVO, CLIENTE)).rejects.toThrow(
        /ainda nao tem arquivo enviado/,
      );
      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow(
        /ainda nao tem arquivo enviado/,
      );
      expect(estado(banco)).toBe('em_elaboracao');
      expect(banco.documentos.get(CAMINHO)?.['revisoesUsadas']).toBe(0);
    });

    /** A tela pergunta a mesma coisa pelo resumo: sem arquivo, sem botao. */
    it('o resumo so diz que ha arquivo depois de ele chegar', async () => {
      const { banco, entregaveis } = await montar();
      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);

      const pedida = await entregaveis.registrarArquivo(
        ALVO,
        { nome: 'minuta.pdf' },
        ADVOGADO,
      );
      expect(pedida.temArquivo).toBe(false);
      expect(pedida.arquivoServivel).toBe(false);

      arquivoChegou(banco);
      const confirmada = await entregaveis.pedirRevisao(ALVO, CLIENTE);
      expect(confirmada.temArquivo).toBe(true);
    });

    /**
     * Nao ha metodo `mudarEstado`. Este teste defende a AUSENCIA: um metodo que
     * aceitasse estado de destino seria a transicao manual que o ADR-11 proibe, e
     * nenhum outro teste quebraria se alguem o acrescentasse.
     */
    it('nao expoe transicao manual', () => {
      const metodos = Object.getOwnPropertyNames(EntregaveisService.prototype);

      // Os cinco eventos de dominio, e so eles, sao a superficie do servico.
      for (const evento of [
        'iniciarTrabalho',
        'retomarTrabalho',
        'confirmarEntrega',
        'pedirRevisao',
        'registrarArquivo',
      ]) {
        expect(metodos).toContain(evento);
      }

      // Nenhum metodo nomeado por estado. `private` do TypeScript nao existe em
      // runtime, entao isto varre os auxiliares tambem — e e o ponto: um
      // `mudarEstado` interno seria alcancavel por quem chamasse o servico
      // diretamente, e chamada direta e o que o webhook e os guards fazem.
      expect(metodos.filter((nome) => /estado|status/i.test(nome))).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Autorizacao e saldo                                                       */
  /* ------------------------------------------------------------------------ */

  describe('so o cliente do pedido decide', () => {
    it.each([
      [
        'confirmar',
        (s: EntregaveisService, uid: string) => s.confirmarEntrega(ALVO, uid),
      ],
      [
        'pedir revisao',
        (s: EntregaveisService, uid: string) => s.pedirRevisao(ALVO, uid),
      ],
    ])(
      'recusa %s por quem nao e o cliente do pedido',
      async (_caso, operacao) => {
        const { banco, entregaveis } = await ateAguardandoCliente();

        await expect(operacao(entregaveis, ADVOGADO)).rejects.toThrow(
          ForbiddenException,
        );
        await expect(operacao(entregaveis, ADMIN)).rejects.toThrow(
          ForbiddenException,
        );
        expect(estado(banco)).toBe('em_elaboracao');
      },
    );
  });

  describe('saldo de revisoes', () => {
    /**
     * ADR-11: esgotado o saldo, so resta confirmar — e o backend rejeita a
     * chamada mesmo que alguem tente forca-la, porque a contagem e validada no
     * servidor e nao apenas escondida na tela.
     */
    it('recusa revisao com o saldo esgotado', async () => {
      const { banco, entregaveis } = await ateAguardandoCliente(1);

      await entregaveis.pedirRevisao(ALVO, CLIENTE);
      await entregaveis.retomarTrabalho(ALVO, ADVOGADO);
      await entregaveis.registrarArquivo(ALVO, { nome: 'v2.pdf' }, ADVOGADO);
      arquivoChegou(banco);

      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow(
        /Saldo de revisoes esgotado/,
      );
      expect(banco.documentos.get(CAMINHO)?.['revisoesUsadas']).toBe(1);
      expect(estado(banco)).toBe('em_elaboracao');
    });

    it('recusa a primeira revisao quando o produto contratou zero', async () => {
      const { entregaveis } = await ateAguardandoCliente(0);

      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow(
        /Saldo de revisoes esgotado/,
      );
    });

    /**
     * O saldo vem do SNAPSHOT, nao do produto vivo. Um cliente que comprou com
     * uma revisao contratada continua com uma, mesmo que o catalogo mude para
     * cinco depois — que e a regra inviolavel 5 aplicada a maquina de estados.
     */
    it('usa o saldo congelado no pedido, nao o do catalogo atual', async () => {
      const banco = new FirestoreFalso();
      const produtos = new ProdutosService(banco as unknown as Firestore);
      const pedidos = new PedidosService(banco as unknown as Firestore);
      const entregaveis = new EntregaveisService(banco as unknown as Firestore);

      const { id: produtoOrigemId } = await produtos.criar(
        { ...PRODUTO, numeroRevisoesPermitidas: 0 },
        ADMIN,
      );
      await banco.runTransaction(async (transacao) => {
        const tr = transacao as unknown as Transaction;
        pedidos.gravar(
          tr,
          pedidos.preparar(
            await comSnapshot(pedidos, [
              {
                pedidoId: 'pedido-1',
                clienteId: CLIENTE,
                pagamentoId: 'pagamento-1',
                produtoOrigemId,
              },
            ]),
          ),
        );
      });
      await banco
        .collection('pedidos')
        .doc('pedido-1')
        .update({ advogadoId: ADVOGADO, distribuido: true });

      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
      await entregaveis.registrarArquivo(
        ALVO,
        { nome: 'minuta.pdf' },
        ADVOGADO,
      );
      arquivoChegou(banco);

      await produtos.editar(
        produtoOrigemId,
        { ...PRODUTO, numeroRevisoesPermitidas: 5 },
        ADMIN,
      );

      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow(
        /Saldo de revisoes esgotado/,
      );
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Trilha de transicoes                                                      */
  /* ------------------------------------------------------------------------ */

  describe('trilha de transicoes', () => {
    it('registra de, para, evento e ator em cada mudanca', async () => {
      const { banco, entregaveis } = await ateAguardandoCliente();
      await entregaveis.pedirRevisao(ALVO, CLIENTE);

      expect(banco.documentos.get(`${CAMINHO}/transicoes/0002`)).toMatchObject({
        de: 'solicitado',
        para: 'em_elaboracao',
        evento: 'iniciar-trabalho',
        por: 'sistema',
        atorUid: ADVOGADO,
      });
      expect(banco.documentos.get(`${CAMINHO}/transicoes/0003`)).toMatchObject({
        de: 'em_elaboracao',
        para: 'em_revisao',
        evento: 'pedir-revisao',
        atorUid: CLIENTE,
      });
    });

    /** Upload nao muda estado, entao nao entra na trilha de transicoes — a
     * trilha do arquivo e `arquivoAtual.versao`. */
    it('nao registra transicao para o upload', async () => {
      const { banco, entregaveis } = await ateAguardandoCliente();

      expect(banco.documentos.has(`${CAMINHO}/transicoes/0003`)).toBe(false);
      expect(banco.documentos.get(CAMINHO)?.['transicoes']).toBe(2);

      await entregaveis.registrarArquivo(ALVO, { nome: 'v2.pdf' }, ADVOGADO);
      expect(
        (banco.documentos.get(CAMINHO)?.['arquivoAtual'] as { versao: number })
          .versao,
      ).toBe(2);
      expect(banco.documentos.get(CAMINHO)?.['transicoes']).toBe(2);
    });

    it('le tudo antes de escrever qualquer coisa', async () => {
      const { banco, entregaveis } = await montar();
      banco.ordemDeEscrita.length = 0;

      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);

      expect(banco.ordemDeEscrita).toEqual([
        `get ${CAMINHO}`,
        'get pedidos/pedido-1',
        `update ${CAMINHO}`,
        `create ${CAMINHO}/transicoes/0002`,
      ]);
    });
  });

  /**
   * Lote de novembro, ajuste 5. `estadoDesde` e o que a tela do administrador
   * mostra como "desde quando", e so vale se for escrito por TRANSICAO e por mais
   * nada. O dublê nao materializa o carimbo do servidor, entao o campo e marcado
   * com um valor reconhecivel e o teste olha quem o troca.
   */
  describe('desde quando esta no estado', () => {
    function marcar(banco: FirestoreFalso): void {
      banco.documentos.set(CAMINHO, {
        ...banco.documentos.get(CAMINHO),
        estadoDesde: 'MARCA',
      });
    }

    function desde(banco: FirestoreFalso): unknown {
      return banco.documentos.get(CAMINHO)?.['estadoDesde'];
    }

    it('cada transicao reescreve o campo, com o carimbo da propria trilha', async () => {
      const { banco, entregaveis } = await montar();

      marcar(banco);
      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
      expect(desde(banco)).not.toBe('MARCA');
      expect(desde(banco)).toEqual(
        banco.documentos.get(`${CAMINHO}/transicoes/0002`)?.['em'],
      );

      await entregaveis.registrarArquivo(ALVO, { nome: 'v1.pdf' }, ADVOGADO);
      /* Envio pendente nao e arquivo enviado: a revisao exige que ele chegue. */
      arquivoChegou(banco);
      marcar(banco);
      await entregaveis.pedirRevisao(ALVO, CLIENTE);
      expect(desde(banco)).not.toBe('MARCA');

      marcar(banco);
      await entregaveis.retomarTrabalho(ALVO, ADVOGADO);
      expect(desde(banco)).not.toBe('MARCA');

      marcar(banco);
      await entregaveis.confirmarEntrega(ALVO, CLIENTE);
      expect(desde(banco)).not.toBe('MARCA');
    });

    /** "Em elaboracao ha 20 dias" nao pode virar "ha 2 horas" a cada arquivo. */
    it('o upload NAO toca no campo', async () => {
      const { banco, entregaveis } = await montar();
      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
      marcar(banco);

      await entregaveis.registrarArquivo(ALVO, { nome: 'v1.pdf' }, ADVOGADO);

      expect(desde(banco)).toBe('MARCA');
    });

    it('transicao recusada nao toca no campo', async () => {
      const { banco, entregaveis } = await montar();
      marcar(banco);

      await expect(entregaveis.confirmarEntrega(ALVO, CLIENTE)).rejects.toThrow(
        ConflictException,
      );

      expect(desde(banco)).toBe('MARCA');
    });
  });

  describe('alvo inexistente', () => {
    const AUSENTE = { pedidoId: 'pedido-1', entregavelId: '999' };

    it.each([
      [
        'iniciarTrabalho',
        (s: EntregaveisService) => s.iniciarTrabalho(AUSENTE, ADVOGADO),
      ],
      [
        'retomarTrabalho',
        (s: EntregaveisService) => s.retomarTrabalho(AUSENTE, ADVOGADO),
      ],
      [
        'confirmarEntrega',
        (s: EntregaveisService) => s.confirmarEntrega(AUSENTE, CLIENTE),
      ],
      [
        'pedirRevisao',
        (s: EntregaveisService) => s.pedirRevisao(AUSENTE, CLIENTE),
      ],
      [
        'registrarArquivo',
        (s: EntregaveisService) =>
          s.registrarArquivo(AUSENTE, { nome: 'x.pdf' }, ADVOGADO),
      ],
    ])('%s recusa entregavel que nao existe', async (_caso, operacao) => {
      const { entregaveis } = await montar();
      await expect(operacao(entregaveis)).rejects.toThrow(NotFoundException);
    });

    it('recusa pedido que nao existe', async () => {
      const { entregaveis } = await montar();
      await expect(
        entregaveis.iniciarTrabalho(
          { pedidoId: 'pedido-9', entregavelId: '001' },
          ADVOGADO,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Atribuicao (itens 2.6.1 e 2.6.2)                                            */
/* -------------------------------------------------------------------------- */

/**
 * A metade-servidor do criterio de aceite da Etapa 9.
 *
 * `@Perfis('advogado')` separa PERFIS, nao PESSOAS: sem estas conferencias,
 * qualquer advogado autenticado avancaria o estado de qualquer pedido do
 * sistema, e a distribuicao feita pelo administrador (item 2.5.6) nao valeria
 * nada. Esconder a demanda na tela nao resolve — a rota e alcancavel com curl.
 */
describe('o advogado so trabalha no que lhe foi distribuido', () => {
  const OUTRO = 'uid-outro-advogado';

  it.each([
    [
      'iniciar-trabalho',
      (s: EntregaveisService) => s.iniciarTrabalho(ALVO, OUTRO),
    ],
    [
      'registrar arquivo',
      (s: EntregaveisService) =>
        s.registrarArquivo(ALVO, { nome: 'minuta.pdf' }, OUTRO),
    ],
  ])('recusa %s de advogado nao atribuido', async (_nome, acao) => {
    const { entregaveis } = await montar();
    await expect(acao(entregaveis)).rejects.toThrow(ForbiddenException);
  });

  it('recusa retomar-trabalho de advogado nao atribuido', async () => {
    const { entregaveis } = await ateAguardandoCliente();
    await entregaveis.pedirRevisao(ALVO, CLIENTE);

    await expect(entregaveis.retomarTrabalho(ALVO, OUTRO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  /**
   * Pedido ainda na caixa de entrada recusa TODO MUNDO, e nao "o primeiro que
   * chegar". Um advogado que comeca a trabalhar antes da distribuicao contorna a
   * decisao do administrador.
   */
  it('recusa qualquer advogado enquanto o pedido nao foi distribuido', async () => {
    const { entregaveis } = await montar(2, { atribuirA: null });

    await expect(entregaveis.iniciarTrabalho(ALVO, ADVOGADO)).rejects.toThrow(
      /ainda nao foi distribuido/,
    );
  });

  /**
   * A recusa acontece ANTES de qualquer escrita. Se ela viesse depois, um
   * advogado sem atribuicao deixaria trilha de transicao num pedido alheio antes
   * de tomar o 403.
   */
  it('nao escreve nada ao recusar', async () => {
    const { banco, entregaveis } = await montar(2, { atribuirA: null });
    const antes = banco.escritas.length;

    await expect(entregaveis.iniciarTrabalho(ALVO, ADVOGADO)).rejects.toThrow();

    expect(banco.escritas).toHaveLength(antes);
  });

  /**
   * A conferencia e sobre o ADVOGADO, e nao sobre "quem nao e o cliente". O
   * cliente do pedido continua sem caminho para os eventos do advogado — o estado
   * de origem ja o barra, e este teste registra que a trava do advogado nao abriu
   * uma porta lateral para ele.
   */
  it('o cliente nao vira advogado por estar no proprio pedido', async () => {
    const { entregaveis } = await montar();
    await expect(entregaveis.iniciarTrabalho(ALVO, CLIENTE)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
