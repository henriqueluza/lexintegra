import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  DocumentReference,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import type {
  AdvogadoDoAndamento,
  Andamento,
  DetalheDoAndamento,
  EntregavelComTrilha,
  EntregavelEmAndamento,
  PassoDaTrilha,
  PedidoEmAndamento,
  ReuniaoDoAndamento,
  StatusAdvogado,
} from 'shared';
import { COLECAO_ADVOGADOS } from '../advogados/advogados.service.js';
import { registrarConsulta } from '../auditoria/auditoria.js';
import { ClientesService } from '../clientes/clientes.service.js';
import {
  idDaTransicao,
  resumoDoEntregavel,
  SUBCOLECAO_ENTREGAVEIS,
  SUBCOLECAO_TRANSICOES,
  type DocumentoEntregavel,
  type DocumentoTransicao,
} from '../entregaveis/entregavel.js';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  COLECAO_PEDIDOS,
  contestacaoAberta,
  paraIso,
  situacaoDe,
  type DocumentoPedido,
} from '../pedidos/pedido.js';
import { agora } from '../relogio.js';
import { ConsultaReunioesService } from '../reunioes/consulta.service.js';
import {
  SUBCOLECAO_REUNIOES,
  type DocumentoReuniao,
} from '../reunioes/reuniao.js';

/**
 * Teto de pedidos por carga. E LIMITE DE SANIDADE, nao paginacao — o mesmo
 * criterio da caixa de entrada (`DistribuicaoService`) e da secao 5.5 da
 * arquitetura: carregar e filtrar.
 *
 * ONDE ISTO DEIXA DE SERVIR: cada carga le ate 200 pedidos e os entregaveis de
 * cada um. Por volta de 200 pedidos EM ABERTO, ou 5 mil entregaveis por carga, a
 * tela leva segundos para abrir, cobra milhares de leituras a cada abertura e
 * comeca a esconder pedido antigo ainda em andamento. O passo seguinte e guardar
 * um resumo de andamento no documento do pedido (escrito na transacao da
 * transicao) e paginar por ele. A resposta diz quando o teto cortou.
 */
export const TETO_DE_PEDIDOS = 200;

/**
 * A visao do administrador sobre o andamento dos advogados (lote de novembro,
 * ajuste 5).
 *
 * SO LE. Nao ha evento de dominio aqui e nao pode haver: o estado do entregavel
 * so muda pelos eventos de `EntregaveisService` (regra inviolavel 14), e o
 * administrador nao dispara nenhum deles. Esta classe nao importa aquele servico
 * de proposito — so a forma do documento.
 *
 * ANDAMENTO, E NAO CONTEUDO. Nada daqui devolve observacao, ficha, nome de
 * arquivo ou link de sala. O que o administrador pode ler do trabalho do
 * advogado alem do estado e decisao do escritorio ainda em aberto (CHECKLIST),
 * e ate ela chegar a resposta mais estreita e a que nao vaza.
 *
 * TODA LEITURA E AUDITADA, e a linha e gravada ANTES de a resposta sair
 * (`registrarConsulta`). A lista grava UMA linha por carga, com o filtro e a
 * quantidade; o detalhe grava uma por pedido, com o cliente como `alvo`, que e o
 * que faz a consulta aparecer na exportacao LGPD daquele titular.
 */
