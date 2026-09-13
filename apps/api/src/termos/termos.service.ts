import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module.js';

export const COLECAO_ACEITES = 'aceites-de-termos';

/**
 * A VERSAO DO TEXTO ACEITO.
 *
 * ⚠️ O TEXTO DO TERMO AINDA NAO FOI APROVADO. O plano de execucao, Etapa 11,
 * lista "aprovar o texto do termo de aceite exigido antes do download" como item
 * que so a CONTRATANTE pode fazer — e peca juridica, nao copy. O texto vive em
 * `termos.textos.ts`, marcado, e esta constante e a versao dele.
 *
 * Versionar o aceite nao e enfeite: se o termo mudar, os aceites antigos
 * continuam sendo prova do que foi aceito NAQUELE texto. Sem versao, uma revisao
 * do termo reescreveria retroativamente o que todo mundo concordou.
 */
export const VERSAO_DO_TERMO = 'v1-nao-aprovado';

interface DocumentoAceite {
  usuarioUid: string;
  pedidoId: string;
  entregavelId: string;
  /** A versao do ARQUIVO, nao a do termo: cada versao nova do entregavel exige
   * aceite proprio (ver a nota em `registrar`). */
  versaoArquivo: number;
  versaoTermo: string;
  aceitoEm: FieldValue;
}

/**
 * O gate de aceite dos termos antes do download (arquitetura 7.3).
 *
 * "O aceite deve ser registrado com timestamp e associado ao usuario e ao
 * arquivo especifico — e evidencia de conformidade, nao so UX." Por isso o
 * registro e por (usuario, pedido, entregavel, VERSAO DO ARQUIVO), e nao um
 * "aceitei os termos" global na conta.
 */
@Injectable()
export class TermosService {
  private readonly log = new Logger('Termos');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * ID deterministico (regra inviolavel 4): clicar duas vezes em "aceito" grava
   * o mesmo documento, e nao dois aceites do mesmo texto pela mesma pessoa.
   *
   * A VERSAO DO ARQUIVO ENTRA NO ID, e e a decisao menos obvia daqui. Cada
   * upload do advogado produz uma versao nova (ADR-11) — potencialmente com
   * conteudo diferente do que foi aceito. Reaproveitar o aceite da versao
   * anterior faria a evidencia de conformidade apontar para um arquivo que o
   * cliente nunca viu.
   */
  private id(
    uid: string,
    pedidoId: string,
    entregavelId: string,
    versaoArquivo: number,
  ): string {
    return `${uid}_${pedidoId}_${entregavelId}_v${String(versaoArquivo)}`;
  }

  async registrar(dados: {
    usuarioUid: string;
    pedidoId: string;
    entregavelId: string;
    versaoArquivo: number;
  }): Promise<void> {
    const id = this.id(
      dados.usuarioUid,
      dados.pedidoId,
      dados.entregavelId,
      dados.versaoArquivo,
    );

    /*
     * `set` com merge e nao `create`: o segundo clique nao pode estourar. O
     * carimbo do primeiro aceite e o que vale, e `merge` sobre um documento
     * existente com os mesmos campos o mantem coerente.
     */
    await this.db
      .collection(COLECAO_ACEITES)
      .doc(id)
      .set(
        {
          usuarioUid: dados.usuarioUid,
          pedidoId: dados.pedidoId,
          entregavelId: dados.entregavelId,
          versaoArquivo: dados.versaoArquivo,
          versaoTermo: VERSAO_DO_TERMO,
          aceitoEm: FieldValue.serverTimestamp(),
        } satisfies DocumentoAceite,
        { merge: true },
      );

    this.log.log(
      `aceite registrado para ${dados.pedidoId}/${dados.entregavelId} v${String(dados.versaoArquivo)}`,
    );
  }

  async jaAceitou(dados: {
    usuarioUid: string;
    pedidoId: string;
    entregavelId: string;
    versaoArquivo: number;
  }): Promise<boolean> {
    const documento = await this.db
      .collection(COLECAO_ACEITES)
      .doc(
        this.id(
          dados.usuarioUid,
          dados.pedidoId,
          dados.entregavelId,
          dados.versaoArquivo,
        ),
      )
      .get();

    return documento.exists;
  }
}
