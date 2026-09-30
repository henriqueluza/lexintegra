import { readFileSync } from 'node:fs';

/**
 * Trava o numero de proxies confiaveis em 2.
 *
 * O valor foi MEDIDO em producao em 30/09/2026: `X-Forwarded-For` trazia dois
 * enderecos, e com `trust proxy` = 2 o Express devolveu como `ip` o do visitante
 * (o primeiro da lista). Se alguem mudar o default do Terraform, o limitador de
 * requisicoes passa a contar a borda do Hosting ou do Cloud Run como se fosse o
 * visitante, e conta o mundo inteiro como um so: nao falha, so para de proteger.
 * Mudar o numero exige refazer a medicao, e este teste e o lugar onde essa
 * decisao aparece no diff.
 */
const VARIAVEIS = readFileSync(
  new URL('../../../infra/terraform/variables.tf', import.meta.url),
  'utf8',
);
const CLOUD_RUN = readFileSync(
  new URL('../../../infra/terraform/cloud_run.tf', import.meta.url),
  'utf8',
);

describe('proxies confiaveis em producao', () => {
  it('o default do Terraform e 2', () => {
    const bloco = /variable\s+"proxies_confiaveis"\s*\{([\s\S]*?)\n\}/.exec(
      VARIAVEIS,
    )?.[1];

    expect(bloco).toBeDefined();
    expect(/^\s*default\s*=\s*(\d+)\s*$/m.exec(bloco ?? '')?.[1]).toBe('2');
  });

  it('o Cloud Run recebe o valor da variavel, sem numero fixo ao lado', () => {
    expect(CLOUD_RUN).toMatch(
      /name\s*=\s*"PROXIES_CONFIAVEIS"\s*\n\s*value\s*=\s*tostring\(var\.proxies_confiaveis\)/,
    );
  });
});
