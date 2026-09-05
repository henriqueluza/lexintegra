import type { Auth } from 'firebase-admin/auth';
import { EmailFalsoTransport } from '../email/email-falso.transport.js';
import type { EmailTransport } from '../email/email-transport.js';
import { DespachanteOutbox } from './despachante.service.js';
import {
  ehDuplicata,
  idDoEvento,
  JANELA_REDEFINICAO_MS,
  type RegistroOutbox,
} from './evento.js';
import { montarLinkDeSenha, urlDaAplicacao } from './link-de-senha.js';
import type { OutboxService } from './outbox.service.js';

/* -------------------------------------------------------------------------- */
/* Identidade e deduplicacao dos eventos                                       */
/* -------------------------------------------------------------------------- */

function inicioDeJanela(instante: number): number {
  return Math.floor(instante / JANELA_REDEFINICAO_MS) * JANELA_REDEFINICAO_MS;
}

describe('idDoEvento', () => {
  it('da o mesmo id para a criacao de acesso do mesmo advogado', () => {
    expect(idDoEvento('definir-senha', 'uid-1')).toBe(
      idDoEvento('definir-senha', 'uid-1'),
    );
  });

  it('nao considera a hora na criacao de acesso', () => {
    expect(idDoEvento('definir-senha', 'uid-1', 0)).toBe(
      idDoEvento('definir-senha', 'uid-1', 10 ** 12),
    );
  });

  it('separa advogados diferentes', () => {
    expect(idDoEvento('definir-senha', 'uid-1')).not.toBe(
      idDoEvento('definir-senha', 'uid-2'),
    );
  });

  /**
   * O segundo clique em "esqueci minha senha" dentro da janela cai no MESMO
   * documento. O `create` falha com ALREADY_EXISTS, que e duplicata esperada — e
   * daí sai idempotencia e limitacao de abuso pelo mesmo mecanismo, sem estado em
   * memoria, que nao sobreviveria a varias instancias do Cloud Run.
   */
  it('deduplica pedidos de redefinicao dentro da janela', () => {
    // Alinhado ao inicio de uma janela: `base` solto poderia cair perto do fim de
    // uma e o segundo instante ja pertencer a proxima, fazendo o teste passar ou
    // falhar conforme o numero escolhido.
    const base = inicioDeJanela(1_700_000_000_000);
    expect(idDoEvento('redefinir-senha', 'uid-1', base)).toBe(
      idDoEvento('redefinir-senha', 'uid-1', base + JANELA_REDEFINICAO_MS - 1),
    );
  });

  it('permite novo pedido de redefinicao na janela seguinte', () => {
    const base = inicioDeJanela(1_700_000_000_000);
    expect(idDoEvento('redefinir-senha', 'uid-1', base)).not.toBe(
      idDoEvento('redefinir-senha', 'uid-1', base + JANELA_REDEFINICAO_MS),
    );
  });

  it('nao mistura os dois tipos de evento', () => {
    expect(idDoEvento('definir-senha', 'uid-1')).not.toBe(
      idDoEvento('redefinir-senha', 'uid-1'),
    );
  });
});

