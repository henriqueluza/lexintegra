import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import {
  Timestamp,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  inicioDaGuardaVigenteDoCliente,
  inicioDaGuardaVigenteDoPreCadastro,
} from 'shared/politica-de-guarda';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import { agora } from '../relogio.js';
import { EliminacaoTitular } from './eliminacao.service.js';
import { MAPA_TITULAR } from './mapa.js';
import { emMilissegundos } from './politica.js';
import {
  SISTEMA,
  SOLICITACOES,
  idDoProtocolo,
  type Protocolo,
  type ResumoDaPassagemLgpd,
} from './protocolo.js';
import { lerRetencao } from './retencao-legal.js';
import { chaveDoTitular, usuarioAusente } from './titular.js';

/** Teto de cada consulta da rotina diaria. O volume previsto e de dezenas. */
const TETO_POR_CONSULTA = 500;
const TETO_DE_EXECUCOES = 20;

/**
 * A rotina diaria da politica de guarda (decisoes.md 2.1), chamada pela
 * passagem de retencao (`retencao-diaria`, sem job novo no Scheduler):
 *
 * - elimina o cadastro inicial de quem nunca virou cliente, 6 meses depois do
 *   ultimo envio;
 * - abre a eliminacao (com aviso) de quem tem o ultimo pedido ha 5 anos;
 * - executa as solicitacoes cujo aviso ja deu os 7 dias, e retoma as
 *   interrompidas.
 */
