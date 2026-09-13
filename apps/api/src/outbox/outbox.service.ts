import { Inject, Injectable } from '@nestjs/common';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module.js';
import {
  idDoEvento,
  type EstadoEntrega,
  type RegistroOutbox,
  type TipoEvento,
} from './evento.js';
import {
  CONFIGURACAO_OUTBOX,
  POLITICA,
  type ConfiguracaoDoOutbox,
} from './politica.js';

export const COLECAO_OUTBOX = 'outbox';

/**
 * O que `reivindicar` devolve. Uniao discriminada, e nao um booleano: quem chama
 * precisa distinguir "ja foi entregue" de "outra tarefa esta com ele" de "acabou o
 * orcamento", porque os tres viram respostas HTTP diferentes e o Cloud Tasks
 * decide reentregar ou nao a partir disso.
 */
export type Reivindicacao =
  | { readonly situacao: 'concedida'; readonly registro: RegistroOutbox }
  | { readonly situacao: 'inexistente' }
  | { readonly situacao: 'ja-entregue' }
  | { readonly situacao: 'abandonado' }
  | { readonly situacao: 'em-andamento' };

/**
 * O que o varredor precisa para reenfileirar: o id e o que compoe o NOME da
 * tarefa. Devolvido pela propria consulta, e nao relido registro a registro — uma
 * passagem do varredor mexe com ate um lote inteiro.
 */
export interface ReferenciaDeTarefa {
  readonly id: string;
  readonly ciclo: number;
  readonly tentativas: number;
}

export type ResultadoDaEntrega =
  | { readonly sucesso: true }
  | { readonly sucesso: false; readonly motivo: string };

/**
 * Escrita e coordenacao do outbox (regras invioláveis 2 e 3).
 *
 * `registrar` recebe a TRANSACAO de fora e nao abre a sua propria. E o ponto
 * inteiro do padrao: a notificacao precisa nascer na MESMA transacao que produz o
 * fato de negocio, para nao existir estado em que o advogado foi criado e o
 * e-mail de acesso nao. Um metodo que abrisse a propria transacao aqui daria a
 * aparencia de outbox sem a garantia.
 *
 * NENHUM EFEITO COLATERAL ACONTECE AQUI (regra inviolavel 2). Transacao do
 * Firestore e reexecutada sob contencao: uma chamada ao Resend dentro do corpo
 * sairia duas vezes. O envio e do despachante, depois do commit.
 */
