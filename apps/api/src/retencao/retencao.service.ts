import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { acaoDeRetencao, avisarEm, podeSerServido } from 'shared';
import {
  ARMAZENAMENTO,
  type Armazenamento,
} from '../armazenamento/armazenamento.js';
import { baldeDoEstado } from '../arquivos/arquivo.js';
import {
  caminhoDaVersao,
  SUBCOLECAO_ENTREGAVEIS,
  type ArquivoEntregavel,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { contestacaoAberta } from '../pedidos/pausa.js';
import {
  COLECAO_PEDIDOS,
  SUBCOLECAO_ANEXOS,
  type DocumentoPedido,
} from '../pedidos/pedido.js';

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
 * passagens do mesmo job, em dias diferentes: `avisar` no 23o dia (7 antes),
 * `excluir` no 30o — e NUNCA sem aviso: o pedido visto atrasado e avisado
 * primeiro e excluido sete dias depois. `acaoDeRetencao`, em `packages/shared`, e quem decide — funcao pura,
 * testada, porque aritmetica de data e onde este tipo de rotina erra em silencio.
 *
 * OS ANEXOS DO CLIENTE SAEM NO MESMO CICLO (decisoes.md, 2.3): 30 dias depois
 * de todos os entregaveis do pedido chegarem a `entregue`, avisados no mesmo
 * e-mail. Anexo ligado ao cliente, e nao ao pedido, nao existe hoje — so ha
 * `pedidos/{id}/anexos`; se um dia existir, a regra decidida e contar do fim do
 * ultimo pedido do cliente.
 *
 * O PONTO DE PARTIDA E `pedidos.retencaoEm`, escrito pela transacao que leva o
 * ULTIMO entregavel a `entregue` (`EntregaveisService`). Ate o Bloco D da B2
 * ninguem o escrevia, e a retencao nunca rodou sobre pedido nenhum.
 *
 * CONTESTACAO ABERTA SUSPENDE TUDO (decisoes.md, 5.4): o pedido pausado nao e
 * avisado nem tem arquivo excluido. Os arquivos sao parte da prova.
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
      if (contestacaoAberta(pedido)) continue;

      const acao = acaoDeRetencao(
        paraData(pedido.retencaoEm),
        avisadoEm(pedido),
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

    /*
     * `sinal: 'retencao.passagem'` e o que a politica de AUSENCIA "Retencao
     * parada" le (achado 4.5 do Bloco E). A linha so sai quando a passagem chega
     * aqui: uma que quebra no meio nao emite, e o silencio e o sinal.
     */
    this.log.log(
      `retencao: ${String(pagina.size)} examinado(s), ${String(avisados)} avisado(s), ${String(excluidos)} excluido(s)`,
      {
        sinal: 'retencao.passagem',
        examinados: pagina.size,
        avisados,
        excluidos,
      },
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
        pedidoId,
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
   * Apaga os OBJETOS dos entregaveis e dos anexos do cliente, e zera o
   * `arquivoAtual`.
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

      await this.excluirTodasAsVersoes(pedidoId, documento.id, arquivo);

      await documento.ref.update({
        arquivoAtual: null,
        arquivoExcluidoEm: FieldValue.serverTimestamp(),
      });
    }

    await this.excluirAnexos(referencia);

    await referencia.update({
      retencaoPendente: false,
      arquivosExcluidosEm: FieldValue.serverTimestamp(),
    });

    this.log.log(`arquivos do pedido ${pedidoId} excluidos por retencao`);
  }

  /**
   * TODAS as versoes do arquivo do entregavel, e nao so o `arquivoAtual`.
   *
   * Cada revisao e um objeto proprio (`caminhoDaVersao`). Apagar so a atual
   * deixava `v1 ... v{n-1}` vivas no bucket, sem prazo nenhum (achado 4.1 do
   * Bloco E). As duas passadas por balde existem porque uma versao recusada pela
   * varredura, ou ainda nao varrida, ficou na quarentena. `excluir` ignora
   * objeto ausente, entao a passagem e idempotente.
   *
   * O caminho atual e apagado pelo que esta gravado, alem do derivado: se um
   * dia os dois divergirem, o que o documento aponta nao pode sobrar.
   */
  private async excluirTodasAsVersoes(
    pedidoId: string,
    entregavelId: string,
    atual: ArquivoEntregavel,
  ): Promise<void> {
    await this.armazenamento.excluir({
      balde: baldeDoEstado(atual.estado),
      caminho: atual.caminho,
    });

    for (let versao = 1; versao <= atual.versao; versao += 1) {
      const caminho = caminhoDaVersao({ pedidoId, entregavelId }, versao);
      for (const balde of ['arquivos', 'quarentena'] as const) {
        await this.armazenamento.excluir({ balde, caminho });
      }
    }
  }

  /**
   * Os anexos do cliente (RG, cartao CNPJ e afins), nos dois baldes: o que
   * passou pela varredura esta em `arquivos`, o que nao passou ficou na
   * quarentena. `excluir` ignora objeto ausente, entao a passagem repetida e
   * inofensiva. O documento fica, com `excluido`, como trilha.
   */
  private async excluirAnexos(pedido: DocumentReference): Promise<void> {
    const anexos = await pedido.collection(SUBCOLECAO_ANEXOS).get();
    for (const documento of anexos.docs) {
      const anexo = documento.data() as { caminho?: string; estado?: string };
      if (anexo.estado === 'excluido') continue;
      if (anexo.caminho !== undefined) {
        for (const balde of ['arquivos', 'quarentena'] as const) {
          await this.armazenamento.excluir({ balde, caminho: anexo.caminho });
        }
      }
      await documento.ref.update({
        estado: 'excluido',
        arquivoExcluidoEm: FieldValue.serverTimestamp(),
      });
    }
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

/**
 * Quando o aviso saiu. Marcado como avisado sem o carimbo (dado anterior a este
 * campo) conta como avisado na data em que o aviso devia sair: usar "agora" no
 * lugar adiaria a exclusao a cada passagem, para sempre.
 */
function avisadoEm(pedido: DocumentoPedido): Date | null {
  if (pedido.avisoDeExclusaoEnviado !== true) return null;
  return paraData(pedido.avisadoEm) ?? avisarEm(paraData(pedido.retencaoEm));
}
