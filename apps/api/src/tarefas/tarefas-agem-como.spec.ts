import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A API cria tarefas no Cloud Tasks com o OIDC de `tarefas-lexintegra`
 * (`SERVICE_ACCOUNT_TAREFAS`), e o Cloud Tasks exige que QUEM CRIA a tarefa tenha
 * `iam.serviceAccounts.actAs` sobre essa conta. A concessao faltou ate
 * 05/10/2026: todo enfileiramento em producao voltava `PERMISSION_DENIED`, e
 * nenhum e-mail do outbox saia (convite de administrador, acesso de advogado,
 * redefinicao de senha). Nada local pegava — o emulador e o `pnpm dev` usam a
 * fila em processo —, entao a defesa e ler o Terraform.
 */
const PASTA = fileURLToPath(
  new URL('../../../../infra/terraform/', import.meta.url),
);
const TERRAFORM = readdirSync(PASTA)
  .filter((nome) => nome.endsWith('.tf'))
  .map((nome) => readFileSync(`${PASTA}${nome}`, 'utf8'))
  .join('\n');

function blocos(tipo: string): string[] {
  return [
    ...TERRAFORM.matchAll(
      new RegExp(`resource "${tipo}" "[^"]+" \\{[\\s\\S]*?\\n\\}`, 'g'),
    ),
  ].map(([bloco]) => bloco);
}

describe('a API pode criar tarefas com o OIDC de tarefas-lexintegra', () => {
  it('o Cloud Run entrega a conta das tarefas a API', () => {
    expect(TERRAFORM).toMatch(
      /name\s*=\s*"SERVICE_ACCOUNT_TAREFAS"\s*\n\s*value\s*=\s*google_service_account\.tarefas\.email/,
    );
  });

  it('a conta de runtime tem serviceAccountUser sobre tarefas-lexintegra', () => {
    const concessao = blocos('google_service_account_iam_member').find(
      (bloco) =>
        /service_account_id\s*=\s*google_service_account\.tarefas\.name/.test(
          bloco,
        ),
    );
    expect(concessao).toBeDefined();
    expect(concessao).toMatch(/role\s*=\s*"roles\/iam\.serviceAccountUser"/);
    expect(concessao).toMatch(
      /member\s*=\s*"serviceAccount:\$\{google_service_account\.api_runtime\.email\}"/,
    );
  });

  it('e pode enfileirar nas duas filas', () => {
    const enfileiram = blocos('google_cloud_tasks_queue_iam_member').filter(
      (bloco) =>
        /roles\/cloudtasks\.enqueuer/.test(bloco) &&
        /google_service_account\.api_runtime\.email/.test(bloco),
    );
    expect(enfileiram.join('\n')).toMatch(
      /google_cloud_tasks_queue\.varredura/,
    );
    expect(enfileiram.join('\n')).toMatch(/google_cloud_tasks_queue\.eventos/);
  });
});
