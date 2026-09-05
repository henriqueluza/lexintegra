import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { EstadoEntregavel, NovoProduto } from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { EntregaveisService } from './entregaveis.service.js';

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
};

interface Arranjo {
  banco: FirestoreFalso;
  entregaveis: EntregaveisService;
}

async function montar(revisoes = 2): Promise<Arranjo> {
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
      await pedidos.preparar(tr, [
        {
          pedidoId: 'pedido-1',
          clienteId: CLIENTE,
          pagamentoId: 'pagamento-1',
          produtoOrigemId,
        },
      ]),
    );
  });

  return {
    banco,
    entregaveis: new EntregaveisService(banco as unknown as Firestore),
  };
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

      const final = await entregaveis.confirmarEntrega(ALVO, CLIENTE);
      expect(final.estado).toBe('entregue');
      expect(estado(banco)).toBe('entregue');
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
          await pedidos.preparar(tr, [
            {
              pedidoId: 'pedido-1',
              clienteId: CLIENTE,
              pagamentoId: 'pagamento-1',
              produtoOrigemId,
            },
          ]),
        );
      });
      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
      await entregaveis.registrarArquivo(
        ALVO,
        { nome: 'minuta.pdf' },
        ADVOGADO,
      );

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
