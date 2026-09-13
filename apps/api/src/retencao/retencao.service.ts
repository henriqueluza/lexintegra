import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import { acaoDeRetencao, podeSerServido } from 'shared';
import {
  ARMAZENAMENTO,
  type Armazenamento,
} from '../armazenamento/armazenamento.js';
import { baldeDoEstado } from '../arquivos/arquivo.js';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from '../pedidos/pedido.js';

const TETO_POR_PASSAGEM = 200;

export interface ResumoDaPassagem {
  readonly avisados: number;
  readonly excluidos: number;
  readonly examinados: number;
}

/**
 * A retencao de 30 dias dos entregaveis (arquitetura 7.3 e secao 13).
 *
 * O GATILHO E O ESTADO DO PEDIDO, e nao a idade do objeto — por isso a regra
 * nativa de ciclo de vida do Cloud Storage nao basta sozinha: ela so conhece a
 * idade, e a contagem comeca quando TODOS os entregaveis do pedido chegam a
 * `entregue` (ADR-11, decidido na reuniao).
 *
 * O AVISO VEM ANTES DA EXCLUSAO, e nao junto. A secao 13 e explicita. Sao duas
 * passagens do mesmo job, em dias diferentes: `avisar` no 23o dia, `excluir` no
 * 30o. `acaoDeRetencao`, em `packages/shared`, e quem decide — funcao pura,
 * testada, porque aritmetica de data e onde este tipo de rotina erra em silencio.
 *
 * OS ANEXOS DO CLIENTE NAO SAO TOCADOS. Os 30 dias sao dos ENTREGAVEIS
 * (arquitetura 7.3); a retencao dos arquivos de apoio do cliente nao esta
 * definida em lugar nenhum, e apagar documento de identificacao por conta propria
 * nao e um default que se inventa. Fica como pendencia do controlador.
 */
@Injectable()
export class RetencaoService {
  private readonly log = new Logger('Retencao');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
    private readonly outbox: OutboxService,
    private readonly despachante: DespachanteOutbox,
  ) {}

  async executarPassagem(agora = new Date()): Promise<ResumoDaPassagem> {
    /*
     * IGUALDADE NUM BOOLEANO, e nao `where('retencaoEm', '!=', null)`.
     *
     * E a mesma armadilha do `distribuido` na Etapa 9: no Firestore, uma consulta
     * de desigualdade contra `null` exclui os documentos em que o campo esta
     * AUSENTE — e todo pedido criado antes deste campo existir cairia fora da
     * varredura, sem erro nenhum. O sintoma seria arquivo retido para sempre.
     *
     * `retencaoPendente` e escrito sempre: `true` quando o pedido fecha, `false`
     * quando os arquivos saem.
     */
    const pagina = await this.db
      .collection(COLECAO_PEDIDOS)
      .where('retencaoPendente', '==', true)
      .limit(TETO_POR_PASSAGEM)
      .get();

    let avisados = 0;
    let excluidos = 0;

    for (const documento of pagina.docs) {
      const pedido = documento.data() as DocumentoPedido;
      const entregueEm = paraData(pedido.retencaoEm);

      const acao = acaoDeRetencao(
        entregueEm,
        pedido.avisoDeExclusaoEnviado === true,
        agora,
      );

      if (acao === 'avisar') {
        await this.avisar(documento.id, pedido.clienteId);
        avisados += 1;
      } else if (acao === 'excluir') {
        await this.excluir(documento.id);
        excluidos += 1;
      }
    }

    this.log.log(
      `retencao: ${String(pagina.size)} examinado(s), ${String(avisados)} avisado(s), ${String(excluidos)} excluido(s)`,
    );

    return { avisados, excluidos, examinados: pagina.size };
  }

  /**
   * O aviso nasce no OUTBOX, na mesma transacao que marca o pedido como avisado
   * (regra inviolavel 3). Sem isso, existiria estado em que o pedido consta como
   * avisado e o e-mail nunca saiu — e o titular perderia o aviso previo que a
   * secao 13 exige.
   */
  private async avisar(pedidoId: string, clienteId: string): Promise<void> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);

    const idEvento = await this.db.runTransaction(async (transacao) => {
      const id = await this.outbox.registrarSeAusente(transacao, {
        tipo: 'aviso-exclusao-arquivos',
        destinatarioUid: clienteId,
      });

      transacao.update(referencia, {
        avisoDeExclusaoEnviado: true,
        avisadoEm: FieldValue.serverTimestamp(),
      });

      return id;
    });

    // Depois do commit, nunca dentro (regra inviolavel 2).
    await this.despachante.despachar(idEvento);
  }

  /**
   * Apaga os OBJETOS dos entregaveis e zera o `arquivoAtual`.
   *
   * O DOCUMENTO DO PEDIDO E DO ENTREGAVEL FICAM. O que a politica de retencao
   * cobre e o ARQUIVO — o registro de que houve um entregavel, quando foi
   * entregue e por quem e trilha de auditoria (arquitetura 5.6), e apaga-lo seria
   * outra decisao, tomada por outra pessoa.
   */
  private async excluir(pedidoId: string): Promise<void> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const entregaveis = await referencia
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .get();

    for (const documento of entregaveis.docs) {
      const arquivo = (documento.data() as DocumentoEntregavel).arquivoAtual;
      if (arquivo === null || arquivo === undefined) continue;

      await this.armazenamento.excluir({
        balde: baldeDoEstado(arquivo.estado),
        caminho: arquivo.caminho,
      });

      await documento.ref.update({
        arquivoAtual: null,
        arquivoExcluidoEm: FieldValue.serverTimestamp(),
      });
    }

    await referencia.update({
      retencaoPendente: false,
      arquivosExcluidosEm: FieldValue.serverTimestamp(),
    });

    this.log.log(`arquivos do pedido ${pedidoId} excluidos por retencao`);
  }

  /**
   * Marca o pedido como fechado quando TODOS os entregaveis chegam a `entregue`.
   *
   * Chamado pelo fluxo de confirmacao, e nao calculado pelo job: varrer todos os
   * pedidos abertos a cada passagem para descobrir quais fecharam seria trabalho
   * proporcional ao total, e nao ao que mudou.
   */
  async marcarSeFechou(pedidoId: string): Promise<boolean> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const entregaveis = await referencia
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .get();

    const todosEntregues =
      entregaveis.size > 0 &&
      entregaveis.docs.every(
        (documento) =>
          (documento.data() as DocumentoEntregavel).estado === 'entregue',
      );

    if (!todosEntregues) return false;

    await referencia.update({
      retencaoEm: FieldValue.serverTimestamp(),
      retencaoPendente: true,
    });
    this.log.log(`pedido ${pedidoId} fechou; retencao de 30 dias iniciada`);
    return true;
  }

  /** Só para o painel: quantos arquivos estao parados em quarentena. */
  async arquivosNaoServiveis(pedidoId: string): Promise<number> {
    const entregaveis = await this.db
      .collection(COLECAO_PEDIDOS)
      .doc(pedidoId)
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .get();

    return entregaveis.docs.filter((documento) => {
      const arquivo = (documento.data() as DocumentoEntregavel).arquivoAtual;
      return (
        arquivo !== null &&
        arquivo !== undefined &&
        !podeSerServido(arquivo.estado)
      );
    }).length;
  }
}

function paraData(valor: unknown): Date | null {
  return valor instanceof Timestamp ? valor.toDate() : null;
}
