import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  type CollectionReference,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  MODELO_ANAMNESE_PROVISORIA,
  PERGUNTAS_ANAMNESE_PROVISORIA,
  type AnamneseProvisoria,
  type SituacaoAnamnese,
} from 'shared';
import {
  COLECAO_CLIENTES,
  SUBCOLECAO_ANAMNESE,
  type DocumentoAnamnese,
} from '../clientes/cliente.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { ehDuplicata } from '../outbox/evento.js';

/**
 * ⚠️ STUB TEMPORÁRIO — substituir pela ficha da CONTRATANTE (plano 0.2, item 3).
 *
 * A ficha de anamnese depois da compra (item 2.2.5), com perguntas provisorias —
 * ver `packages/shared/src/anamnese-provisoria.ts`. O que e definitivo aqui e o
 * formato gravado: pares rotulo/valor em `clientes/{uid}/anamnese`, que a tela do
 * advogado ja le.
 *
 * O CONTEUDO NAO ENTRA EM LOG, nem aqui nem em quem chama (CLAUDE.md, LGPD). A
 * anamnese pode conter dado sensivel; o log registra so que houve envio.
 *
 * UMA FICHA POR CLIENTE, com id deterministico. Um segundo envio e 409: a ficha e
 * contexto de trabalho do advogado, e reescreve-la depois de lida faria "o
 * cliente disse X" virar "o cliente sempre disse Y", sem trilha — a mesma razao
 * de `observacoes` ser append-only. Complementar e trabalho das observacoes do
 * cartao.
 */
@Injectable()
export class AnamneseProvisoriaService {
  private readonly log = new Logger('Anamnese');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async situacao(clienteId: string): Promise<SituacaoAnamnese> {
    const pagina = await this.colecao(clienteId).limit(1).get();
    return { preenchida: pagina.size > 0 };
  }

  async registrar(
    clienteId: string,
    ficha: AnamneseProvisoria,
  ): Promise<SituacaoAnamnese> {
    const documento: DocumentoAnamnese = {
      campos: PERGUNTAS_ANAMNESE_PROVISORIA.map((pergunta) => ({
        rotulo: pergunta.rotulo,
        valor: ficha.respostas[pergunta.chave] ?? '',
      })),
      modelo: MODELO_ANAMNESE_PROVISORIA,
      criadoEm: FieldValue.serverTimestamp(),
    };

    try {
      await this.colecao(clienteId)
        .doc(MODELO_ANAMNESE_PROVISORIA)
        .create(documento);
    } catch (erro) {
      if (ehDuplicata(erro)) {
        throw new ConflictException('A ficha inicial ja foi enviada.');
      }
      throw erro;
    }

    this.log.log(`ficha inicial registrada para ${clienteId}`);
    return { preenchida: true };
  }

  private colecao(clienteId: string): CollectionReference {
    return this.db
      .collection(COLECAO_CLIENTES)
      .doc(clienteId)
      .collection(SUBCOLECAO_ANAMNESE);
  }
}
