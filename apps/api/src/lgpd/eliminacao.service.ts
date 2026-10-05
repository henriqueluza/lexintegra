import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { ALERTAS, type CanalDeAlerta } from '../alertas/alerta.js';
import { AUTH_FIREBASE, FIRESTORE } from '../firebase/firebase.module.js';
import { DespachanteOutbox } from '../outbox/despachante.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { agora } from '../relogio.js';
import { Eliminador } from './eliminador.js';
import { InventarioTitular, type Inventario } from './inventario.service.js';
import {
  escopoDaEliminacao,
  impedimentos,
  type Impedimento,
} from './politica.js';
import {
  ARRENDAMENTO_MS,
  SOLICITACOES,
  conferirArrendamento,
  conferirEnvio,
  conferirExecutavel,
  gruposMantidos,
  idDoProtocolo,
  mudancaDaAvaliacao,
  recusa,
  registroDeConclusao,
  transicao,
  type Ator,
  type OrigemEliminacao,
  type Protocolo,
  type ResultadoDaExecucao,
  type ResultadoDaSolicitacao,
} from './protocolo.js';
import { COLECAO_RETENCOES_LEGAIS, lerRetencao } from './retencao-legal.js';
import { usuarioAusente, type Titular } from './titular.js';

/**
 * O EXECUTOR DE ELIMINACAO do titular (decisoes.md 2.1, politica de 05/10/2026).
 *
 * O CAMINHO, a pedido do titular ou no fim do prazo:
 *
 * 1. `solicitar` inventaria, confere impedimentos (pedido em andamento, reuniao
 *    futura, contestacao aberta, RETENCAO LEGAL) e, sem nenhum, poe o protocolo
 *    em `aguardando_execucao` e escreve o AVISO no outbox NA MESMA TRANSACAO
 *    (regra 3). Sem conta ativa, nao ha a quem avisar: `avisoDispensado`.
 * 2. `executarProtocolo` so anda depois do ENVIO CONFIRMADO do aviso mais 7
 *    dias, toma o protocolo por arrendamento, REINVENTARIA e confere os
 *    impedimentos de novo — a lista da simulacao nao e plano destrutivo seguro.
 * 3. Bloqueia a conta, elimina conforme o ESCOPO (`escopoDaEliminacao`): dentro
 *    dos 5 anos de guarda, so o `eliminavel`; depois, tudo menos a `trilha`.
 * 4. Apaga a conta de login por ultimo, com checkpoint antes, e fecha o
 *    protocolo com o que saiu e o que ficou — que e a resposta ao titular.
 *
 * O QUE O SISTEMA NAO ELIMINA, e a resposta ao titular precisa dizer: copias ja
 * baixadas pelo escritorio, registros no AbacatePay, no Resend e no Microsoft
 * 365, logs (que expiram sozinhos) e a janela de 7 dias do PITR e do soft
 * delete (`docs/entrega/lgpd.md`, secao 4).
 */
