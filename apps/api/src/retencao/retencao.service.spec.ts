import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { FirestoreFalso } from '../firestore-falso.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { RetencaoService } from './retencao.service.js';

const ENTREGUE_EM = new Date('2026-09-01T12:00:00.000Z');
const dias = (n: number): Date =>
  new Date(ENTREGUE_EM.getTime() + n * 86_400_000);

interface Arranjo {
  banco: FirestoreFalso;
  armazenamento: ArmazenamentoFalso;
  despachados: string[];
  retencao: RetencaoService;
}

function montar(
  opcoes: {
    retencaoEm?: Date | null;
    jaAvisado?: boolean;
    estadosDosEntregaveis?: string[];
  } = {},
): Arranjo {
  const banco = new FirestoreFalso();
  const despachados: string[] = [];

  banco.documentos.set('pedidos/pedido-1', {
    clienteId: 'uid-clara',
    advogadoId: 'uid-ana',
    distribuido: true,
    retencaoEm:
      opcoes.retencaoEm === undefined
        ? Timestamp.fromDate(ENTREGUE_EM)
        : opcoes.retencaoEm === null
          ? null
          : Timestamp.fromDate(opcoes.retencaoEm),
    retencaoPendente: opcoes.retencaoEm !== null,
    avisoDeExclusaoEnviado: opcoes.jaAvisado ?? false,
  });

  const estados = opcoes.estadosDosEntregaveis ?? ['entregue'];
  estados.forEach((estado, indice) => {
    const id = String(indice + 1).padStart(3, '0');
    banco.documentos.set(`pedidos/pedido-1/entregaveis/${id}`, {
      nome: `Entregavel ${id}`,
      ordem: indice + 1,
      estado,
      revisoesUsadas: 0,
      transicoes: 1,
      arquivoAtual: {
        nome: 'parecer.pdf',
        tipo: 'application/pdf',
        tamanhoBytes: 100,
        versao: 1,
        estado: 'limpo',
        caminho: `entregaveis/pedido-1/${id}/v1`,
        enviadoPor: 'uid-ana',
        enviadoEm: 1,
      },
    });
  });

  const armazenamento = new ArmazenamentoFalso();
  estados.forEach((_estado, indice) => {
    const id = String(indice + 1).padStart(3, '0');
    armazenamento.semear(
      { balde: 'arquivos', caminho: `entregaveis/pedido-1/${id}/v1` },
      new Uint8Array([1]),
    );
  });

  const despachante = {
    despachar: (id: string) => {
      despachados.push(id);
      return Promise.resolve();
    },
  } as unknown as DespachanteOutbox;

  return {
    banco,
    armazenamento,
    despachados,
    retencao: new RetencaoService(
      banco as unknown as Firestore,
      armazenamento,
      new OutboxService(banco as unknown as Firestore, { atrasoDoVarredorMs: 0, arrendamentoMs: 60_000, loteDoVarredor: 100 }),
      despachante,
    ),
  };
}