@Injectable()
export class RotinaDeGuarda {
  private readonly log = new Logger('LGPD');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    private readonly eliminacao: EliminacaoTitular,
  ) {}

  async executarPassagem(): Promise<ResumoDaPassagemLgpd> {
    const agoraMs = agora();
    const preCadastrosEliminados = await this.expirarPreCadastros(agoraMs);
    const solicitacoesPorPrazo = await this.abrirPorPrazo(agoraMs);
    const eliminacoesExecutadas = await this.executarProntas();
    this.log.log(
      `lgpd: ${String(preCadastrosEliminados)} cadastro(s) inicial(is) eliminado(s), ${String(solicitacoesPorPrazo)} solicitacao(oes) por prazo, ${String(eliminacoesExecutadas)} eliminacao(oes) executada(s)`,
      {
        sinal: 'lgpd.passagem',
        preCadastrosEliminados,
        solicitacoesPorPrazo,
        eliminacoesExecutadas,
      },
    );
    return {
      preCadastrosEliminados,
      solicitacoesPorPrazo,
      eliminacoesExecutadas,
    };
  }

  /**
   * SEM AVISO, de proposito: nao ha conta nem arquivo a baixar, e mandar
   * e-mail a um lead para dizer que o nome dele vai sair do banco seria tratar
   * o dado mais uma vez para elimina-lo. Quem virou cliente fica: o cadastro
   * inicial passa a ser parte do cadastro, com a guarda de 5 anos.
   */
  private async expirarPreCadastros(agoraMs: number): Promise<number> {
    const limite = Timestamp.fromDate(
      inicioDaGuardaVigenteDoPreCadastro(new Date(agoraMs)),
    );
    const vencidos = await this.db
      .collection(MAPA_TITULAR.preCadastros.colecao)
      .where('atualizadoEm', '<=', limite)
      .orderBy('atualizadoEm')
      .limit(TETO_POR_CONSULTA)
      .get();
    let eliminados = 0;
    for (const documento of vencidos.docs)
      if (await this.eliminarPreCadastro(documento)) eliminados += 1;
    return eliminados;
  }

  private async eliminarPreCadastro(
    documento: DocumentSnapshot,
  ): Promise<boolean> {
    const email = documento.data()?.['email'] as unknown;
    if (typeof email === 'string' && (await this.virouCliente(email)))
      return false;
    const chave = chaveDoTitular(`pre:${documento.id}`);
    if ((await lerRetencao(this.db, chave)).exists) return false;
    const checkouts = await this.db
      .collection(MAPA_TITULAR.checkouts.colecao)
      .where(MAPA_TITULAR.checkouts.campo as string, '==', documento.id)
      .get();
    for (const checkout of checkouts.docs) await checkout.ref.delete();
    await documento.ref.delete();
    return true;
  }

  private async virouCliente(email: string): Promise<boolean> {
    try {
      const conta = await this.auth.getUserByEmail(email);
      if (conta.customClaims?.['role'] !== 'cliente') return false;
      const pedidos = await this.db
        .collection(MAPA_TITULAR.pedidos.colecao)
        .where('clienteId', '==', conta.uid)
        .limit(1)
        .get();
      if (pedidos.size === 0) await this.abrirSeVencido(conta.uid, 0);
      // Conta sem compra tambem expira, pelo protocolo com aviso e exclusao do Auth.
      return true;
    } catch (erro) {
      if (usuarioAusente(erro)) return false;
      throw erro;
    }
  }

  /**
   * A consulta acha pedidos antigos; quem tem pedido mais novo fica (o indice
   * composto `clienteId` + `criadoEm` ja existe, da listagem do cliente).
   */
  private async abrirPorPrazo(agoraMs: number): Promise<number> {
    const limite = inicioDaGuardaVigenteDoCliente(new Date(agoraMs)).getTime();
    const antigos = await this.db
      .collection(MAPA_TITULAR.pedidos.colecao)
      .where('criadoEm', '<=', Timestamp.fromMillis(limite))
      .orderBy('criadoEm')
      .limit(TETO_POR_CONSULTA)
      .get();
    const clientes = new Set(
      antigos.docs
        .map((d) => d.data()['clienteId'] as unknown)
        .filter((uid): uid is string => typeof uid === 'string'),
    );
    let abertas = 0;
    for (const uid of clientes)
      if (await this.abrirSeVencido(uid, limite)) abertas += 1;
    return abertas;
  }

  private async abrirSeVencido(uid: string, limite: number): Promise<boolean> {
    const ultimo = await this.db
      .collection(MAPA_TITULAR.pedidos.colecao)
      .where('clienteId', '==', uid)
      .orderBy('criadoEm', 'desc')
      .limit(1)
      .get();
    const ms = emMilissegundos(ultimo.docs[0]?.data()['criadoEm']);
    if (ms !== null && ms > limite) return false;
    const atual = await this.db
      .collection(SOLICITACOES)
      .doc(idDoProtocolo(chaveDoTitular(`uid:${uid}`)))
      .get();
    const estado = (atual.data() as Protocolo | undefined)?.estado;
    if (estado === 'aguardando_execucao' || estado === 'em_execucao')
      return false;
    try {
      const resultado = await this.eliminacao.solicitar(
        'clientes',
        uid,
        SISTEMA,
        'prazo',
      );
      return resultado.estado === 'aguardando_execucao';
    } catch (erro) {
      if (erro instanceof NotFoundException) return false;
      throw erro;
    }
  }

  /** As que ja podem andar, e as interrompidas com arrendamento vencido. */
  private async executarProntas(): Promise<number> {
    const candidatas: DocumentSnapshot[] = [];
    for (const estado of ['aguardando_execucao', 'em_execucao'] as const) {
      const pagina = await this.db
        .collection(SOLICITACOES)
        .where('estado', '==', estado)
        .limit(TETO_DE_EXECUCOES)
        .get();
      candidatas.push(...pagina.docs);
    }
    let executadas = 0;
    for (const documento of candidatas) {
      try {
        await this.eliminacao.executarProtocolo(documento.id, SISTEMA);
        executadas += 1;
      } catch (erro) {
        // Ainda nao e hora (aviso, prazo, arrendamento) ou ficou impedida.
        if (erro instanceof ConflictException) continue;
        this.log.error({
          message: 'Eliminacao interrompida; sera retomada',
          protocolo: documento.id,
        });
      }
    }
    return executadas;
  }
}
