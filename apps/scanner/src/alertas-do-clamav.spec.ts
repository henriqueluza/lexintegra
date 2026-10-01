import { readFileSync } from 'node:fs';
import { SINAL_SEM_BASE } from './base-do-clamav.js';

/**
 * Os alertas do ClamAV casam texto de log, e texto de log nao quebra compilacao.
 *
 * As politicas de `infra/terraform/observabilidade.tf` filtram por campos que o
 * scanner e o job escrevem. Se um lado mudar sem o outro, o alerta continua
 * existindo em producao e nunca mais dispara — foi assim que a base ficou sem
 * atualizar de 14/09 a 29/09/2026 sem nenhum aviso. Estes testes leem os dois
 * lados em vez de repetir os valores a mao.
 */
const ler = (relativo: string): string =>
  readFileSync(new URL(relativo, import.meta.url), 'utf8');

const TERRAFORM = ler('../../../infra/terraform/observabilidade.tf');

function politica(nome: string): string {
  const inicio = TERRAFORM.indexOf(
    `resource "google_monitoring_alert_policy" "${nome}"`,
  );
  expect(inicio).toBeGreaterThanOrEqual(0);
  const fim = TERRAFORM.indexOf('\nresource "', inicio + 1);
  return TERRAFORM.slice(inicio, fim === -1 ? undefined : fim);
}

describe('alerta de scanner sem base', () => {
  it('a politica casa o sinal que o scanner escreve', () => {
    expect(politica('clamav_scanner_sem_base')).toContain(
      `jsonPayload.sinal=\\"${SINAL_SEM_BASE}\\"`,
    );
  });

  it('o servidor usa a constante, e nao um literal que possa divergir', () => {
    const servidor = ler('./servidor.ts');

    expect(servidor).not.toContain(`'${SINAL_SEM_BASE}'`);
    expect(servidor.match(/sinal: SINAL_SEM_BASE/g)).toHaveLength(2);
  });
});

describe('alerta de falha do job da base', () => {
  it('a politica casa ERROR do cloud_run_job, que e o que o job escreve na falha', () => {
    const filtro = politica('clamav_job_erro');

    expect(filtro).toContain('resource.type=\\"cloud_run_job\\"');
    expect(filtro).toContain('severity>=ERROR');
    expect(ler('./atualizar-base.ts')).toMatch(
      /registrar\('ERROR', 'atualizacao da base do ClamAV falhou'/,
    );
  });

  it('o Scheduler que nao consegue iniciar o job tambem alerta', () => {
    const filtro = politica('clamav_scheduler_falhou');

    expect(filtro).toContain('resource.type=\\"cloud_scheduler_job\\"');
    expect(filtro).toContain('severity>=ERROR');
  });
});

/**
 * `|| true` e `2>/dev/null` na entrada foram o que escondeu o primeiro defeito
 * da base: um `gcloud storage cp` que nao existia na imagem falhava sem deixar
 * nenhuma linha no log. Os comentarios podem citar os dois; o codigo, nao.
 */
describe('entrada.sh', () => {
  const codigo = ler('../entrada.sh')
    .split('\n')
    .filter((linha) => !linha.trimStart().startsWith('#'))
    .join('\n');

  it('nao engole falha com || true', () => {
    expect(codigo).not.toContain('|| true');
  });

  it('nao descarta o stderr', () => {
    expect(codigo).not.toContain('2>/dev/null');
  });
});
