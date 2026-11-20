import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module.js';
import { COLECAO_OUTBOX } from '../outbox/outbox.service.js';
import {
  CONFIGURACAO_REUNIOES,
  type ConfiguracaoReunioes,
} from '../reunioes/sala/modo.js';
import {
  IDADE_DESCONHECIDA_SEGUNDOS,
  idadeDoBackup,
  LEITOR_DE_BACKUPS,
  type LeitorDeBackups,
} from './backups.js';
import { idadeDaReuniaoSemSala } from './reunioes.js';

/**
 * O que a sonda mede, em segundos. Zero quando nao ha nada esperando.
 *
 * SEMPRE TODOS OS CAMPOS, inclusive zerados. Omitir o campo quando nao ha
 * pendencia faria a metrica ficar sem ponto, e "sem dado" e indistinguivel de
 * "sonda parada" — a politica de alerta leria as duas situacoes do mesmo jeito.
 */
export interface Sinais {
  readonly outboxSegundos: number;
  readonly quarentenaSegundos: number;
  /** Reuniao em `reservada_sem_link` ha mais tempo (`sinais/reunioes.ts`). */
  readonly reuniaoSemSalaSegundos: number;
  /**
   * Idade do backup pronto mais recente do Firestore (`sinais/backups.ts`,
   * ADR-23). E o unico sinal que NAO vem do banco: vem da API de administracao.
   * Zero sob emulador, onde nao ha backup; `IDADE_DESCONHECIDA_SEGUNDOS` quando
   * a leitura falha.
   */
  readonly backupSegundos: number;
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
    @Inject(LEITOR_DE_BACKUPS)
    private readonly backups: LeitorDeBackups | null,
  ) {}

  async medir(agora: number = Date.now()): Promise<Sinais> {
    const sinais: Sinais = {
      outboxSegundos: await this.idadeDoOutbox(agora),
      quarentenaSegundos: await this.idadeDaQuarentena(agora),
      /*
       * No modo `sem-sala` TODA reuniao fica sem sala ate o Teams ser ligado,
       * de proposito. Medir aqui faria o alerta disparar a cada reuniao marcada.
       */
      reuniaoSemSalaSegundos:
        this.reunioes.modo === 'sem-sala'
          ? 0
          : await idadeDaReuniaoSemSala(this.db, agora),
      backupSegundos: await this.idadeDoBackup(agora),
    };

    this.log.log('sinais operacionais', { sinal: 'sinais', ...sinais });
    return sinais;
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

  /**
   * Idade do backup mais recente, ou a idade desconhecida se a leitura falhar.
   *
   * A FALHA NAO SOBE. Este e o unico sinal que depende de outra API, e uma
   * recusa dela nao pode levar junto as tres medicoes do Firestore: a sonda
   * responderia 500, nenhuma metrica receberia ponto, e o alerta que dispararia
   * seria o da sonda parada — apontando para o lugar errado. A falha vira a
   * idade desconhecida, que e alta de proposito, e um aviso no log dizendo por
   * que; a politica so alarma se isso durar uma hora.
   */
  private async idadeDoBackup(agora: number): Promise<number> {
    if (this.backups === null) return 0;

    try {
      return idadeDoBackup(await this.backups.ler(), agora);
    } catch (erro) {
      this.log.warn('backups do Firestore ilegiveis', {
        sinal: 'sinais.backup-ilegivel',
        motivo: erro instanceof Error ? erro.message : 'motivo desconhecido',
      });
      return IDADE_DESCONHECIDA_SEGUNDOS;
    }
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
