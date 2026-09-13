import { Inject, Injectable, Logger } from '@nestjs/common';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  BYTES_NECESSARIOS,
  conteudoBateComTipo,
  type EstadoArquivo,
} from 'shared';
import {
  ARMAZENAMENTO,
  type Armazenamento,
  type Objeto,
} from '../armazenamento/armazenamento.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  SUBCOLECAO_ENTREGAVEIS,
  type DocumentoEntregavel,
} from '../entregaveis/entregavel.js';
import { COLECAO_PEDIDOS, SUBCOLECAO_ANEXOS } from '../pedidos/pedido.js';
import type { TarefaDeVarredura } from './fila.js';
import { SCANNER, type Scanner } from './scanner.js';

/**
 * O que a API faz com o veredito (ADR-18).
 *
 * O FLUXO INTEIRO: Cloud Tasks chama esta API, a API chama o scanner, e a API
 * decide. O scanner nunca escreve no banco — ele recebe um caminho e devolve um
 * veredito (ver `scanner.ts`).
 *
 * SAO DUAS CONFERENCIAS, E ELAS RESPONDEM PERGUNTAS DIFERENTES:
 *
 *   1. O ClamAV responde "tem malware conhecido?".
 *   2. Os magic bytes respondem "isto e mesmo um PDF?".
 *
 * Nenhuma cobre a outra. Um HTML com extensao `.pdf` passa limpo pelo antivirus
 * — nao ha malware nele — e, servido de um dominio que compartilhe cookie com a
 * aplicacao, vira XSS na propria origem (arquitetura 7.3).
 *
 * O ARQUIVO SO MUDA DE BALDE QUANDO PASSA NAS DUAS. Reprovado em qualquer uma, o
 * objeto e DESCARTADO da quarentena e o documento fica como trilha — com o
 * motivo, que vai para o painel do administrador e nao para o titular.
 */
@Injectable()
export class VarreduraService {
  private readonly log = new Logger('Varredura');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
    @Inject(SCANNER) private readonly scanner: Scanner,
  ) {}

  async processar(tarefa: TarefaDeVarredura): Promise<EstadoArquivo> {
    const emQuarentena: Objeto = {
      balde: 'quarentena',
      caminho: tarefa.caminho,
    };

    /*
     * Objeto ausente NAO e erro: o Cloud Tasks reentrega, e uma tarefa repetida
     * chega depois de o arquivo ja ter sido movido para o balde limpo. Tratar
     * como falha faria a fila insistir para sempre num trabalho ja feito.
     */
    if (!(await this.armazenamento.existe(emQuarentena))) {
      this.log.warn(
        `objeto ausente na quarentena, tarefa ignorada: ${tarefa.caminho}`,
      );
      return 'pendente_scan';
    }

    const resultado = await this.scanner.varrer(emQuarentena);

    if (resultado.veredito === 'indisponivel') {
      /*
       * Scanner fora do ar: o arquivo FICA em `pendente_scan` e a tarefa falha,
       * para o Cloud Tasks tentar de novo. Marcar como reprovado aqui apagaria um
       * arquivo legitimo por indisponibilidade de infraestrutura.
       */
      throw new Error('Scanner indisponivel; a tarefa sera reentregue.');
    }

    if (resultado.veredito === 'infectado') {
      return this.reprovar(
        tarefa,
        emQuarentena,
        'infectado',
        `ClamAV: ${resultado.assinatura ?? 'assinatura nao informada'}`,
      );
    }

    return this.conferirConteudo(tarefa, emQuarentena);
  }

  /**
   * A segunda conferencia. Le so os primeiros bytes, por FAIXA — baixar o objeto
   * inteiro para olhar cinco bytes desfaria a economia de a API nao tocar no
   * arquivo (arquitetura 7.3).
   */
  private async conferirConteudo(
    tarefa: TarefaDeVarredura,
    emQuarentena: Objeto,
  ): Promise<EstadoArquivo> {
    const registro = await this.ler(tarefa);
    if (registro === null) {
      this.log.warn(`registro sumiu durante a varredura: ${tarefa.caminho}`);
      return 'pendente_scan';
    }

    const inicio = await this.armazenamento.lerPrimeirosBytes(
      emQuarentena,
      BYTES_NECESSARIOS,
    );

    if (!conteudoBateComTipo(inicio, registro.tipo)) {
      return this.reprovar(
        tarefa,
        emQuarentena,
        'rejeitado',
        `O conteudo nao corresponde ao tipo declarado (${registro.tipo}).`,
      );
    }

    await this.armazenamento.mover(emQuarentena, {
      balde: 'arquivos',
      caminho: tarefa.caminho,
    });

    await this.gravarEstado(tarefa, 'limpo');
    this.log.log(`arquivo liberado: ${tarefa.caminho}`);
    return 'limpo';
  }

  /** Descarta o objeto e registra o motivo. O documento FICA — e a trilha. */
  private async reprovar(
    tarefa: TarefaDeVarredura,
    emQuarentena: Objeto,
    estado: EstadoArquivo,
    motivo: string,
  ): Promise<EstadoArquivo> {
    await this.armazenamento.excluir(emQuarentena);
    await this.gravarEstado(tarefa, estado, motivo);

    /*
     * O log registra o CAMINHO e o motivo tecnico, nunca o nome do arquivo — nome
     * de arquivo enviado por cliente e dado pessoal (LGPD, secao 13).
     */
    this.log.warn(
      `arquivo reprovado (${estado}): ${tarefa.caminho} — ${motivo}`,
    );
    return estado;
  }

  private referencia(
    tarefa: TarefaDeVarredura,
  ): FirebaseFirestore.DocumentReference {
    const pedido = this.db.collection(COLECAO_PEDIDOS).doc(tarefa.pedidoId);

    return tarefa.fluxo === 'anexo-cliente'
      ? pedido.collection(SUBCOLECAO_ANEXOS).doc(tarefa.alvoId)
      : pedido.collection(SUBCOLECAO_ENTREGAVEIS).doc(tarefa.alvoId);
  }

  private async ler(
    tarefa: TarefaDeVarredura,
  ): Promise<{ tipo: string } | null> {
    const documento = await this.referencia(tarefa).get();
    if (!documento.exists) return null;

    if (tarefa.fluxo === 'anexo-cliente') {
      return documento.data() as { tipo: string };
    }

    const arquivo = (documento.data() as DocumentoEntregavel).arquivoAtual;
    return arquivo === null ? null : { tipo: arquivo.tipo };
  }

  /**
   * O caminho do campo difere entre os fluxos: o anexo E o documento, e o
   * entregavel guarda o arquivo em `arquivoAtual`. E a unica assimetria entre os
   * dois aqui, e ela vem do ADR-11 — o entregavel e uma maquina de estados que
   * carrega um arquivo, nao um arquivo.
   */
  private async gravarEstado(
    tarefa: TarefaDeVarredura,
    estado: EstadoArquivo,
    motivo?: string,
  ): Promise<void> {
    const campos =
      tarefa.fluxo === 'anexo-cliente'
        ? { estado, motivo: motivo ?? null }
        : {
            'arquivoAtual.estado': estado,
            'arquivoAtual.motivo': motivo ?? null,
          };

    await this.referencia(tarefa).update({
      ...campos,
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  }
}
