import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { COLECAO_OUTBOX } from '../outbox/outbox.service.js';
import {
  CONFIGURACAO_REUNIOES,
  type ConfiguracaoReunioes,
} from '../reunioes/sala/modo.js';
import { advogadosSemLink, idadeDaReuniaoSemSala } from './reunioes.js';

/**
 * O que a sonda mede, em segundos. Zero quando nao ha nada esperando.
 *
 * SEMPRE OS DOIS CAMPOS, inclusive zerados. Omitir o campo quando nao ha
 * pendencia faria a metrica ficar sem ponto, e "sem dado" e indistinguivel de
 * "sonda parada" — a politica de alerta leria as duas situacoes do mesmo jeito.
 */
export interface Sinais {
  readonly outboxSegundos: number;
  readonly quarentenaSegundos: number;
  /** Reuniao em `reservada_sem_link` ha mais tempo (`sinais/reunioes.ts`). */
  readonly reuniaoSemSalaSegundos: number;
}

/**
 * O que a sonda devolve: os sinais da linha `sinais` e quantos advogados sairam
 * como `disponibilidade.sem-link` — `null` com o Teams desligado, porque ai nada
 * e medido (ver `medirDisponibilidadeSemLink`).
 */
export interface Medicao extends Sinais {
  readonly advogadosSemLink: number | null;
}

/**
 * Sinais operacionais que so existem dentro do Firestore.
 *
 * A arquitetura (secao 9) pede metricas de NEGOCIO como sinal operacional —
 * "outbox pendente ha mais de N minutos", "arquivos parados em quarentena". O
 * Cloud Monitoring nao consulta o Firestore: alguem precisa olhar e escrever o
 * numero num log, e essa e a unica razao de esta classe existir.
 *
 * ELA SO LE E LOGA. Nao corrige nada, nao reenfileira nada, nao alerta nada. Uma
 * sonda que consertasse o que mede viraria um segundo caminho de entrega do
 * outbox, e a regra inviolavel 3 e explicita: quem decide se vale entregar e
 * `OutboxService.reivindicar`, e mais ninguem.
 *
 * O LIMIAR NAO ESTA AQUI. "Mais de N minutos" e decisao de operacao, e vive na
 * politica de alerta do Terraform. Aqui sai a idade crua — mudar o limiar nao
 * deve exigir deploy da API.
 */
