import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import {
  impedimentoParaAgendar,
  semanaDe,
  semanaSeguinte,
  type HorarioDisponivel,
} from 'shared';
import {
  COLECAO_DISPONIBILIDADES,
  slotLivre,
  type DocumentoSlot,
} from '../disponibilidades/slot.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { agora as agora_ } from '../relogio.js';
import {
  COLECAO_PEDIDOS,
  situacaoDe,
  type DocumentoPedido,
} from '../pedidos/pedido.js';
import {
  fimDaJanelaDoPedido,
  SUBCOLECAO_REUNIOES,
  type DocumentoReuniao,
} from './reuniao.js';

/**
 * Os horarios que o cliente pode escolher, por pedido.
 *
 * SEPARADO DE `ReunioesService` de proposito, e pela mesma razao que separa
 * `ConsultaPedidosService` de `PedidosService`: aquele ESCREVE, sempre dentro de
 * uma transacao com toda leitura antes de toda escrita; este so LE e nunca abre
 * transacao. Juntar os dois poria a leitura da tela ao lado da fase de leitura
 * da transacao, e a regra "toda leitura antes de toda escrita" deixaria de ser
 * evidente — que e exatamente o defeito que o `preparar`/`gravar` da Etapa 5
 * existe para evitar.
 *
 * O QUE CHEGA AQUI JA E ESCOLHIVEL. A tela nao reaplica regra nenhuma para
 * desenhar a lista: saldo, janela, intervalo e antecedencia sao aplicados pela
 * MESMA funcao que o agendamento usa dentro da transacao. Filtrar com uma copia
 * da regra seria a forma mais direta de a lista oferecer um horario que o `POST`
 * recusa.
 */
@Injectable()
export class HorariosService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * `remarcando` e o id da reuniao que esta sendo MOVIDA, e sem ele a lista da
   * remarcacao sai vazia — sempre, em todo pedido.
   *
   * Duas regras contam a reuniao movida contra ela mesma: o intervalo minimo,
   * porque o horario velho fica perto demais do novo, e o saldo, porque ela ja o
   * consumiu. A transacao que remarca ja sabe disso e as ignora; a LISTA nao
   * sabia, e oferecia zero horarios para uma operacao que o servidor aceitaria.
   * A tela dizia "nenhum horario disponivel para remarcar" — um estado legitimo,
   * com a aparencia exata de um advogado sem grade publicada.
   *
   * Id que nao corresponde a nenhuma reuniao deste pedido nao ignora nada, e o
   * pior que faz e devolver uma lista otimista: quem decide e a transacao, que
   * recebe o id pelo caminho da rota e nao por parametro de consulta.
   */
  async listar(
    pedidoId: string,
    clienteUid: string,
    remarcando: string | null = null,
    agora: number = agora_(),
  ): Promise<HorarioDisponivel[]> {
    const pedido = await this.pedidoDoCliente(pedidoId, clienteUid);

    /* Sem advogado atribuido nao ha grade para consultar. A tela diz por que. */
    if (pedido.advogadoId === null) return [];

    const reunioes = await this.reunioesDo(pedidoId);
    const livres = await this.slotsDasSemanas(pedido.advogadoId, agora);
    const fimDaJanelaMs = fimDaJanelaDoPedido(pedido);

    return livres
      .filter(
        (slot) =>
          impedimentoParaAgendar({
            situacao: situacaoDe(pedido),
            distribuido: pedido.distribuido,
            quantidadeContratada: pedido.snapshot.quantidadeReunioes,
            intervaloMinimoDias: pedido.snapshot.intervaloMinimoReunioesDias,
            fimDaJanelaMs,
            reunioes,
            inicio: slot.inicio,
            agoraMs: agora,
            ignorarReuniaoId: remarcando ?? undefined,
          }) === null,
      )
      .map((slot) => ({ slotId: slot.id, inicio: slot.inicio, fim: slot.fim }));
  }

  /** 404 e nao 403 quando o pedido e de outro: ver a nota em `acesso.service.ts`. */
  private async pedidoDoCliente(
    pedidoId: string,
    clienteUid: string,
  ): Promise<DocumentoPedido> {
    const documento = await this.db
      .collection(COLECAO_PEDIDOS)
      .doc(pedidoId)
      .get();
    const pedido = documento.data() as DocumentoPedido | undefined;

    if (pedido === undefined || pedido.clienteId !== clienteUid) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    return pedido;
  }

  private async reunioesDo(
    pedidoId: string,
  ): Promise<readonly (DocumentoReuniao & { id: string })[]> {
    const pagina = await this.db
      .collection(COLECAO_PEDIDOS)
      .doc(pedidoId)
      .collection(SUBCOLECAO_REUNIOES)
      .get();

    return pagina.docs.map((documento) => ({
      id: documento.id,
      ...(documento.data() as DocumentoReuniao),
    }));
  }

  /**
   * DUAS CONSULTAS DE IGUALDADE, uma por semana editavel, em vez de uma com `in`
   * ou com faixa sobre `inicio`. Tres razoes, e a terceira e a que decide:
   *
   * - o dublê do Firestore recusa operador nao implementado;
   * - o indice composto que JA EXISTE (`advogadoId` + `semana` + `inicio`) serve
   *   as duas, entao esta consulta nao pede indice novo;
   * - o advogado so publica a semana corrente e a seguinte (ADR-06), entao essas
   *   duas SAO tudo que existe para escolher. Uma varredura por `advogadoId`
   *   sozinho leria tambem todas as semanas passadas, que ficam na colecao para
   *   sempre e cresceriam sem teto.
   *
   * E a mesma escolha que o varredor do outbox fez, e pelo mesmo motivo.
   */
  private async slotsDasSemanas(
    advogadoId: string,
    agora: number,
  ): Promise<readonly (DocumentoSlot & { id: string })[]> {
    const corrente = semanaDe(new Date(agora));

    const paginas = await Promise.all(
      [corrente, semanaSeguinte(corrente)].map((semana) =>
        this.db
          .collection(COLECAO_DISPONIBILIDADES)
          .where('advogadoId', '==', advogadoId)
          .where('semana', '==', semana)
          .orderBy('inicio')
          .get(),
      ),
    );

    return paginas
      .flatMap((pagina) => pagina.docs)
      .map((documento) => ({
        id: documento.id,
        ...(documento.data() as DocumentoSlot),
      }))
      .filter((slot) => slotLivre(slot));
  }
}
