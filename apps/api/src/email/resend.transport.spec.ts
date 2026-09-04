import type { Resend } from 'resend';
import { EmailFalsoTransport } from './email-falso.transport.js';
import type { EmailMensagem } from './email-transport.js';
import { criarTransporte } from './email.module.js';
import { redigirEnderecos } from './redigir.js';
import { ResendEmailTransport } from './resend.transport.js';

type Envio = Parameters<Resend['emails']['send']>[0];
type Resposta = Awaited<ReturnType<Resend['emails']['send']>>;

function clienteFalso(responder: () => Resposta): {
  cliente: Resend;
  envios: Envio[];
} {
  const envios: Envio[] = [];
  const cliente = {
    emails: {
      send: (opcoes: Envio) => {
        envios.push(opcoes);
        return Promise.resolve().then(responder);
      },
    },
  } as unknown as Resend;

  return { cliente, envios };
}

function aceitando(id = 'id-do-provedor'): {
  transporte: ResendEmailTransport;
  envios: Envio[];
} {
  const { cliente, envios } = clienteFalso(
    () => ({ data: { id }, error: null }) as Resposta,
  );
  return {
    transporte: new ResendEmailTransport(cliente, 'remetente@teste.local'),
    envios,
  };
}

const MENSAGEM_DE_MODELO: EmailMensagem = {
  para: ['destinatario@teste.local'],
  modelo: {
    alias: 'password-reset',
    variaveis: { LINK: 'https://exemplo.test/definir-senha?oobCode=abc' },
  },
};

const MENSAGEM_REDIGIDA: EmailMensagem = {
  para: ['destinatario@teste.local'],
  assunto: 'Assunto',
  corpoTexto: 'Corpo em texto',
};

describe('redigirEnderecos', () => {
  /**
   * O caso concreto que motivou a funcao: e a resposta literal da conta de
   * desenvolvimento do Resend. Sem limpeza, esse endereco entra no documento do
   * outbox e no Cloud Logging — dado pessoal identificavel, que a secao de LGPD
   * proibe registrar.
   */
  it('tira o endereco da mensagem de erro do provedor', () => {
    expect(
      redigirEnderecos(
        'You can only send testing emails to your own email address (fulano@dominio.com)',
      ),
    ).toBe(
      'You can only send testing emails to your own email address ([e-mail])',
    );
  });

  it('tira todos os enderecos, nao so o primeiro', () => {
    expect(redigirEnderecos('de a@b.co para c@d.co')).toBe(
      'de [e-mail] para [e-mail]',
    );
  });

  it('nao engole o ponto final da frase', () => {
    expect(redigirEnderecos('nao pode enviar para fulano@dominio.com.')).toBe(
      'nao pode enviar para [e-mail].',
    );
  });

  it('deixa intacto o texto sem endereco', () => {
    expect(redigirEnderecos('Rate limit exceeded')).toBe('Rate limit exceeded');
  });
});