@Injectable()
export class EliminacaoTitular {
  private readonly log = new Logger('LGPD');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(AUTH_FIREBASE) private readonly auth: Auth,
    @Inject(ALERTAS) private readonly alertas: CanalDeAlerta,
    private readonly inventario: InventarioTitular,
    private readonly outbox: OutboxService,
    private readonly despachante: DespachanteOutbox,
    private readonly eliminador: Eliminador,
  ) {}

  /** Cria ou reavalia o protocolo. Repetir nao duplica nada. */
  async solicitar(
    tipo: string,
    id: string,
    ator: Ator,
    origem: OrigemEliminacao,
  ): Promise<ResultadoDaSolicitacao> {
    const inventario = await this.inventario.reunir(tipo, id);
    const lista = await this.impedimentosDe(inventario, agora());
    const protocolo = idDoProtocolo(inventario.titular.chave);
    const referencia = this.db.collection(SOLICITACOES).doc(protocolo);

    const resultado = await this.db.runTransaction((transacao) =>
      this.avaliar(transacao, referencia, inventario.titular, lista, {
        alvo: { tipo, id },
        ator,
        origem,
      }),
    );

    // Depois do commit, nunca dentro (regra inviolavel 2).
    if (resultado.novo && resultado.avisoOutboxId !== null)
      await this.despachante.despachar(resultado.avisoOutboxId);

    this.log.log({
      message: 'Solicitacao de eliminacao avaliada',
      protocolo,
      estado: resultado.estado,
      origem,
    });
    return {
      protocolo,
      estado: resultado.estado,
      ciclo: resultado.ciclo,
      impedimentos: lista,
      avisoOutboxId: resultado.avisoOutboxId,
    };
  }

  /** O protocolo do titular, pelo alvo da rota administrativa. */
  async executar(
    tipo: string,
    id: string,
    ator: Ator,
  ): Promise<ResultadoDaExecucao> {
    const { titular } = await this.inventario.reunir(tipo, id);
    return this.executarProtocolo(idDoProtocolo(titular.chave), ator);
  }

  async executarProtocolo(
    protocolo: string,
    ator: Ator,
  ): Promise<ResultadoDaExecucao> {
    const agoraMs = agora();
    const referencia = this.db.collection(SOLICITACOES).doc(protocolo);
    const instantaneo = await referencia.get();
    if (!instantaneo.exists)
      throw new NotFoundException('Solicitacao de eliminacao nao encontrada.');
    const dados = instantaneo.data() as Protocolo;

    const concluida = conferirExecutavel(protocolo, dados);
    if (concluida !== null) return concluida;
    if (dados.estado === 'aguardando_execucao' && dados.avisoOutboxId)
      conferirEnvio(
        dados.avisoOutboxId,
        await this.outbox.ler(dados.avisoOutboxId),
        agoraMs,
      );

    await this.tomar(referencia, ator, agoraMs);
    try {
      return await this.eliminar(protocolo, referencia, dados, agoraMs);
    } catch (erro) {
      // O protocolo fica `em_execucao`; vencido o arrendamento, a proxima
      // passagem retoma. O alerta diz que alguem precisa olhar.
      if (!(erro instanceof ConflictException))
        this.alertas.emitir({
          nivel: 'critico',
          assunto: 'lgpd.eliminacao-falhou',
          detalhe: `Eliminacao do protocolo ${protocolo} falhou no meio; sera retomada.`,
        });
      throw erro;
    }
  }

  private async impedimentosDe(
    inventario: Inventario,
    agoraMs: number,
  ): Promise<Impedimento[]> {
    const lista = impedimentos(inventario.registros, agoraMs);
    const retencao = await lerRetencao(this.db, inventario.titular.chave);
    if (retencao.exists)
      lista.push({
        tipo: 'retencao_legal',
        caminho: `${COLECAO_RETENCOES_LEGAIS}/${inventario.titular.chave}`,
      });
    return lista;
  }

  /** O corpo da transacao de `solicitar`: le, decide e escreve. */
  private async avaliar(
    transacao: Transaction,
    referencia: DocumentReference,
    titular: Titular,
    lista: Impedimento[],
    contexto: { alvo: object; ator: Ator; origem: OrigemEliminacao },
  ): Promise<{
    estado: ResultadoDaSolicitacao['estado'];
    ciclo: number;
    avisoOutboxId: string | null;
    novo: boolean;
  }> {
    const anterior = await transacao.get(referencia);
    const dados = anterior.data() as Protocolo | undefined;
    const passo = transicao(dados, lista.length);
    if (passo.tipo === 'mantem') {
      return {
        estado: dados?.estado as ResultadoDaSolicitacao['estado'],
        ciclo: passo.ciclo,
        avisoOutboxId: dados?.avisoOutboxId ?? null,
        novo: false,
      };
    }

    const comConta = titular.conta !== null && titular.conta.disabled !== true;
    const avisoOutboxId =
      passo.tipo === 'aguarda' && comConta
        ? await this.outbox.registrarSeAusente(transacao, {
            tipo: 'aviso-eliminacao-titular',
            destinatarioUid: titular.uid as string,
            solicitacao: `${referencia.id}_c${String(passo.ciclo)}`,
          })
        : null;
    const mudanca = mudancaDaAvaliacao(passo, titular, lista, {
      alvo: contexto.alvo,
      ator: contexto.ator,
      avisoOutboxId,
      comConta,
    });
    if (anterior.exists) transacao.update(referencia, mudanca);
    else
      transacao.create(referencia, {
        ...mudanca,
        acao: 'eliminacao',
        origem: contexto.origem,
        solicitadoPor: contexto.ator,
        criadoEm: FieldValue.serverTimestamp(),
      });
    return {
      estado: passo.tipo === 'impede' ? 'impedida' : 'aguardando_execucao',
      ciclo: passo.ciclo,
      avisoOutboxId,
      novo: passo.tipo === 'aguarda',
    };
  }

  private async tomar(
    referencia: DocumentReference,
    ator: Ator,
    agoraMs: number,
  ): Promise<void> {
    await this.db.runTransaction(async (transacao) => {
      conferirArrendamento(
        (await transacao.get(referencia)).data() as Protocolo,
        agoraMs,
      );
      transacao.update(referencia, {
        estado: 'em_execucao',
        arrendadoAte: Timestamp.fromMillis(agoraMs + ARRENDAMENTO_MS),
        execucaoIniciadaEm: FieldValue.serverTimestamp(),
        executadoPor: ator,
      });
    });
  }

  private async eliminar(
    protocolo: string,
    referencia: DocumentReference,
    dados: Protocolo,
    agoraMs: number,
  ): Promise<ResultadoDaExecucao> {
    const titular = await this.titularDoProtocolo(dados);
    const inventario = await this.inventario.reunirDe(titular);
    const lista = await this.impedimentosDe(inventario, agoraMs);
    if (lista.length > 0) {
      await referencia.update({
        estado: 'impedida',
        impedimentos: lista,
        arrendadoAte: FieldValue.delete(),
      });
      throw recusa('impedida', { impedimentos: lista });
    }

    const { escopo, guardaAte } = escopoDaEliminacao(
      inventario.registros,
      agoraMs,
    );
    await this.eliminador.bloquearConta(titular);
    const objetos = await this.eliminador.eliminarObjetos(inventario, escopo);
    const documentos = await this.eliminador.eliminarDocumentos(
      inventario,
      escopo,
    );
    let conta = false;
    if (titular.uid !== null) {
      await referencia.update({ etapa: 'conta' });
      conta = await this.eliminador.eliminarConta(titular.uid);
    }

    const resultado: ResultadoDaExecucao = {
      protocolo,
      estado: 'concluida',
      escopo,
      guardaAte: guardaAte === null ? null : guardaAte.toISOString(),
      eliminados: { documentos, objetos, conta },
      mantidos: gruposMantidos(inventario.registros, escopo),
    };
    await referencia.update(registroDeConclusao(resultado, guardaAte, titular));
    this.log.log({
      message: 'Eliminacao de titular concluida',
      protocolo,
      escopo,
      ...resultado.eliminados,
    });
    return resultado;
  }

  /**
   * O titular GRAVADO no protocolo, e nao resolvido de novo: numa retomada, a
   * conta ou o cadastro inicial podem ja ter saido.
   */
  private async titularDoProtocolo(dados: Protocolo): Promise<Titular> {
    let conta = null;
    if (dados.titularUid !== null) {
      try {
        conta = await this.auth.getUser(dados.titularUid);
      } catch (erro) {
        if (!usuarioAusente(erro)) throw erro;
      }
    }
    return {
      chave: dados.titularChave,
      uid: dados.titularUid,
      preCadastroId: dados.preCadastroId ?? '',
      conta,
    };
  }
}
