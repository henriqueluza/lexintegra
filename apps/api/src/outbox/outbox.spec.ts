import type { Auth } from 'firebase-admin/auth';
import { EmailFalsoTransport } from '../email/email-falso.transport.js';
import type { EmailTransport } from '../email/email-transport.js';
import { AlertaFalso } from '../alertas/alerta.js';
import { DespachanteOutbox } from './despachante.service.js';
import {
  ehDuplicata,
  idDoEvento,
  JANELA_REDEFINICAO_MS,
  type RegistroOutbox,
} from './evento.js';
import { montarLinkDeSenha, urlDaAplicacao } from './link-de-senha.js';
import type { OutboxService, Reivindicacao } from './outbox.service.js';

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
  tentativas: 1,
  ciclo: 0,
  varrerApos: null as never,
};

interface Cenario {
  despachante: DespachanteOutbox;
  transporte: EmailFalsoTransport;
  alertas: AlertaFalso;
  concluidos: Array<{
    id: string;
    estado: 'enviado' | 'falhou' | 'abandonado';
    motivo?: string;
  }>;
}

function montarCenario(opcoes: {
  registro?: RegistroOutbox | null;
  /** O que `reivindicar` devolve, quando nao e uma concessao. */
  reivindicacao?: Reivindicacao;
  /** `null` reproduz o usuario do Auth sem endereco cadastrado. */
  email?: string | null;
  linkGerado?: string | (() => never);
  transporte?: EmailTransport;
  /** Faz `concluir` responder `abandonado`, como se o orcamento tivesse acabado. */
  esgotado?: boolean;
}): Cenario {
  const concluidos: Cenario['concluidos'] = [];

  const registro = opcoes.registro === undefined ? REGISTRO : opcoes.registro;
  const reivindicacao: Reivindicacao =
    opcoes.reivindicacao ??
    (registro === null
      ? { situacao: 'inexistente' }
      : { situacao: 'concedida', registro });

  const outbox = {
    reivindicar: () => Promise.resolve(reivindicacao),
    concluir: (
      id: string,
      _registro: RegistroOutbox,
      resultado: { sucesso: boolean; motivo?: string },
    ) => {
      const estado = resultado.sucesso
        ? 'enviado'
        : opcoes.esgotado === true
          ? 'abandonado'
          : 'falhou';
      concluidos.push({
        id,
        estado,
        ...(resultado.motivo === undefined ? {} : { motivo: resultado.motivo }),
      });
      return Promise.resolve(estado);
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
  const alertas = new AlertaFalso();
  return {
    despachante: new DespachanteOutbox(
      outbox,
      auth,
      opcoes.transporte ?? transporte,
      alertas,
    ),
    transporte,
    alertas,
    concluidos,
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
        chaveIdempotencia: 'definir-senha_uid-advogado-c0',
      },
    ]);
  });

  /**
   * A CHAVE CARREGA O CICLO, E NAO A TENTATIVA.
   *
   * A intencao e "este e-mail": uma reentrega depois de falha real nao pode
   * produzir segunda entrega, e por isso a tentativa fica de fora. Ja o reenvio
   * manual do administrador TEM que produzir — e incrementar o ciclo e o que
   * muda a chave. Sem isso, o botao que existe para consertar uma falha seria
   * deduplicado do outro lado e nao mandaria nada.
   */
  it('muda a chave de idempotencia quando o ciclo muda', async () => {
    const { despachante, transporte } = montarCenario({
      registro: { ...REGISTRO, ciclo: 2, tentativas: 5 },
    });

    await despachante.despachar('id-1');

    expect(transporte.enviadas[0].chaveIdempotencia).toBe('id-1-c2');
  });

  it('conclui como enviado quando o transporte confirma', async () => {
    const { despachante, concluidos } = montarCenario({});

    await expect(despachante.despachar('id-1')).resolves.toBe('entregue');

    expect(concluidos).toEqual([{ id: 'id-1', estado: 'enviado' }]);
  });

  /**
   * Entrega ao-menos-uma-vez e o contrato do Cloud Tasks. Um registro ja entregue
   * chegando de novo precisa ser um no-op, nao um segundo e-mail.
   *
   * Quem recusa e `reivindicar`, numa transacao — e nao uma leitura solta seguida
   * de comparacao, que deixaria duas tarefas simultaneas passarem as duas.
   */
  it.each([
    ['ja-entregue'],
    ['abandonado'],
    ['em-andamento'],
    ['inexistente'],
  ] as const)('nao envia nada quando a reivindicacao devolve %s', async (situacao) => {
    const { despachante, transporte, concluidos } = montarCenario({
      reivindicacao: { situacao },
    });

    await expect(despachante.despachar('id-1')).resolves.toBe(situacao);

    expect(transporte.enviadas).toEqual([]);
    expect(concluidos).toEqual([]);
  });

  it('conclui como falha quando o transporte recusa', async () => {
    const recusando: EmailTransport = {
      enviar: () =>
        Promise.resolve({ sucesso: false, motivo: 'Rate limit exceeded' }),
    };
    const { despachante, concluidos } = montarCenario({ transporte: recusando });

    await expect(despachante.despachar('id-1')).resolves.toBe('falhou');

    expect(concluidos).toEqual([
      { id: 'id-1', estado: 'falhou', motivo: 'Rate limit exceeded' },
    ]);
  });

  it('conclui como falha quando a geracao do link estoura', async () => {
    const { despachante, concluidos, transporte } = montarCenario({
      linkGerado: () => {
        throw new Error('AUTH_BACKEND_UNAVAILABLE');
      },
    });

    await despachante.despachar('id-1');

    expect(transporte.enviadas).toEqual([]);
    expect(concluidos[0]).toMatchObject({ estado: 'falhou' });
  });

  /**
   * LGPD. As mensagens de erro do Firebase Auth costumam ecoar o endereco, e o
   * motivo e gravado no Firestore e registrado em log.
   */
  it('tira o endereco do motivo antes de gravar a falha', async () => {
    const { despachante, concluidos } = montarCenario({
      linkGerado: () => {
        throw new Error('no user record for advogado@teste.local');
      },
    });

    await despachante.despachar('id-1');

    expect(concluidos[0].motivo).toBe('no user record for [e-mail]');
  });

  it('conclui como falha quando o usuario nao tem e-mail', async () => {
    const { despachante, concluidos, transporte } = montarCenario({
      email: null,
    });

    await despachante.despachar('id-sem-email');

    expect(transporte.enviadas).toEqual([]);
    expect(concluidos).toEqual([
      {
        id: 'id-sem-email',
        estado: 'falhou',
        motivo: 'usuario uid-advogado nao tem e-mail',
      },
    ]);
  });

  /**
   * O ALERTA SO SAI NO FIM. Alertar a cada falha treinaria quem recebe a ignorar
   * — e uma falha isolada e exatamente o caso que a fila resolve sozinha.
   */
  it('nao alerta numa falha comum', async () => {
    const recusando: EmailTransport = {
      enviar: () => Promise.resolve({ sucesso: false, motivo: 'timeout' }),
    };
    const { despachante, alertas } = montarCenario({ transporte: recusando });

    await despachante.despachar('id-1');

    expect(alertas.emitidos).toEqual([]);
  });

  it('alerta com a criticidade do evento quando abandona', async () => {
    const recusando: EmailTransport = {
      enviar: () => Promise.resolve({ sucesso: false, motivo: 'timeout' }),
    };
    const { despachante, alertas } = montarCenario({
      transporte: recusando,
      esgotado: true,
    });

    await expect(despachante.despachar('id-1')).resolves.toBe('abandonado');

    expect(alertas.emitidos).toEqual([
      {
        nivel: 'critico',
        assunto: 'outbox.abandonado',
        detalhe: expect.stringContaining('id-1'),
      },
    ]);
  });

  /** O alerta vai para log e para o painel. Endereco ali seria dado pessoal em
   * repouso, de novo. */
  it('nao poe endereco no detalhe do alerta', async () => {
    const recusando: EmailTransport = {
      enviar: () =>
        Promise.resolve({
          sucesso: false,
          motivo: 'rejected for [e-mail]',
        }),
    };
    const { despachante, alertas } = montarCenario({
      transporte: recusando,
      esgotado: true,
    });

    await despachante.despachar('id-1');

    expect(alertas.emitidos[0].detalhe).not.toMatch(/@/);
  });
});