@Injectable()
export class AndamentoService {
  private readonly log = new Logger('Andamento');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly clientes: ClientesService,
    private readonly reunioes: ConsultaReunioesService,
  ) {}

  async listar(
    advogadoId: string | null,
    adminUid: string,
  ): Promise<Andamento> {
    /* Um a mais que o teto: e como se sabe que havia mais sem contar tudo. */
    const pagina = await this.consulta(advogadoId)
      .limit(TETO_DE_PEDIDOS + 1)
      .get();
    const documentos = pagina.docs.slice(0, TETO_DE_PEDIDOS);

    const [nomes, pedidos, advogados, semSala] = await Promise.all([
      this.clientes.nomesDe(
        documentos.map((d) => (d.data() as DocumentoPedido).clienteId),
      ),
      Promise.all(documentos.map((d) => this.entregaveisDe(d))),
      this.advogados(),
      this.reunioes.semSala(),
    ]);

    await registrarConsulta(this.db, {
      acao: 'andamento.consultado',
      atorUid: adminUid,
      alvo: advogadoId ?? 'todos',
      depois: { advogadoId, pedidos: documentos.length },
    });
    this.log.log(
      `andamento consultado por ${adminUid}: ${String(documentos.length)} pedido(s)`,
    );

    return {
      geradoEm: new Date(agora()).toISOString(),
      pedidos: documentos.map((documento, indice) =>
        paraPedido(
          documento.id,
          documento.data() as DocumentoPedido,
          nomes,
          pedidos[indice],
        ),
      ),
      advogados,
      reunioesSemSala: semSala.length,
      cortado: pagina.docs.length > TETO_DE_PEDIDOS,
    };
  }

  /**
   * Um pedido, com a trilha de cada entregavel e as reunioes.
   *
   * 404 para pedido inexistente, e so. Nao ha "pedido de outra pessoa" para o
   * administrador — quem nao e administrador nem chega aqui (`PerfisGuard`).
   */
  async detalhar(
    pedidoId: string,
    adminUid: string,
  ): Promise<DetalheDoAndamento> {
    const referencia = this.db.collection(COLECAO_PEDIDOS).doc(pedidoId);
    const documento = await referencia.get();
    if (!documento.exists) {
      throw new NotFoundException('Pedido nao encontrado.');
    }
    const dados = documento.data() as DocumentoPedido;

    const [nomes, entregaveis, reunioes] = await Promise.all([
      this.clientes.nomesDe([dados.clienteId]),
      this.entregaveisComTrilha(referencia),
      this.reunioesDe(referencia),
    ]);

    await registrarConsulta(this.db, {
      acao: 'pedido.consultado',
      atorUid: adminUid,
      alvo: dados.clienteId,
      depois: { pedidoId },
    });
    this.log.log(`andamento do pedido ${pedidoId} consultado por ${adminUid}`);

    const { entregaveis: _resumidos, ...pedido } = paraPedido(
      pedidoId,
      dados,
      nomes,
      [],
    );
    return { ...pedido, entregaveis, reunioes };
  }

  /**
   * Igualdade mais ordenacao decrescente por data: com o filtro, e o indice
   * `advogadoId + criadoEm` que a lista de demandas do advogado ja usa
   * (`infra/terraform/firestore.tf`); sem ele, a ordenacao de campo unico.
   * NENHUM INDICE NOVO.
   */
  private consulta(advogadoId: string | null): Query {
    const pedidos = this.db.collection(COLECAO_PEDIDOS);
    return advogadoId === null
      ? pedidos.orderBy('criadoEm', 'desc')
      : pedidos
          .where('advogadoId', '==', advogadoId)
          .orderBy('criadoEm', 'desc');
  }

  private async entregaveisDe(
    pedido: QueryDocumentSnapshot,
  ): Promise<EntregavelEmAndamento[]> {
    const pagina = await pedido.ref
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .orderBy('ordem')
      .get();

    return Promise.all(
      pagina.docs.map(async (documento) => {
        const dados = documento.data() as DocumentoEntregavel;
        return paraEntregavel(
          documento.id,
          dados,
          await this.estadoDesde(documento.ref, dados),
        );
      }),
    );
  }

  /**
   * Desde quando o entregavel esta no estado atual.
   *
   * O campo `estadoDesde` existe desde o lote de novembro. O entregavel ANTERIOR
   * nao foi migrado: o instante dele esta na ultima transicao da trilha, cujo id
   * sai do contador que o proprio documento guarda. E uma leitura a mais so para
   * os antigos, e ela some sozinha — a primeira transicao escreve o campo.
   */
  private async estadoDesde(
    entregavel: DocumentReference,
    dados: DocumentoEntregavel,
  ): Promise<string | null> {
    if (dados.estadoDesde !== undefined) return paraIso(dados.estadoDesde);

    const ultima = await entregavel
      .collection(SUBCOLECAO_TRANSICOES)
      .doc(idDaTransicao(dados.transicoes))
      .get();

    return paraIso((ultima.data() as DocumentoTransicao | undefined)?.em);
  }

  private async entregaveisComTrilha(
    pedido: DocumentReference,
  ): Promise<EntregavelComTrilha[]> {
    const pagina = await pedido
      .collection(SUBCOLECAO_ENTREGAVEIS)
      .orderBy('ordem')
      .get();

    return Promise.all(
      pagina.docs.map(async (documento) => {
        const dados = documento.data() as DocumentoEntregavel;
        const trilha = await this.trilhaDe(documento.ref);
        /* A trilha ja foi lida: o legado nao custa leitura extra aqui. */
        const desde =
          dados.estadoDesde !== undefined
            ? paraIso(dados.estadoDesde)
            : (trilha.at(-1)?.em ?? null);

        return { ...paraEntregavel(documento.id, dados, desde), trilha };
      }),
    );
  }

  /**
   * Os ids da trilha (`0001`, `0002`) ordenam como texto, e a ordenacao e feita
   * AQUI: nao depende de o banco devolver a subcolecao em ordem de nome.
   */
  private async trilhaDe(
    entregavel: DocumentReference,
  ): Promise<PassoDaTrilha[]> {
    const pagina = await entregavel.collection(SUBCOLECAO_TRANSICOES).get();

    return [...pagina.docs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((documento) => {
        const passo = documento.data() as DocumentoTransicao;
        return {
          de: passo.de,
          para: passo.para,
          evento: passo.evento,
          em: paraIso(passo.em),
        };
      });
  }

  private async reunioesDe(
    pedido: DocumentReference,
  ): Promise<ReuniaoDoAndamento[]> {
    const pagina = await pedido.collection(SUBCOLECAO_REUNIOES).get();

    return [...pagina.docs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((documento) => {
        const reuniao = documento.data() as DocumentoReuniao;
        return {
          id: documento.id,
          inicio: reuniao.inicio,
          fim: reuniao.fim,
          estado: reuniao.estado,
        };
      });
  }

  /**
   * Todos os advogados, com nome e se esta suspenso. SEM E-MAIL: a tela filtra
   * por pessoa e mostra o nome, e a lista com e-mail ja existe, na rota propria.
   */
  private async advogados(): Promise<AdvogadoDoAndamento[]> {
    const pagina = await this.db
      .collection(COLECAO_ADVOGADOS)
      .orderBy('nome')
      .get();

    return pagina.docs.map((documento) => {
      const dados = documento.data() as {
        nome: string;
        status: StatusAdvogado;
      };
      return {
        uid: documento.id,
        nome: dados.nome,
        suspenso: dados.status !== 'ativo',
      };
    });
  }
}

function paraEntregavel(
  id: string,
  dados: DocumentoEntregavel,
  estadoDesde: string | null,
): EntregavelEmAndamento {
  return {
    id,
    nome: dados.nome,
    ordem: dados.ordem,
    estado: dados.estado,
    estadoDesde,
    /*
     * A MESMA resposta que o cliente e o advogado recebem, e nao um
     * `arquivoAtual !== null` proprio: quando "tem arquivo" passar a exigir que
     * o envio tenha chegado, esta tela acompanha sem ninguem lembrar dela.
     */
    temArquivo: resumoDoEntregavel(id, dados).temArquivo,
    arquivoEnviadoEm: paraIso(dados.arquivoAtual?.enviadoEm),
    revisoesUsadas: dados.revisoesUsadas,
  };
}

function paraPedido(
  id: string,
  pedido: DocumentoPedido,
  nomes: ReadonlyMap<string, string>,
  entregaveis: readonly EntregavelEmAndamento[],
): PedidoEmAndamento {
  return {
    id,
    produto: pedido.snapshot.nome,
    cliente: nomes.get(pedido.clienteId) ?? '',
    /* `?? null`: pedido anterior ao campo (ver `EntregaveisService.ler`). */
    advogadoId: pedido.advogadoId ?? null,
    atribuidoEm: paraIso(pedido.atribuidoEm),
    situacao: situacaoDe(pedido),
    contestacaoAberta: contestacaoAberta(pedido),
    criadoEm: paraIso(pedido.criadoEm),
    entregaveis,
  };
}
