import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';

/**
 * A idade do backup mais recente do Firestore (lote de novembro de 2026, ADR-23).
 *
 * POR QUE IDADE, E NAO "O BACKUP FALHOU". O Firestore tira os backups agendados
 * sozinho e nao emite metrica nem log documentado quando um deles falha. O que
 * da para perguntar e outra coisa: ha quanto tempo existe um backup PRONTO? E
 * essa pergunta que a sonda faz, e o limiar mora na politica de alerta
 * (`observabilidade.tf`, `backup_atrasado`), como nos outros sinais.
 *
 * SO LEITURA DE METADADOS. A conta de runtime tem `datastore.backupsViewer` e
 * `datastore.backupSchedulesViewer`, e mais nada sobre backups: este arquivo
 * lista nomes, estados e datas. Nao le o conteudo de um backup, nao restaura e
 * nao apaga — restaurar e operacao humana (docs/runbooks/restaurar-backup.md).
 *
 * REST, E NAO UM CLIENTE NOVO. Sao duas chamadas `GET`; `google-auth-library` ja
 * e dependencia, e um cliente gerado so para isto seria mais um pacote de
 * producao a auditar.
 */

/**
 * O que a sonda escreve quando NAO SABE a idade: nao ha backup nem agendamento,
 * ou a API recusou a leitura. Trinta dias, bem acima de qualquer limite de
 * alerta — a sonda falha FECHADA. Zero aqui significaria "tudo em dia" para
 * sempre, que e o contrario do que um alerta de backup deve dizer na duvida.
 */
export const IDADE_DESCONHECIDA_SEGUNDOS = 30 * 86_400;

export interface BackupListado {
  /** So backup em `READY` pode ser restaurado. */
  readonly pronto: boolean;
  /** Epoch em ms do instante que o backup retrata (`snapshotTime`). */
  readonly tiradoEm: number;
}

export interface EstadoDosBackups {
  readonly backups: readonly BackupListado[];
  /** Epoch em ms da criacao de cada agendamento do banco. */
  readonly agendamentosCriadosEm: readonly number[];
}

/** Quem le o estado dos backups. `null` no provedor: sob emulador nao ha o que ler. */
export interface LeitorDeBackups {
  ler(): Promise<EstadoDosBackups>;
}

export const LEITOR_DE_BACKUPS = Symbol('LeitorDeBackups');

/**
 * A regra, sem rede: a idade em segundos do que ha de mais recente para
 * restaurar.
 *
 * 1. Ha backup pronto: a idade do mais recente.
 * 2. Nao ha, mas ha agendamento: a idade do agendamento MAIS ANTIGO. No dia do
 *    deploy isso fica abaixo do limite e nao alarma; se o primeiro backup nunca
 *    sair, a idade cresce e alarma.
 * 3. Nao ha nem um nem outro: idade desconhecida.
 */
export function idadeDoBackup(estado: EstadoDosBackups, agora: number): number {
  const prontos = estado.backups
    .filter((backup) => backup.pronto)
    .map((backup) => backup.tiradoEm);

  if (prontos.length > 0) return segundosDesde(Math.max(...prontos), agora);

  if (estado.agendamentosCriadosEm.length > 0) {
    return segundosDesde(Math.min(...estado.agendamentosCriadosEm), agora);
  }

  return IDADE_DESCONHECIDA_SEGUNDOS;
}

function segundosDesde(instante: number, agora: number): number {
  return Math.max(0, Math.round((agora - instante) / 1_000));
}

/* -------------------------------------------------------------------------- */
/* As duas respostas da API de administracao, validadas                        */
/* -------------------------------------------------------------------------- */

/**
 * Instante em RFC 3339, como a API devolve. Um texto ilegivel e RECUSADO: virar
 * `NaN` em silencio faria o `Math.max` da regra devolver `NaN`, e a metrica
 * ficaria sem ponto.
 */
const instante = z.string().transform((texto, contexto) => {
  const ms = Date.parse(texto);
  if (!Number.isFinite(ms)) {
    contexto.addIssue({ code: 'custom', message: 'instante ilegivel' });
    return z.NEVER;
  }
  return ms;
});

const respostaDeBackups = z.object({
  backups: z
    .array(
      z.object({
        database: z.string().optional(),
        state: z.string().optional(),
        snapshotTime: instante,
      }),
    )
    .default([]),
  unreachable: z.array(z.string()).default([]),
});

const respostaDeAgendamentos = z.object({
  backupSchedules: z.array(z.object({ createTime: instante })).default([]),
});

/**
 * `GET .../locations/-/backups`. So os backups do banco pedido contam: o teste
 * de restauracao cria outro banco no mesmo projeto.
 *
 * RESPOSTA PARCIAL E ERRO. `unreachable` diz que uma regiao nao respondeu, e a
 * lista pode estar incompleta: tratar como completa poderia esconder o backup
 * que existe ou afirmar um que nao existe.
 */
export function interpretarBackups(
  resposta: unknown,
  banco: string,
): BackupListado[] {
  const lida = respostaDeBackups.parse(resposta);
  if (lida.unreachable.length > 0) {
    throw new Error('lista de backups parcial: ha regiao inalcancavel');
  }

  return lida.backups
    .filter((backup) => backup.database === banco)
    .map((backup) => ({
      pronto: backup.state === 'READY',
      tiradoEm: backup.snapshotTime,
    }));
}

/** `GET .../databases/(default)/backupSchedules`. */
export function interpretarAgendamentos(resposta: unknown): number[] {
  return respostaDeAgendamentos
    .parse(resposta)
    .backupSchedules.map((agendamento) => agendamento.createTime);
}

/* -------------------------------------------------------------------------- */
/* O adaptador de producao                                                      */
/* -------------------------------------------------------------------------- */

const API = 'https://firestore.googleapis.com/v1';
const BANCO_PADRAO = '(default)';

/** A sonda tem 30 s para tudo (`sinais.tf`); cada chamada nao passa de 5. */
const PRAZO_MS = 5_000;

/**
 * Le os backups e os agendamentos do banco `(default)` pela API de
 * administracao, com a identidade da conta de runtime.
 *
 * Unico arquivo que conhece essas duas URLs. Nao ha valor vindo de fora na URL:
 * o projeto e o da propria aplicacao, e o banco e literal.
 */
export class LeitorDeBackupsDoFirestore implements LeitorDeBackups {
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });

  constructor(private readonly projeto: string) {}

  async ler(): Promise<EstadoDosBackups> {
    const projeto = `projects/${encodeURIComponent(this.projeto)}`;
    const banco = `${projeto}/databases/${BANCO_PADRAO}`;

    const [backups, agendamentos] = await Promise.all([
      this.obter(`${API}/${projeto}/locations/-/backups`),
      this.obter(`${API}/${banco}/backupSchedules`),
    ]);

    return {
      backups: interpretarBackups(
        backups,
        `projects/${this.projeto}/databases/${BANCO_PADRAO}`,
      ),
      agendamentosCriadosEm: interpretarAgendamentos(agendamentos),
    };
  }

  private async obter(url: string): Promise<unknown> {
    const cliente = await this.auth.getClient();
    const resposta = await cliente.request<unknown>({
      url,
      method: 'GET',
      timeout: PRAZO_MS,
    });
    return resposta.data;
  }
}
