import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { NovoProduto } from 'shared';
import { AlertaFalso } from '../alertas/alerta.js';
import { comSnapshot } from '../arnes-pedidos.js';
import { FirestoreFalso } from '../firestore-falso.js';
import type { EnfileiradorDeEventos } from '../outbox/enfileirador.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { configuracaoDoOutbox } from '../outbox/politica.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { ConfirmacaoDeEstornoService } from './confirmacao-estorno.service.js';
import { EstornosService } from './estornos.service.js';

const ADMIN = 'uid-admin';
const CLIENTE = 'uid-ana';
const PAGAMENTO = 'pix_char_1';

const PARECER: NovoProduto = {
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico das rotinas atuais.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF', 'Plano de acao'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 15,
  numeroRevisoesPermitidas: 2,
};

interface Arranjo {
  banco: FirestoreFalso;
  estornos: EstornosService;
  confirmacao: ConfirmacaoDeEstornoService;
  alertas: AlertaFalso;
  enfileirados: string[];
}

/** Um pagamento confirmado com `quantidade` pedidos do mesmo produto. */
async function montar(quantidade = 2): Promise<Arranjo> {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  const pedidos = new PedidosService(db);
  const { id: produto } = await new ProdutosService(db).criar(PARECER, ADMIN);

  const itens = Array.from({ length: quantidade }, (_v, i) => ({
    pedidoId: `pedido-${String(i + 1)}`,
    clienteId: CLIENTE,
    pagamentoId: PAGAMENTO,
    produtoOrigemId: produto,
  }));
  const congelados = await comSnapshot(pedidos, itens);
  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(
      transacao as unknown as Transaction,
      pedidos.preparar(congelados),
    );
  });
  await banco
    .collection('pagamentos')
    .doc(PAGAMENTO)
    .set({
      situacao: 'confirmado',
      cobrancaId: PAGAMENTO,
      origem: 'transparente',
      valorCentavos: 250_000 * quantidade,
    });

  const enfileirados: string[] = [];
  const alertas = new AlertaFalso();
  return {
    banco,
    alertas,
    enfileirados,
    estornos: new EstornosService(
      db,
      new OutboxService(db, configuracaoDoOutbox({})),
      {
        enfileirarPorId: (id: string) => {
          enfileirados.push(id);
          return Promise.resolve();
        },
      } as unknown as EnfileiradorDeEventos,
    ),
    confirmacao: new ConfirmacaoDeEstornoService(db, alertas),
  };
}

function documento(arranjo: Arranjo, caminho: string): Record<string, unknown> {
  return arranjo.banco.documentos.get(caminho) ?? {};
}

async function iniciarTrabalho(
  arranjo: Arranjo,
  pedidoId: string,
): Promise<void> {
  await arranjo.banco
    .collection('pedidos')
    .doc(pedidoId)
    .collection('entregaveis')
    .doc('001')
    .update({ estado: 'em_elaboracao' });
}