describe('ResendEmailTransport', () => {
  it('envia mensagem de modelo pelo alias, com as variaveis', async () => {
    const { transporte, envios } = aceitando();

    await transporte.enviar(MENSAGEM_DE_MODELO);

    expect(envios).toEqual([
      {
        from: 'remetente@teste.local',
        to: ['destinatario@teste.local'],
        template: {
          id: 'password-reset',
          variables: {
            LINK: 'https://exemplo.test/definir-senha?oobCode=abc',
          },
        },
      },
    ]);
  });

  /**
   * O remetente vem do construtor, que o modulo alimenta com `EMAIL_FROM`. Se
   * algum dia aparecer um endereco literal aqui, a troca de
   * `onboarding@resend.dev` por `notificacoes.lexintegra.com.br` deixa de ser
   * configuracao e vira alteracao de codigo.
   */
  it('usa o remetente que recebeu, nunca um literal', async () => {
    const { cliente, envios } = clienteFalso(
      () => ({ data: { id: 'x' }, error: null }) as Resposta,
    );
    const transporte = new ResendEmailTransport(cliente, 'outro@teste.local');

    await transporte.enviar(MENSAGEM_REDIGIDA);

    expect(envios[0].from).toBe('outro@teste.local');
  });

  it('envia mensagem redigida com assunto e texto', async () => {
    const { transporte, envios } = aceitando();

    await transporte.enviar({
      ...MENSAGEM_REDIGIDA,
      corpoHtml: '<p>Corpo</p>',
    });

    expect(envios[0]).toMatchObject({
      subject: 'Assunto',
      text: 'Corpo em texto',
      html: '<p>Corpo</p>',
    });
    expect(envios[0]).not.toHaveProperty('template');
  });

  it('omite html quando nao ha, em vez de mandar undefined', async () => {
    const { transporte, envios } = aceitando();

    await transporte.enviar(MENSAGEM_REDIGIDA);

    expect(envios[0]).not.toHaveProperty('html');
  });

  it('devolve o identificador do provedor no sucesso', async () => {
    const { transporte } = aceitando('re_123');

    await expect(transporte.enviar(MENSAGEM_DE_MODELO)).resolves.toEqual({
      sucesso: true,
      idProvedor: 're_123',
    });
  });

  it('converte erro do provedor em falha, sem lancar', async () => {
    const { cliente } = clienteFalso(
      () =>
        ({
          data: null,
          error: { message: 'Rate limit exceeded', name: 'rate_limit' },
        }) as unknown as Resposta,
    );
    const transporte = new ResendEmailTransport(cliente, 'r@teste.local');

    await expect(transporte.enviar(MENSAGEM_DE_MODELO)).resolves.toEqual({
      sucesso: false,
      motivo: 'Rate limit exceeded',
    });
  });

  it('limpa endereco da mensagem de erro do provedor', async () => {
    const { cliente } = clienteFalso(
      () =>
        ({
          data: null,
          error: { message: 'nao pode enviar para fulano@dominio.com' },
        }) as unknown as Resposta,
    );
    const transporte = new ResendEmailTransport(cliente, 'r@teste.local');

    const resultado = await transporte.enviar(MENSAGEM_DE_MODELO);

    expect(resultado).toEqual({
      sucesso: false,
      motivo: 'nao pode enviar para [e-mail]',
    });
  });

  /**
   * A garantia mais importante do adaptador (ADR-07.1): rede fora nao vira
   * excecao subindo pela pilha. Quem chama e o despachante do outbox, e a decisao
   * de tentar de novo e dele — um `throw` aqui atravessaria essa fronteira.
   */
  it('converte excecao do SDK em falha, sem lancar', async () => {
    const { cliente } = clienteFalso(() => {
      throw new Error('getaddrinfo ENOTFOUND api.resend.com');
    });
    const transporte = new ResendEmailTransport(cliente, 'r@teste.local');

    await expect(transporte.enviar(MENSAGEM_DE_MODELO)).resolves.toEqual({
      sucesso: false,
      motivo: 'getaddrinfo ENOTFOUND api.resend.com',
    });
  });

  it('trata resposta sem erro e sem dado como falha', async () => {
    const { cliente } = clienteFalso(
      () => ({ data: null, error: null }) as unknown as Resposta,
    );
    const transporte = new ResendEmailTransport(cliente, 'r@teste.local');

    const resultado = await transporte.enviar(MENSAGEM_DE_MODELO);

    expect(resultado.sucesso).toBe(false);
  });
});

describe('EmailFalsoTransport', () => {
  it('registra a mensagem e responde sucesso, sem rede', async () => {
    const transporte = new EmailFalsoTransport();

    const resultado = await transporte.enviar(MENSAGEM_DE_MODELO);

    expect(resultado).toEqual({ sucesso: true, idProvedor: 'falso-1' });
    expect(transporte.enviadas).toEqual([MENSAGEM_DE_MODELO]);
  });

  it('numera as mensagens e permite limpar entre casos', async () => {
    const transporte = new EmailFalsoTransport();

    await transporte.enviar(MENSAGEM_DE_MODELO);
    await expect(transporte.enviar(MENSAGEM_REDIGIDA)).resolves.toEqual({
      sucesso: true,
      idProvedor: 'falso-2',
    });

    transporte.limpar();
    expect(transporte.enviadas).toEqual([]);
    await expect(transporte.enviar(MENSAGEM_REDIGIDA)).resolves.toEqual({
      sucesso: true,
      idProvedor: 'falso-1',
    });
  });
});

describe('criarTransporte', () => {
  it('usa o Resend quando ha chave e remetente', () => {
    expect(
      criarTransporte({
        RESEND_API_KEY: 're_chave_de_teste',
        EMAIL_FROM: 'r@teste.local',
      }),
    ).toBeInstanceOf(ResendEmailTransport);
  });

  it('cai no transporte falso fora de producao', () => {
    expect(criarTransporte({ NODE_ENV: 'development' })).toBeInstanceOf(
      EmailFalsoTransport,
    );
  });

  /**
   * Um servico que sobe saudavel e engole todo e-mail e pior que um que se recusa
   * a subir: o primeiro so aparece quando um advogado reclama que nunca recebeu o
   * link de acesso.
   */
  it.each([
    ['sem nada', { NODE_ENV: 'production' }],
    ['so com a chave', { NODE_ENV: 'production', RESEND_API_KEY: 're_x' }],
    [
      'so com o remetente',
      { NODE_ENV: 'production', EMAIL_FROM: 'r@teste.local' },
    ],
    [
      'com chave vazia',
      {
        NODE_ENV: 'production',
        RESEND_API_KEY: '',
        EMAIL_FROM: 'r@teste.local',
      },
    ],
  ])('recusa subir em producao %s', (_caso, ambiente) => {
    expect(() => criarTransporte(ambiente)).toThrow(/producao/);
  });
});