describe('RetencaoService', () => {
  describe('o aviso vem ANTES da exclusao', () => {
    /**
     * A secao 13 da arquitetura e explicita: "disparar o aviso antes de executar
     * a exclusao de fato — nao simultaneamente". Sao duas passagens do mesmo job,
     * em dias diferentes.
     */
    it('no 23o dia avisa, e nao exclui', async () => {
      const { retencao, armazenamento } = montar();

      const resumo = await retencao.executarPassagem(dias(23));

      expect(resumo).toMatchObject({ avisados: 1, excluidos: 0 });
      expect(armazenamento.caminhos).toHaveLength(1);
    });

    it('no 30o dia exclui', async () => {
      const { retencao, armazenamento } = montar({ jaAvisado: true });

      const resumo = await retencao.executarPassagem(dias(30));

      expect(resumo).toMatchObject({ avisados: 0, excluidos: 1 });
      expect(armazenamento.caminhos).toEqual([]);
    });

    it('antes da janela, nao faz nada', async () => {
      const { retencao, despachados, armazenamento } = montar();

      const resumo = await retencao.executarPassagem(dias(10));

      expect(resumo).toMatchObject({ avisados: 0, excluidos: 0 });
      expect(despachados).toEqual([]);
      expect(armazenamento.caminhos).toHaveLength(1);
    });

    it('nao avisa duas vezes', async () => {
      const { retencao, despachados } = montar({ jaAvisado: true });

      await retencao.executarPassagem(dias(25));

      expect(despachados).toEqual([]);
    });
  });

  describe('o aviso nasce no outbox', () => {
    /**
     * Regra inviolavel 3: a notificacao nasce na MESMA transacao que produz o
     * fato. Sem isso, existiria estado em que o pedido consta como avisado e o
     * e-mail nunca saiu — e o titular perderia o aviso previo que a secao 13
     * exige.
     */
    it('grava o evento e marca o pedido na mesma transacao', async () => {
      const { banco, retencao } = montar();

      await retencao.executarPassagem(dias(23));

      const escritas = banco.escritas;
      const evento = escritas.findIndex((l) => l.includes('outbox/'));
      const marca = escritas.findIndex((l) => l.includes('pedidos/pedido-1'));

      expect(evento).toBeGreaterThanOrEqual(0);
      expect(marca).toBeGreaterThanOrEqual(0);
      expect(
        banco.documentos.get('pedidos/pedido-1')?.['avisoDeExclusaoEnviado'],
      ).toBe(true);
    });

    /** O despacho acontece DEPOIS do commit (regra inviolavel 2). */
    it('despacha depois de gravar', async () => {
      const { retencao, despachados } = montar();

      await retencao.executarPassagem(dias(23));

      expect(despachados).toHaveLength(1);
      expect(despachados[0]).toContain('aviso-exclusao');
    });
  });

  describe('o que a exclusao apaga', () => {
    /**
     * O ARQUIVO sai; o DOCUMENTO fica. O registro de que houve um entregavel,
     * quando foi entregue e por quem e trilha de auditoria (arquitetura 5.6), e
     * apaga-lo seria outra decisao, tomada por outra pessoa.
     */
    it('apaga o objeto e zera o arquivoAtual, mantendo o entregavel', async () => {
      const { banco, retencao, armazenamento } = montar({ jaAvisado: true });

      await retencao.executarPassagem(dias(30));

      expect(armazenamento.caminhos).toEqual([]);
      const entregavel = banco.documentos.get(
        'pedidos/pedido-1/entregaveis/001',
      );
      expect(entregavel).toBeDefined();
      expect(entregavel?.['arquivoAtual']).toBeNull();
    });

    it('nao volta a excluir na passagem seguinte', async () => {
      const { retencao } = montar({ jaAvisado: true });

      await retencao.executarPassagem(dias(30));
      const segunda = await retencao.executarPassagem(dias(31));

      expect(segunda.excluidos).toBe(0);
    });
  });

  describe('marcarSeFechou', () => {
    it('marca quando TODOS os entregaveis chegam a entregue', async () => {
      const { banco, retencao } = montar({
        retencaoEm: null,
        estadosDosEntregaveis: ['entregue', 'entregue'],
      });

      expect(await retencao.marcarSeFechou('pedido-1')).toBe(true);
      expect(
        banco.documentos.get('pedidos/pedido-1')?.['retencaoPendente'],
      ).toBe(true);
    });

    /** UM entregavel em aberto segura o pedido inteiro — e o gatilho decidido na
     * reuniao: o "fim do contrato" e quando todos chegam a `entregue`. */
    it('nao marca com um entregavel em aberto', async () => {
      const { retencao } = montar({
        retencaoEm: null,
        estadosDosEntregaveis: ['entregue', 'em_elaboracao'],
      });

      expect(await retencao.marcarSeFechou('pedido-1')).toBe(false);
    });

    it('nao marca pedido sem entregavel nenhum', async () => {
      const { retencao } = montar({
        retencaoEm: null,
        estadosDosEntregaveis: [],
      });

      expect(await retencao.marcarSeFechou('pedido-1')).toBe(false);
    });
  });
});
