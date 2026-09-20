import { Inject, Injectable } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ESTADOS_REUNIAO, reuniaoAtiva, reuniaoFuturaAtiva } from 'shared';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { COLECAO_PEDIDOS } from '../pedidos/pedido.js';
import { SUBCOLECAO_REUNIOES, type DocumentoReuniao } from './reuniao.js';

/** Os dois estados que ainda ocupam slot e saldo. Derivado, nunca copiado. */
const ESTADOS_ATIVOS = ESTADOS_REUNIAO.filter(reuniaoAtiva);

/**
 * As consultas de reuniao que atravessam pedidos (Etapa 10).
 *
 * SO LE, e nunca abre transacao propria — quando o chamador esta dentro de uma,
 * ele passa a sua. E a mesma divisao de `ConsultaPedidosService`.
 *
 * O OPERADOR DE FAIXA NAO E USADO, e isso e decisao registrada. O
 * `FirestoreFalso` implementa `==`, `array-contains` e `<=`, e recusa o resto em
 * vez de fingir que suporta — um `>` sobre `inicio` exigiria implementa-lo la. A
 * alternativa escolhida e consultar por IGUALDADE de `estado` e filtrar o horario
 * EM MEMORIA, e ela e melhor por uma razao que nao e a preguica: filtrar por
 * estado corta o que cresce sem limite (reuniao cancelada acumula para sempre),
 * enquanto o horario so separa futuro de passado dentro do que sobrou. Duas
 * consultas de igualdade, uma por estado ativo, como o varredor do outbox faz.
 */
@Injectable()
export class ConsultaReunioesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Ha reuniao futura ativa NESTE pedido? (ADR-21, decisao D.)
   *
   * Le a subcolecao inteira, e nao por consulta: sao poucas reunioes por pedido —
   * o teto e `quantidadeReunioes` mais as canceladas — e a leitura acontece
   * DENTRO da transacao de quem chama, onde uma consulta indexada nao daria
   * garantia melhor.
   */
  async futuraAtivaNoPedido(
    transacao: Transaction,
    pedidoId: string,
    agora: number = Date.now(),
  ): Promise<boolean> {
    const pagina = await transacao.get(
      this.db
        .collection(COLECAO_PEDIDOS)
        .doc(pedidoId)
        .collection(SUBCOLECAO_REUNIOES),
    );

    return reuniaoFuturaAtiva(
      pagina.docs.map((documento) => ({
        id: documento.id,
        ...(documento.data() as DocumentoReuniao),
      })),
      agora,
    );
  }

  /**
   * Ha reuniao futura ativa de QUALQUER pedido deste advogado?
   *
   * CONSULTA DE GRUPO DE COLECOES, porque `reunioes` e subcolecao de `pedidos` e
   * a pergunta atravessa todos eles. E por isso que `advogadoId` e guardado na
   * reuniao, redundante com o prefixo do `slotId`: extrair um id de dentro de
   * outro nao e consulta que o Firestore saiba fazer.
   *
   * Fora de transacao de proposito: a suspensao ja e uma operacao com tres
   * efeitos em sistemas diferentes (Auth, claim, documento), e o que esta
   * conferencia impede e o administrador suspender sem SABER que ha compromisso
   * marcado — nao uma corrida de milissegundos.
   */
  async futuraAtivaDoAdvogado(
    advogadoId: string,
    agora: number = Date.now(),
  ): Promise<boolean> {
    const paginas = await Promise.all(
      ESTADOS_ATIVOS.map((estado) =>
        this.db
          .collectionGroup(SUBCOLECAO_REUNIOES)
          .where('advogadoId', '==', advogadoId)
          .where('estado', '==', estado)
          .get(),
      ),
    );

    return reuniaoFuturaAtiva(
      paginas
        .flatMap((pagina) => pagina.docs)
        .map((documento) => ({
          id: documento.id,
          ...(documento.data() as DocumentoReuniao),
        })),
      agora,
    );
  }
}
