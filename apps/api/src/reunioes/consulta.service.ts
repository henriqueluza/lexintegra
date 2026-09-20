import { Inject, Injectable } from '@nestjs/common';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  ESTADOS_REUNIAO,
  msDe,
  reuniaoAtiva,
  reuniaoFuturaAtiva,
  type ReuniaoDaAgenda,
  type ReuniaoSemSala,
} from 'shared';
import { ClientesService } from '../clientes/clientes.service.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { agora as agora_ } from '../relogio.js';
import { chaveDoEvento, idDoEvento } from '../outbox/evento.js';
import { COLECAO_PEDIDOS, type DocumentoPedido } from '../pedidos/pedido.js';
import {
  paraAgenda,
  SUBCOLECAO_REUNIOES,
  type DocumentoReuniao,
} from './reuniao.js';

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
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly clientes: ClientesService,
  ) {}

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
    agora: number = agora_(),
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
    agora: number = agora_(),
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

  /**
   * A agenda do advogado (item 2.7.1, "calendario interno").
   *
   * SO O QUE ESTA ATIVO, e ordenado por horario. Reuniao cancelada nao e agenda:
   * ela nao tem o que ser preparado nem a que comparecer, e mostra-la junto faria
   * a lista crescer para sempre com linhas que nao pedem nada.
   *
   * SO O QUE FOI DISTRIBUIDO A ELE (item 2.6.1). A filtragem e da consulta, pelo
   * `advogadoId` congelado na reuniao — nao da tela.
   */
  async agendaDoAdvogado(
    advogadoId: string,
    agora: number = agora_(),
  ): Promise<ReuniaoDaAgenda[]> {
    const reunioes = (await this.ativasDoAdvogado(advogadoId))
      .filter((reuniao) => (msDe(reuniao.inicio) ?? 0) >= agora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));

    return this.comContexto(reunioes, (reuniao, pedido, cliente) =>
      paraAgenda(reuniao.id, reuniao, {
        pedidoId: reuniao.pedidoId,
        produto: pedido?.snapshot.nome ?? '',
        cliente,
      }),
    );
  }

  /**
   * As reunioes que ficaram sem sala (arquitetura 7.2).
   *
   * "Precisa virar estado visivel e ACIONAVEL no painel do admin, nao erro
   * silencioso." O que torna a linha acionavel e `eventoOutboxId`: o botao de
   * tentar de novo reenvia AQUELE registro pelo caminho normal do outbox, e nao
   * por um caminho proprio (regra inviolavel 3 — nada decide sozinho se vale
   * entregar).
   *
   * O ID DO EVENTO SAI DE `idDoEvento`, e nao e montado aqui. Monta-lo a mao
   * seria repetir a regra fora dela, e um id com um campo a menos produziria um
   * botao que reenvia coisa nenhuma sem dizer por que.
   */
  async semSala(): Promise<ReuniaoSemSala[]> {
    /*
     * `orderBy` no BANCO, e nao em memoria: a consulta e uma igualdade mais uma
     * ordenacao por outro campo, que e a forma que exige indice composto — e
     * declara-lo e o que faz esta consulta existir em producao. A agenda do
     * advogado ordena em memoria porque la sao DUAS consultas cujos resultados
     * se juntam, e ordenar cada uma nao ordena a uniao.
     */
    const pagina = await this.db
      .collectionGroup(SUBCOLECAO_REUNIOES)
      .where('estado', '==', 'reservada_sem_link')
      .orderBy('inicio')
      .get();

    const reunioes = pagina.docs.map((documento) => ({
      id: documento.id,
      ...(documento.data() as DocumentoReuniao),
    }));

    return reunioes.map((reuniao) => ({
      id: reuniao.id,
      pedidoId: reuniao.pedidoId,
      advogadoId: reuniao.advogadoId,
      inicio: reuniao.inicio,
      fim: reuniao.fim,
      estado: reuniao.estado,
      eventoOutboxId: idDoEvento(
        'criar-sala-reuniao',
        chaveDoEvento({
          tipo: 'criar-sala-reuniao',
          destinatarioUid: reuniao.clienteId,
          reuniao: {
            pedidoId: reuniao.pedidoId,
            reuniaoId: reuniao.id,
            sequence: reuniao.sequence,
          },
        }),
      ),
    }));
  }

  private async ativasDoAdvogado(
    advogadoId: string,
  ): Promise<(DocumentoReuniao & { id: string })[]> {
    const paginas = await Promise.all(
      ESTADOS_ATIVOS.map((estado) =>
        this.db
          .collectionGroup(SUBCOLECAO_REUNIOES)
          .where('advogadoId', '==', advogadoId)
          .where('estado', '==', estado)
          .get(),
      ),
    );

    return paginas
      .flatMap((pagina) => pagina.docs)
      .map((documento) => ({
        id: documento.id,
        ...(documento.data() as DocumentoReuniao),
      }));
  }

  /**
   * Resolve pedido e cliente de cada reuniao, sem uma leitura por linha.
   *
   * Os ids repetem — varias reunioes do mesmo pedido, varios pedidos do mesmo
   * cliente — e `nomesDe` ja recebe a lista inteira. Uma leitura por linha faria
   * a agenda custar proporcional ao numero de reunioes em vez de ao numero de
   * pedidos.
   */
  private async comContexto<T>(
    reunioes: readonly (DocumentoReuniao & { id: string })[],
    montar: (
      reuniao: DocumentoReuniao & { id: string },
      pedido: DocumentoPedido | undefined,
      cliente: string,
    ) => T,
  ): Promise<T[]> {
    const pedidos = new Map<string, DocumentoPedido | undefined>();
    for (const id of new Set(reunioes.map((r) => r.pedidoId))) {
      const documento = await this.db.collection(COLECAO_PEDIDOS).doc(id).get();
      pedidos.set(id, documento.data() as DocumentoPedido | undefined);
    }

    const nomes = await this.clientes.nomesDe(
      reunioes.map((reuniao) => reuniao.clienteId),
    );

    return reunioes.map((reuniao) =>
      montar(
        reuniao,
        pedidos.get(reuniao.pedidoId),
        nomes.get(reuniao.clienteId) ?? '',
      ),
    );
  }
}
