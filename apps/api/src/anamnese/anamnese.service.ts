import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  FieldValue,
  type CollectionReference,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  MODELO_ANAMNESE,
  camposDaFicha,
  type FichaAnamnese,
  type SituacaoAnamnese,
} from 'shared';
import {
  COLECAO_CLIENTES,
  SUBCOLECAO_ANAMNESE,
  type DocumentoAnamnese,
} from '../clientes/cliente.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { ehDuplicata } from '../outbox/evento.js';
import { idDoPreCadastro } from '../pre-cadastros/liberacao.js';
import { COLECAO_PRE_CADASTROS } from '../pre-cadastros/pre-cadastros.service.js';

/**
 * A ficha de anamnese depois da compra (item 2.2.5), no modelo definitivo do
 * escritorio (`docs/decisoes.md`, 1.1). As perguntas vivem em
 * `packages/shared/src/anamnese.ts`.
 *
 * O CONTEUDO NAO ENTRA EM LOG, nem aqui nem em quem chama (AGENTS.md, LGPD).
 * Faturamento, passivo trabalhista e autuacoes sao confidenciais; o log registra
 * so que houve envio.
 *
 * UMA FICHA POR CLIENTE, preenchida uma vez (decisoes.md, Anexo B), com o id do
 * documento igual ao modelo. Um segundo envio e 409: a ficha e contexto de
 * trabalho do advogado, e reescreve-la depois de lida faria "o cliente disse X"
 * virar "o cliente sempre disse Y", sem trilha — a mesma razao de `observacoes`
 * ser append-only. Complementar e trabalho das observacoes do cartao.
 *
 * QUEM SO RESPONDEU O STUB (`provisoria-v0`) AINDA NAO PREENCHEU: a situacao olha
 * o documento do modelo atual, e nao "qualquer ficha". A v0 continua legivel
 * pelo advogado (`ClientesService.anamneseDe`), ao lado da definitiva.
 */
@Injectable()
export class AnamneseService {
  private readonly log = new Logger('Anamnese');

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async situacao(clienteId: string): Promise<SituacaoAnamnese> {
    const [ficha, cliente] = await Promise.all([
      this.colecao(clienteId).doc(MODELO_ANAMNESE).get(),
      this.db.collection(COLECAO_CLIENTES).doc(clienteId).get(),
    ]);
    return {
      preenchida: ficha.exists,
      preenchimento: await this.preenchimento(cliente.data()),
    };
  }

  async registrar(
    clienteId: string,
    ficha: FichaAnamnese,
  ): Promise<{ preenchida: true }> {
    const documento: DocumentoAnamnese = {
      campos: camposDaFicha(ficha),
      modelo: MODELO_ANAMNESE,
      respostas: { ...ficha.respostas },
      outros: { ...ficha.outros },
      criadoEm: FieldValue.serverTimestamp(),
    };

    try {
      await this.colecao(clienteId).doc(MODELO_ANAMNESE).create(documento);
    } catch (erro) {
      if (ehDuplicata(erro)) {
        throw new ConflictException('A ficha inicial ja foi enviada.');
      }
      throw erro;
    }

    this.log.log(`ficha inicial registrada para ${clienteId}`);
    return { preenchida: true };
  }

  /**
   * Nome e e-mail vem do cadastro do cliente; o telefone, do pre-cadastro, que e
   * o unico lugar onde ele existe — o checkout nao o pede (ADR-19, minimizacao).
   * O id do pre-cadastro e o hash do e-mail, entao a busca e uma leitura por id.
   * Sem pre-cadastro (e-mail diferente do da compra), o campo vem vazio e a
   * pessoa digita.
   */
  private async preenchimento(
    cliente: Record<string, unknown> | undefined,
  ): Promise<SituacaoAnamnese['preenchimento']> {
    const nome = typeof cliente?.['nome'] === 'string' ? cliente['nome'] : '';
    const email =
      typeof cliente?.['email'] === 'string' ? cliente['email'] : '';
    if (email === '') return { nome, email, telefone: '' };

    const lead = await this.db
      .collection(COLECAO_PRE_CADASTROS)
      .doc(idDoPreCadastro(email.trim().toLowerCase()))
      .get();
    const telefone = lead.data()?.['telefone'];
    return {
      nome,
      email,
      telefone: typeof telefone === 'string' ? telefone : '',
    };
  }

  private colecao(clienteId: string): CollectionReference {
    return this.db
      .collection(COLECAO_CLIENTES)
      .doc(clienteId)
      .collection(SUBCOLECAO_ANAMNESE);
  }
}
