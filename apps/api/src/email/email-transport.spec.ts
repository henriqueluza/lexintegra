import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMAIL_TRANSPORT } from './email-transport.js';

describe('contrato de EmailTransport', () => {
  it('expoe um token de injecao estavel', () => {
    expect(typeof EMAIL_TRANSPORT).toBe('symbol');
  });

  /**
   * Guarda deliberada: ADR-07.1 diz que o provedor e configuracao, nao decisao
   * estrutural. Se um SDK de provedor aparecer neste modulo antes da Etapa 7, o
   * contrato virou implementacao e o acoplamento que o ADR evita ja aconteceu.
   */
  it('nao carrega dependencia de provedor', () => {
    const caminho = fileURLToPath(
      new URL('./email-transport.ts', import.meta.url),
    );
    const fonte = readFileSync(caminho, 'utf8');
    expect(fonte).not.toMatch(/from ['"]resend['"]/);
    expect(fonte).not.toMatch(/require\(['"]resend['"]\)/);
  });
});