describe('ehDuplicata', () => {
  it('reconhece o codigo 6 do gRPC', () => {
    expect(ehDuplicata({ code: 6, message: 'entity already exists' })).toBe(
      true,
    );
  });

  it('reconhece a mensagem ALREADY_EXISTS', () => {
    expect(
      ehDuplicata(new Error('6 ALREADY_EXISTS: entity already exists')),
    ).toBe(true);
  });

  /**
   * Tratar toda falha de escrita como duplicata engoliria um erro de permissao ou
   * de indisponibilidade e responderia "tudo certo" ao usuario, sem e-mail nenhum
   * ter saido.
   */
  it.each([
    ['permissao negada', { code: 7, message: 'PERMISSION_DENIED' }],
    ['indisponivel', { code: 14, message: 'UNAVAILABLE' }],
    ['erro comum', new Error('deu ruim')],
    ['nulo', null],
    ['texto', 'ALREADY_EXISTS'],
  ])('nao confunde %s com duplicata', (_caso, erro) => {
    expect(ehDuplicata(erro)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Link de redefinicao                                                         */
/* -------------------------------------------------------------------------- */

describe('montarLinkDeSenha', () => {
  const LINK_FIREBASE =
    'https://plataforma-juridica-36bda.firebaseapp.com/__/auth/action' +
    '?mode=resetPassword&oobCode=CODIGO123&apiKey=AIza';

  it('troca a pagina do Firebase pela da aplicacao, guardando o oobCode', () => {
    expect(
      montarLinkDeSenha(LINK_FIREBASE, 'https://lexintegra.com.br'),
    ).toEqual({
      url: 'https://lexintegra.com.br/definir-senha?oobCode=CODIGO123',
      proprio: true,
    });
  });

  it('nao arrasta a apiKey nem o mode para a nossa URL', () => {
    const { url } = montarLinkDeSenha(LINK_FIREBASE, 'https://x.test');
    expect(url).not.toMatch(/apiKey/);
    expect(url).not.toMatch(/mode=/);
  });

  it('escapa codigo com caractere especial', () => {
    const { url } = montarLinkDeSenha(
      'https://f.test/__/auth/action?oobCode=a%2Bb%3Dc',
      'https://x.test',
    );
    expect(new URL(url).searchParams.get('oobCode')).toBe('a+b=c');
  });

  /**
   * Degradar para a pagina do Firebase e feio; nao entregar link nenhum deixaria
   * o advogado sem acesso. `proprio: false` e o que faz o despachante avisar no
   * log sem falhar a entrega.
   */
  it.each([
    ['link sem oobCode', 'https://f.test/__/auth/action?mode=resetPassword'],
    ['oobCode vazio', 'https://f.test/__/auth/action?oobCode='],
    ['nao e URL', 'isto nao e um link'],
  ])('devolve o link original para %s', (_caso, link) => {
    expect(montarLinkDeSenha(link, 'https://x.test')).toEqual({
      url: link,
      proprio: false,
    });
  });
});

describe('urlDaAplicacao', () => {
  it('usa URL_APLICACAO quando definida', () => {
    expect(urlDaAplicacao({ URL_APLICACAO: 'https://lexintegra.com.br' })).toBe(
      'https://lexintegra.com.br',
    );
  });

  it('tira a barra final, para nao gerar // no caminho', () => {
    expect(urlDaAplicacao({ URL_APLICACAO: 'https://x.test/' })).toBe(
      'https://x.test',
    );
  });

  it('cai no servidor de desenvolvimento quando nao ha nada', () => {
    expect(urlDaAplicacao({})).toBe('http://localhost:4200');
  });
});

/* -------------------------------------------------------------------------- */
/* Despachante                                                                 */
/* -------------------------------------------------------------------------- */

const REGISTRO: RegistroOutbox = {
  tipo: 'definir-senha',
  destinatarioUid: 'uid-advogado',
  estado: 'pendente',
  criadoEm: null as never,
  tentativas: 0,
};

interface Cenario {
  despachante: DespachanteOutbox;
  transporte: EmailFalsoTransport;
  marcados: Array<{
    id: string;
    estado: 'enviado' | 'falhou';
    motivo?: string;
  }>;
}

function montarCenario(opcoes: {
  registro?: RegistroOutbox | null;
  /** `null` reproduz o usuario do Auth sem endereco cadastrado. */
  email?: string | null;
  linkGerado?: string | (() => never);
  transporte?: EmailTransport;
}): Cenario {
  const marcados: Cenario['marcados'] = [];

  const registro = opcoes.registro === undefined ? REGISTRO : opcoes.registro;
  const outbox = {
    ler: () => Promise.resolve(registro),
    marcarEnviado: (id: string) => {
      marcados.push({ id, estado: 'enviado' });
      return Promise.resolve();
    },
    marcarFalha: (id: string, motivo: string) => {
      marcados.push({ id, estado: 'falhou', motivo });
      return Promise.resolve();
    },
  } as unknown as OutboxService;

  const email =
    opcoes.email === undefined ? 'advogado@teste.local' : opcoes.email;
  const auth = {
    getUser: () => Promise.resolve(email === null ? {} : { email }),
    generatePasswordResetLink: () => {
      const gerado = opcoes.linkGerado ?? 'https://f.test/?oobCode=CODIGO';
      return Promise.resolve().then(() =>
        typeof gerado === 'function' ? gerado() : gerado,
      );
    },
  } as unknown as Auth;

  const transporte = new EmailFalsoTransport();
  return {
    despachante: new DespachanteOutbox(
      outbox,
      auth,
      opcoes.transporte ?? transporte,
    ),
    transporte,
    marcados,
  };
}

describe('DespachanteOutbox', () => {
  it('envia pelo modelo password-reset, com o link na variavel LINK', async () => {
    const { despachante, transporte } = montarCenario({});

    await despachante.despachar('definir-senha_uid-advogado');

    expect(transporte.enviadas).toEqual([
      {
        para: ['advogado@teste.local'],
        modelo: {
          alias: 'password-reset',
          variaveis: {
            LINK: 'http://localhost:4200/definir-senha?oobCode=CODIGO',
          },
        },
      },
    ]);
  });

  it('marca como enviado quando o transporte confirma', async () => {
    const { despachante, marcados } = montarCenario({});

    await despachante.despachar('id-1');

    expect(marcados).toEqual([{ id: 'id-1', estado: 'enviado' }]);
  });

  /**
   * Entrega ao-menos-uma-vez e o contrato do Cloud Tasks que entra na Etapa 7.
   * Um registro ja entregue chegando de novo precisa ser um no-op, nao um segundo
   * e-mail.
   */
  it('ignora registro ja entregue', async () => {
    const { despachante, transporte, marcados } = montarCenario({
      registro: { ...REGISTRO, estado: 'enviado' },
    });

    await despachante.despachar('id-1');

    expect(transporte.enviadas).toEqual([]);
    expect(marcados).toEqual([]);
  });

  it('nao explode quando o registro nao existe mais', async () => {
    const { despachante, transporte } = montarCenario({ registro: null });

    await expect(despachante.despachar('id-sumido')).resolves.toBeUndefined();
    expect(transporte.enviadas).toEqual([]);
  });

  it('marca falha quando o transporte recusa', async () => {
    const recusando: EmailTransport = {
      enviar: () =>
        Promise.resolve({ sucesso: false, motivo: 'Rate limit exceeded' }),
    };
    const { despachante, marcados } = montarCenario({ transporte: recusando });

    await despachante.despachar('id-1');

    expect(marcados).toEqual([
      { id: 'id-1', estado: 'falhou', motivo: 'Rate limit exceeded' },
    ]);
  });

  it('marca falha quando a geracao do link estoura', async () => {
    const { despachante, marcados, transporte } = montarCenario({
      linkGerado: () => {
        throw new Error('AUTH_BACKEND_UNAVAILABLE');
      },
    });

    await despachante.despachar('id-1');

    expect(transporte.enviadas).toEqual([]);
    expect(marcados[0]).toMatchObject({ estado: 'falhou' });
  });

  /**
   * LGPD. As mensagens de erro do Firebase Auth costumam ecoar o endereco, e o
   * motivo e gravado no Firestore e registrado em log.
   */
  it('tira o endereco do motivo antes de gravar a falha', async () => {
    const { despachante, marcados } = montarCenario({
      linkGerado: () => {
        throw new Error('no user record for advogado@teste.local');
      },
    });

    await despachante.despachar('id-1');

    expect(marcados[0].motivo).toBe('no user record for [e-mail]');
  });

  it('marca falha quando o usuario nao tem e-mail', async () => {
    const { despachante, marcados, transporte } = montarCenario({
      email: null,
    });

    await despachante.despachar('id-sem-email');

    expect(transporte.enviadas).toEqual([]);
    expect(marcados).toEqual([
      {
        id: 'id-sem-email',
        estado: 'falhou',
        motivo: 'usuario uid-advogado nao tem e-mail',
      },
    ]);
  });
});