describe('EstornosService (ADR-12)', () => {
  describe('elegibilidade, validada no servidor', () => {
    it('estorna o pedido em solicitado', async () => {
      const arranjo = await montar();

      const resumo = await arranjo.estornos.estornar(
        'pedido-1',
        'Desistiu',
        ADMIN,
      );

      expect(resumo).toMatchObject({
        pedidoId: 'pedido-1',
        pagamentoId: PAGAMENTO,
        valorCentavos: 250_000,
        produto: PARECER.nome,
        motivo: 'Desistiu',
      });
      expect(documento(arranjo, 'pedidos/pedido-1')).toMatchObject({
        situacao: 'estornado',
        estornadoPor: ADMIN,
      });
    });

    /**
     * CRITERIO DE ACEITE DA ETAPA 8: com um entregavel em `em_elaboracao`, o
     * estorno e recusado — e nada e escrito.
     */
    it('recusa com 409 o pedido com trabalho iniciado, sem escrever nada', async () => {
      const arranjo = await montar();
      await iniciarTrabalho(arranjo, 'pedido-1');
      const escritas = arranjo.banco.escritas.length;

      await expect(
        arranjo.estornos.estornar('pedido-1', 'Desistiu', ADMIN),
      ).rejects.toThrow(ConflictException);

      expect(arranjo.banco.escritas.length).toBe(escritas);
      expect(documento(arranjo, 'pedidos/pedido-1')['situacao']).toBe('ativo');
    });

    it('estorna pedido cancelado pelo cliente', async () => {
      const arranjo = await montar();
      await arranjo.banco
        .collection('pedidos')
        .doc('pedido-1')
        .update({ situacao: 'cancelado' });

      await expect(
        arranjo.estornos.estornar('pedido-1', 'Pediu o dinheiro', ADMIN),
      ).resolves.toMatchObject({ execucao: 'manual_pendente' });
    });

    it('recusa estornar duas vezes', async () => {
      const arranjo = await montar();
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);

      await expect(
        arranjo.estornos.estornar('pedido-1', 'x2x', ADMIN),
      ).rejects.toThrow('ja foi estornado');
    });

    it('pedido inexistente e 404', async () => {
      const arranjo = await montar();

      await expect(
        arranjo.estornos.estornar('nao-existe', 'x1x', ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('manual ou integral (o gateway so estorna a cobranca inteira)', () => {
    /** Um de dois pedidos: o escritorio devolve por fora, e o outro fica intacto. */
    it('pedido isolado fica pendente de devolucao manual, sem outbox', async () => {
      const arranjo = await montar();

      const resumo = await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);

      expect(resumo.execucao).toBe('manual_pendente');
      expect(arranjo.enfileirados).toEqual([]);
      expect(documento(arranjo, 'pedidos/pedido-2')['situacao']).toBe('ativo');
      expect(await arranjo.estornos.listarPendentes()).toHaveLength(1);
    });

    it('o ultimo pedido da cobranca pede o estorno integral pelo outbox', async () => {
      const arranjo = await montar();
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);

      const resumo = await arranjo.estornos.estornar('pedido-2', 'x2x', ADMIN);

      expect(resumo.execucao).toBe('gateway_pendente');
      expect(arranjo.enfileirados).toEqual([`estorno-integral_${PAGAMENTO}`]);
      expect(
        documento(arranjo, `outbox/estorno-integral_${PAGAMENTO}`),
      ).toMatchObject({
        tipo: 'estorno-integral',
        destinatarioUid: CLIENTE,
        estorno: {
          pagamentoId: PAGAMENTO,
          cobrancaId: PAGAMENTO,
          origem: 'transparente',
        },
      });
      /* O pendente manual foi absorvido pelo integral. */
      expect(documento(arranjo, 'estornos/pedido-1')['execucao']).toBe(
        'gateway_pendente',
      );
      expect(
        documento(arranjo, `pagamentos/${PAGAMENTO}`)['estornoGateway'],
      ).toBe('solicitado');
      expect(await arranjo.estornos.listarPendentes()).toEqual([]);
    });

    it('carrinho de um pedido so vai direto para o integral', async () => {
      const arranjo = await montar(1);

      await expect(
        arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN),
      ).resolves.toMatchObject({ execucao: 'gateway_pendente' });
    });

    /**
     * DINHEIRO NAO VOLTA DUAS VEZES. Um pedido ja devolvido a mao impede o integral:
     * o integral devolveria a cobranca inteira, inclusive o que o escritorio ja
     * devolveu.
     */
    it('estorno ja devolvido a mao impede o integral', async () => {
      const arranjo = await montar();
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);
      await arranjo.estornos.registrarExecucaoManual(
        'pedido-1',
        ADMIN,
        'Pix feito',
      );

      const resumo = await arranjo.estornos.estornar('pedido-2', 'x2x', ADMIN);

      expect(resumo.execucao).toBe('manual_pendente');
      expect(arranjo.enfileirados).toEqual([]);
    });

    it('com um irmao ainda ativo nao e integral', async () => {
      const arranjo = await montar(3);
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);

      const resumo = await arranjo.estornos.estornar('pedido-2', 'x2x', ADMIN);

      expect(resumo.execucao).toBe('manual_pendente');
    });

    it('pagamento que nao esta confirmado nao pede integral', async () => {
      const arranjo = await montar(1);
      await arranjo.banco
        .collection('pagamentos')
        .doc(PAGAMENTO)
        .update({ situacao: 'divergente' });

      await expect(
        arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN),
      ).resolves.toMatchObject({ execucao: 'manual_pendente' });
    });
  });

  describe('devolucao manual', () => {
    it('registra quem devolveu e sai da lista de pendentes', async () => {
      const arranjo = await montar();
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);

      const resumo = await arranjo.estornos.registrarExecucaoManual(
        'pedido-1',
        'uid-outro-admin',
        'Pix de volta',
      );

      expect(resumo.execucao).toBe('manual_executado');
      expect(documento(arranjo, 'estornos/pedido-1')).toMatchObject({
        executadoPor: 'uid-outro-admin',
        observacao: 'Pix de volta',
      });
      expect(await arranjo.estornos.listarPendentes()).toEqual([]);
    });

    it('recusa registrar o que nao esta pendente de devolucao manual', async () => {
      const arranjo = await montar(1);
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);

      await expect(
        arranjo.estornos.registrarExecucaoManual('pedido-1', ADMIN, ''),
      ).rejects.toThrow(ConflictException);
    });

    it('estorno inexistente e 404', async () => {
      const arranjo = await montar();

      await expect(
        arranjo.estornos.registrarExecucaoManual('pedido-1', ADMIN, ''),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmacao do estorno pelo webhook', () => {
    it('confirma os estornos integrais pendentes', async () => {
      const arranjo = await montar(1);
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);

      expect(await arranjo.confirmacao.confirmar(PAGAMENTO)).toBe('confirmado');

      expect(documento(arranjo, 'estornos/pedido-1')['execucao']).toBe(
        'gateway_confirmado',
      );
      expect(
        documento(arranjo, `pagamentos/${PAGAMENTO}`)['estornoGateway'],
      ).toBe('confirmado');
    });

    /** CRITERIO DA REVISAO: `*.refunded` reentregue nao duplica a execucao. */
    it('o evento reentregue e duplicata, sem escrita', async () => {
      const arranjo = await montar(1);
      await arranjo.estornos.estornar('pedido-1', 'x1x', ADMIN);
      await arranjo.confirmacao.confirmar(PAGAMENTO);
      const escritas = arranjo.banco.escritas.length;

      expect(await arranjo.confirmacao.confirmar(PAGAMENTO)).toBe('duplicata');
      expect(arranjo.banco.escritas.length).toBe(escritas);
    });

    it('estorno feito fora da plataforma marca o pagamento e avisa', async () => {
      const arranjo = await montar();

      expect(await arranjo.confirmacao.confirmar(PAGAMENTO)).toBe('externo');
      expect(documento(arranjo, 'pedidos/pedido-1')['situacao']).toBe('ativo');
      expect(arranjo.alertas.emitidos).toMatchObject([
        { nivel: 'aviso', assunto: 'pagamento.estorno-externo' },
      ]);
    });

    it('cobranca desconhecida e ignorada, com aviso', async () => {
      const arranjo = await montar();

      expect(await arranjo.confirmacao.confirmar('nao-existe')).toBe(
        'ignorado',
      );
      expect(arranjo.alertas.emitidos[0]?.assunto).toBe(
        'pagamento.estorno-ignorado',
      );
    });
  });
});