@Injectable()
export class SinaisService {
  private readonly log = new Logger('Sinais');

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(CONFIGURACAO_REUNIOES)
    private readonly reunioes: ConfiguracaoReunioes,
  ) {}

  async medir(agora: number = Date.now()): Promise<Medicao> {
    const sinais: Sinais = {
      outboxSegundos: await this.idadeDoOutbox(agora),
      quarentenaSegundos: await this.idadeDaQuarentena(agora),
      reuniaoSemSalaSegundos: await idadeDaReuniaoSemSala(this.db, agora),
    };

    this.log.log('sinais operacionais', { sinal: 'sinais', ...sinais });

    return {
      ...sinais,
      advogadosSemLink: await this.medirDisponibilidadeSemLink(agora),
    };
  }

  /**
   * Uma linha `disponibilidade.sem-link` POR ADVOGADO: a metrica e um contador de
   * linhas, e a politica dispara com qualquer ocorrencia na janela.
   *
   * COM O TEAMS DESLIGADO, NAO EMITE NADA, e a escolha e esta — e nao "emitir e a
   * politica ignorar". Com `REUNIOES_MODO=desligado` ninguem marca reuniao, e todo
   * advogado estaria "sem link" por uma integracao desligada de proposito: a
   * politica precisaria saber do modo para nao disparar para sempre, e o modo e
   * configuracao da API, nao do Monitoring. Sem linha, a metrica fica sem ponto,
   * `> 0` nunca e verdadeiro, e o silencio e o correto. Quem cobre "a sonda
   * parou" e o alerta de sonda parada, que nao depende deste sinal.
   */
  private async medirDisponibilidadeSemLink(
    agora: number,
  ): Promise<number | null> {
    if (this.reunioes.modo === 'desligado') return null;

    const advogados = await advogadosSemLink(this.db, agora);
    for (const advogadoId of advogados) {
      this.log.log(
        `advogado ${advogadoId} com horario publicado e sem usuarioTeams`,
        { sinal: 'disponibilidade.sem-link', advogadoId },
      );
    }
    return advogados.length;
  }

  /**
   * Idade do registro NAO ENTREGUE mais antigo, por `criadoEm`.
   *
   * `criadoEm` e nao `varrerApos`: o segundo anda para frente a cada tentativa, e
   * um registro que falha ha horas teria "idade" de minutos. O que interessa e ha
   * quanto tempo o fato de negocio existe sem o e-mail ter saido.
   *
   * `pendente` e `falhou` sao consultas separadas porque o Firestore nao tem `in`
   * barato com desigualdade — e duas consultas indexadas que quase sempre voltam
   * vazias custam menos que uma que varre.
   */
  private async idadeDoOutbox(agora: number): Promise<number> {
    const idades = await Promise.all(
      (['pendente', 'falhou'] as const).map((estado) =>
        this.idadeDoMaisAntigo(
          this.db
            .collection(COLECAO_OUTBOX)
            .where('estado', '==', estado)
            .orderBy('criadoEm', 'asc')
            .limit(1),
          'criadoEm',
          agora,
        ),
      ),
    );

    return Math.max(...idades);
  }

  /**
   * Idade do arquivo mais antigo ainda esperando veredito, nos DOIS fluxos.
   *
   * Consulta de grupo de colecao: anexo e entregavel vivem sob `pedidos/{id}`, e
   * o que interessa e o mais antigo do sistema inteiro, nao o de um pedido. Sao
   * as primeiras consultas de grupo do projeto — os indices correspondentes estao
   * em `firestore.tf` com `query_scope = "COLLECTION_GROUP"`.
   *
   * O CASO QUE ISTO PEGA e o que nenhum alerta de erro pegaria: a tarefa de
   * varredura esgotou as tentativas e sumiu da fila. Nada falhou agora, ninguem
   * foi avisado, e o arquivo fica em quarentena para sempre — invisivel, porque
   * o cliente so ve "em verificacao de seguranca".
   */
  private async idadeDaQuarentena(agora: number): Promise<number> {
    const [anexos, entregaveis] = await Promise.all([
      this.idadeDoMaisAntigo(
        this.db
          .collectionGroup('anexos')
          .where('estado', '==', 'pendente_scan')
          .orderBy('criadoEm', 'asc')
          .limit(1),
        'criadoEm',
        agora,
      ),
      this.idadeDoMaisAntigo(
        this.db
          .collectionGroup('entregaveis')
          .where('arquivoAtual.estado', '==', 'pendente_scan')
          .orderBy('arquivoAtual.enviadoEm', 'asc')
          .limit(1),
        'arquivoAtual.enviadoEm',
        agora,
      ),
    ]);

    return Math.max(anexos, entregaveis);
  }

  private async idadeDoMaisAntigo(
    consulta: { get(): Promise<{ docs: { data(): unknown }[] }> },
    campo: string,
    agora: number,
  ): Promise<number> {
    const pagina = await consulta.get();
    const documento = pagina.docs[0];
    if (documento === undefined) return 0;

    const carimbo = valorPorCaminho(documento.data(), campo);
    const instante = (carimbo as Timestamp | undefined)?.toMillis?.();
    if (instante === undefined) return 0;

    return Math.max(0, Math.round((agora - instante) / 1_000));
  }
}

/** `arquivoAtual.enviadoEm` — o carimbo do entregavel mora dentro de um objeto. */
function valorPorCaminho(dados: unknown, campo: string): unknown {
  return campo
    .split('.')
    .reduce<unknown>(
      (atual, parte) =>
        typeof atual === 'object' && atual !== null
          ? (atual as Record<string, unknown>)[parte]
          : undefined,
      dados,
    );
}