@Injectable()
export class OutboxService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(CONFIGURACAO_OUTBOX)
    private readonly config: ConfiguracaoDoOutbox,
  ) {}

  referencia(id: string): DocumentReference {
    return this.db.collection(COLECAO_OUTBOX).doc(id);
  }

  /**
   * Grava o evento e devolve o id. Usa `create`, nao `set`: `set` sobrescreveria
   * silenciosamente um registro ja entregue, e com ele a idempotencia que o id
   * deterministico existe para dar.
   */
  registrar(
    transacao: Transaction,
    evento: { tipo: TipoEvento; destinatarioUid: string },
    agora: number = Date.now(),
  ): string {
    const id = idDoEvento(evento.tipo, evento.destinatarioUid, agora);

    transacao.create(this.referencia(id), {
      tipo: evento.tipo,
      destinatarioUid: evento.destinatarioUid,
      estado: 'pendente',
      criadoEm: FieldValue.serverTimestamp(),
      tentativas: 0,
      ciclo: 0,
      /*
       * Ja nasce com atraso: a tarefa e enfileirada logo depois do commit, e um
       * varredor que pudesse pegar o registro no mesmo minuto criaria uma segunda
       * tarefa para algo que ainda nem teve a primeira chance.
       */
      varrerApos: Timestamp.fromMillis(agora + this.config.atrasoDoVarredorMs),
    });

    return id;
  }

  /**
   * Variante idempotente: le antes de escrever, dentro da mesma transacao.
   *
   * Existe porque `registrar` e `registrarSeAusente` servem a necessidades
   * OPOSTAS, e confundi-las quebraria uma das duas.
   *
   * O pedido de redefinicao de senha QUER a falha por duplicata — e ela que
   * limita o abuso dentro da janela. Ja a criacao de advogado toca tres sistemas
   * sem transacao comum (Auth, Firestore, outbox), e precisa poder ser repetida
   * para retomar de onde parou; ali, um `create` que estoura na segunda tentativa
   * derrubaria junto a escrita do documento do advogado, e a operacao nunca
   * terminaria.
   *
   * A leitura vem antes de qualquer escrita porque o Firestore exige essa ordem
   * dentro de uma transacao. Quem chamar este metodo depois de um `set` na mesma
   * transacao recebe erro do proprio SDK.
   */
  async registrarSeAusente(
    transacao: Transaction,
    evento: { tipo: TipoEvento; destinatarioUid: string },
    agora?: number,
  ): Promise<string> {
    const id = idDoEvento(evento.tipo, evento.destinatarioUid, agora);
    const existente = await transacao.get(this.referencia(id));
    if (existente.exists) return id;

    return this.registrar(transacao, evento, agora);
  }

  async ler(id: string): Promise<RegistroOutbox | null> {
    const documento = await this.referencia(id).get();
    return documento.exists ? (documento.data() as RegistroOutbox) : null;
  }

  /**
   * A TRAVA CONTRA ENTREGA DUPLICADA.
   *
   * Ha dois mecanismos de retentativa independentes — a fila, que reentrega
   * sozinha, e o varredor, que reenfileira o que parece perdido — e o reenvio
   * manual do administrador como terceiro caminho. Nada impede que dois deles
   * cheguem ao mesmo registro na mesma janela, e `enviar` NAO e idempotente:
   * mandar duas vezes e um e-mail duplicado, nao um no-op.
   *
   * Ler o estado e depois enviar nao resolve: duas tarefas leem `pendente`, as
   * duas passam pela conferencia e as duas enviam. E a transacao que transforma
   * isso num compare-and-set — uma commita, a outra reexecuta e ve o arrendamento.
   *
   * `tentativas` INCREMENTA AQUI, e nao na conclusao. E o que faz um processo que
   * morre no meio consumir uma tentativa, e portanto o que torna o teto real.
   * `concluir` nao incrementa; se alguem reintroduzir isso, o orcamento passa a
   * ser gasto em dobro e o registro e abandonado na metade do caminho.
   */
  async reivindicar(
    id: string,
    agora: number = Date.now(),
  ): Promise<Reivindicacao> {
    return this.db.runTransaction(async (transacao) => {
      const documento = await transacao.get(this.referencia(id));
      if (!documento.exists) return { situacao: 'inexistente' } as const;

      const registro = documento.data() as RegistroOutbox;
      if (registro.estado === 'enviado') {
        return { situacao: 'ja-entregue' } as const;
      }
      if (registro.estado === 'abandonado') {
        return { situacao: 'abandonado' } as const;
      }
      if (
        registro.arrendadoAte !== undefined &&
        registro.arrendadoAte.toMillis() > agora
      ) {
        return { situacao: 'em-andamento' } as const;
      }

      const arrendadoAte = Timestamp.fromMillis(
        agora + this.config.arrendamentoMs,
      );

      transacao.update(this.referencia(id), {
        arrendadoAte,
        tentativas: FieldValue.increment(1),
        ultimaTentativaEm: Timestamp.fromMillis(agora),
        /*
         * NUNCA ANTES DO FIM DO ARRENDAMENTO. Um varredor que acordasse com o
         * arrendamento vivo receberia `em-andamento` e teria gasto a volta a toa —
         * e, pior, criaria a tarefa cuja deduplicacao so o nome impede.
         */
        varrerApos: Timestamp.fromMillis(
          Math.max(
            agora + this.config.atrasoDoVarredorMs,
            arrendadoAte.toMillis(),
          ),
        ),
      });

      return {
        situacao: 'concedida',
        registro: {
          ...registro,
          tentativas: registro.tentativas + 1,
          arrendadoAte,
        },
      } as const;
    });
  }

  /**
   * Fecha a reivindicacao. Devolve o estado em que o registro ficou.
   *
   * `abandonado` quando o orcamento da politica acabou: sem ele, um registro
   * permanentemente quebrado seria reenfileirado a cada minuto para sempre.
   */
  async concluir(
    id: string,
    registro: RegistroOutbox,
    resultado: ResultadoDaEntrega,
    agora: number = Date.now(),
  ): Promise<EstadoEntrega> {
    if (resultado.sucesso) {
      await this.referencia(id).update({
        estado: 'enviado',
        enviadoEm: Timestamp.fromMillis(agora),
        arrendadoAte: FieldValue.delete(),
        ultimoErro: FieldValue.delete(),
      });
      return 'enviado';
    }

    const esgotou =
      registro.tentativas >= POLITICA[registro.tipo].maxTentativas;

    await this.referencia(id).update({
      estado: esgotou ? 'abandonado' : 'falhou',
      /*
       * `motivo` ja chega limpo de endereco de e-mail pelo adaptador. O campo e
       * gravado no Firestore e aparece no painel do administrador, entao dado
       * pessoal aqui seria dado pessoal replicado no backup e no PITR.
       */
      ultimoErro: resultado.motivo.slice(0, 500),
      arrendadoAte: FieldValue.delete(),
      varrerApos: Timestamp.fromMillis(agora + this.config.atrasoDoVarredorMs),
    });

    return esgotou ? 'abandonado' : 'falhou';
  }

  /**
   * O que o varredor reenfileira: registros parados ha tempo suficiente.
   *
   * Duas consultas de igualdade em vez de uma com `in`. O dublê do Firestore
   * recusa operador nao implementado, e um indice composto so
   * (`estado` + `varrerApos`) serve as duas — entao a forma mais simples tambem e
   * a que continua testavel sem emulador.
   */
  async listarParaVarredura(
    estado: EstadoEntrega,
    agora: number = Date.now(),
  ): Promise<readonly ReferenciaDeTarefa[]> {
    const consulta = await this.db
      .collection(COLECAO_OUTBOX)
      .where('estado', '==', estado)
      .where('varrerApos', '<=', Timestamp.fromMillis(agora))
      .orderBy('varrerApos')
      .limit(this.config.loteDoVarredor)
      .get();

    return consulta.docs.map((documento) => {
      const registro = documento.data() as RegistroOutbox;
      return {
        id: documento.id,
        ciclo: registro.ciclo,
        tentativas: registro.tentativas,
      };
    });
  }

  /**
   * Reenvio manual do administrador: devolve o registro ao inicio.
   *
   * `ciclo` incrementa e `tentativas` zera. O ciclo entra na chave de
   * idempotencia mandada ao provedor — sem ele o reenvio carregaria a mesma chave
   * da entrega que falhou, seria deduplicado do outro lado, e o botao que existe
   * para consertar uma falha nao enviaria nada.
   *
   * O arrendamento e apagado de proposito: um registro cujo processo morreu
   * durante a entrega fica preso ate o arrendamento vencer, e este botao e
   * justamente a saida manual para isso.
   */
  async reabrir(id: string, agora: number = Date.now()): Promise<void> {
    await this.referencia(id).update({
      estado: 'pendente',
      tentativas: 0,
      ciclo: FieldValue.increment(1),
      arrendadoAte: FieldValue.delete(),
      ultimoErro: FieldValue.delete(),
      varrerApos: Timestamp.fromMillis(agora + this.config.atrasoDoVarredorMs),
    });
  }

  /** Uma pagina do painel do administrador, do mais recente para o mais antigo. */
  async listar(
    estado: EstadoEntrega | null,
    limite: number,
  ): Promise<readonly (RegistroOutbox & { id: string })[]> {
    const colecao = this.db.collection(COLECAO_OUTBOX);
    const base =
      estado === null ? colecao : colecao.where('estado', '==', estado);

    const consulta = await base.orderBy('criadoEm', 'desc').limit(limite).get();

    return consulta.docs.map((documento) => ({
      id: documento.id,
      ...(documento.data() as RegistroOutbox),
    }));
  }
}
