import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMAIL_TRANSPORT } from './email-transport.js';
import { EmailFalsoTransport } from './email-falso.transport.js';

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

describe('EmailFalsoTransport', () => {
  it('registra o que foi enviado e devolve identificador proprio', async () => {
    const transporte = new EmailFalsoTransport();

    const resultado = await transporte.enviar({
      para: ['a@b.test'],
      assunto: 'oi',
      corpoTexto: 'texto',
    });

    expect(resultado).toEqual({ sucesso: true, idProvedor: 'falso-1' });
    expect(transporte.enviadas).toHaveLength(1);
  });

  /**
   * O criterio de aceite da Etapa 7 e uma SEQUENCIA — falha, aparece no painel, e
   * entrega depois da correcao —, e por isso o modo de falha precisa ser ligado e
   * desligado no meio do cenario. Um dublê inline por teste nao faz isso sem
   * virar arame.
   */
  it('recusa tudo enquanto estiver em modo de falha', async () => {
    const transporte = new EmailFalsoTransport();
    transporte.falharCom('API key is invalid');

    await expect(
      transporte.enviar({ para: ['a@b.test'], assunto: 'x', corpoTexto: 'y' }),
    ).resolves.toEqual({ sucesso: false, motivo: 'API key is invalid' });
  });

  /**
   * A MENSAGEM RECUSADA NAO ENTRA EM `enviadas`. O provedor nao a aceitou, e
   * registrar ali faria o teste de "exatamente uma entrega" contar tentativa
   * como entrega — que e justamente o que ele existe para distinguir.
   */
  it('nao registra como enviada a mensagem recusada', async () => {
    const transporte = new EmailFalsoTransport();
    transporte.falharCom('fora do ar');

    await transporte.enviar({
      para: ['a@b.test'],
      assunto: 'x',
      corpoTexto: 'y',
    });

    expect(transporte.enviadas).toEqual([]);
  });

  it('volta a entregar depois da correcao', async () => {
    const transporte = new EmailFalsoTransport();
    transporte.falharCom('fora do ar');
    await transporte.enviar({ para: ['a@b.test'], assunto: 'x', corpoTexto: 'y' });

    transporte.voltarAFuncionar();
    await transporte.enviar({ para: ['a@b.test'], assunto: 'x', corpoTexto: 'y' });

    expect(transporte.enviadas).toHaveLength(1);
  });

  it('limpar zera o registro e o modo de falha', async () => {
    const transporte = new EmailFalsoTransport();
    transporte.falharCom('fora do ar');

    transporte.limpar();

    await expect(
      transporte.enviar({ para: ['a@b.test'], assunto: 'x', corpoTexto: 'y' }),
    ).resolves.toMatchObject({ sucesso: true });
  });
});
