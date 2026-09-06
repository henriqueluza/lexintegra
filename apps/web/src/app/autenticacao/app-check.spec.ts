import { TestBed } from '@angular/core/testing';
import {
  AppCheckService,
  CARREGADOR_APP_CHECK,
  carregarConfiguracaoAppCheck,
  CHAVE_PENDENTE,
  montarAppCheck,
  type ContextoAppCheck,
  type ModulosAppCheck,
} from './app-check';

function respostaCom(corpo: unknown, ok = true): typeof fetch {
  return (() =>
    Promise.resolve({
      ok,
      json: () => Promise.resolve(corpo),
    })) as unknown as typeof fetch;
}

describe('carregarConfiguracaoAppCheck', () => {
  it('devolve a configuracao quando a chave existe', async () => {
    const buscar = respostaCom({
      appCheck: { provedor: 'recaptcha-v3', siteKey: '6Lchave' },
    });

    await expect(carregarConfiguracaoAppCheck(buscar)).resolves.toEqual({
      provedor: 'recaptcha-v3',
      siteKey: '6Lchave',
    });
  });

  it('assume o provedor Enterprise quando o arquivo nao diz', async () => {
    const buscar = respostaCom({ appCheck: { siteKey: '6Lchave' } });

    await expect(carregarConfiguracaoAppCheck(buscar)).resolves.toMatchObject({
      provedor: 'recaptcha-enterprise',
    });
  });

  /**
   * "Ainda nao configurado" e o estado normal do projeto ate alguem criar o
   * provedor no console do Firebase, e por isso nao e erro. Lancar aqui
   * quebraria a home inteira por causa de um passo manual pendente.
   */
  it.each([
    ['com o marcador', { appCheck: { siteKey: CHAVE_PENDENTE } }],
    ['com chave vazia', { appCheck: { siteKey: '' } }],
    ['sem o bloco appCheck', {}],
  ])('devolve null %s', async (_nome, corpo) => {
    await expect(
      carregarConfiguracaoAppCheck(respostaCom(corpo)),
    ).resolves.toBeNull();
  });

  it('devolve null quando o arquivo nao existe', async () => {
    await expect(
      carregarConfiguracaoAppCheck(respostaCom({}, false)),
    ).resolves.toBeNull();
  });

  it('devolve null quando a busca falha', async () => {
    const buscar = (() =>
      Promise.reject(new Error('rede'))) as unknown as typeof fetch;

    await expect(carregarConfiguracaoAppCheck(buscar)).resolves.toBeNull();
  });
});

describe('AppCheckService', () => {
  function montar(
    contexto: ContextoAppCheck | null,
    contagem = { vezes: 0 },
  ): AppCheckService {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CARREGADOR_APP_CHECK,
          useValue: () => {
            contagem.vezes += 1;
            return Promise.resolve(contexto);
          },
        },
      ],
    });
    return TestBed.inject(AppCheckService);
  }

  function contextoQue(resposta: string | Error): ContextoAppCheck {
    return {
      appCheck: {} as ContextoAppCheck['appCheck'],
      sdk: {
        getToken: () =>
          resposta instanceof Error
            ? Promise.reject(resposta)
            : Promise.resolve({ token: resposta }),
      } as unknown as ContextoAppCheck['sdk'],
    };
  }

  it('devolve o token do SDK', async () => {
    const servico = montar(contextoQue('token-de-app-check'));

    await expect(servico.token()).resolves.toBe('token-de-app-check');
  });

  it('devolve null quando o App Check nao esta configurado', async () => {
    const servico = montar(null);

    await expect(servico.token()).resolves.toBeNull();
  });

  /**
   * Falha ao obter token nao pode derrubar o formulario. Sem rede, ou com o
   * reCAPTCHA bloqueado por extensao de navegador, a requisicao segue sem o
   * cabecalho — e quem decide se ela passa e o servidor, pela variavel
   * `APP_CHECK_ENFORCE`. Decidir isso aqui daria a um cliente adulterado a chance
   * de se declarar dispensado.
   */
  it('devolve null quando o SDK falha, em vez de lancar', async () => {
    const servico = montar(contextoQue(new Error('reCAPTCHA bloqueado')));

    await expect(servico.token()).resolves.toBeNull();
  });

  /**
   * Uma inicializacao por sessao de pagina. `preparar` e chamado a cada `focusin`
   * do formulario — sem a memoizacao, cada troca de campo baixaria o reCAPTCHA de
   * novo.
   */
  it('carrega uma vez so, por mais que seja preparado', async () => {
    const contagem = { vezes: 0 };
    const servico = montar(contextoQue('token'), contagem);

    servico.preparar();
    servico.preparar();
    servico.preparar();
    await servico.token();
    await servico.token();

    expect(contagem.vezes).toBe(1);
  });

  /**
   * `preparar` nao espera nada: o ponto dele e comecar o download enquanto a
   * pessoa digita, para o token estar pronto no envio.
   */
  it('preparar nao devolve promessa para ninguem esperar', () => {
    const servico = montar(contextoQue('token'));

    expect(servico.preparar()).toBeUndefined();
  });
});

describe('montarAppCheck', () => {
  interface Registro {
    readonly inicializou: string[];
    readonly provedores: string[];
  }

  function modulos(
    registro: Registro,
    appsExistentes = 0,
  ): () => Promise<ModulosAppCheck> {
    const nucleo = {
      getApps: () => new Array(appsExistentes).fill({}),
      initializeApp: () => ({ nome: 'novo' }),
      getApp: () => ({ nome: 'existente' }),
    } as unknown as ModulosAppCheck['nucleo'];

    const sdk = {
      ReCaptchaV3Provider: class {
        constructor(chave: string) {
          registro.provedores.push(`v3:${chave}`);
        }
      },
      ReCaptchaEnterpriseProvider: class {
        constructor(chave: string) {
          registro.provedores.push(`enterprise:${chave}`);
        }
      },
      initializeAppCheck: (app: { nome: string }) => {
        registro.inicializou.push(app.nome);
        return { marcador: 'app-check' };
      },
    } as unknown as ModulosAppCheck['sdk'];

    return () => Promise.resolve({ nucleo, sdk });
  }

  function buscarCom(configuracao: unknown, firebase: unknown): typeof fetch {
    return ((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes('configuracao-publica') ? configuracao : firebase,
          ),
      })) as unknown as typeof fetch;
  }

  const FIREBASE = {
    apiKey: 'chave',
    authDomain: 'lexintegra.com.br',
    projectId: 'plataforma',
  };

  function registro(): Registro {
    return { inicializou: [], provedores: [] };
  }

  /**
   * Em localhost nao ha chave, e o guard da API tambem esta desligado fora de
   * producao. Nem chega a buscar configuracao.
   */
  it('nao monta nada em localhost', async () => {
    const reg = registro();

    await expect(
      montarAppCheck('http://localhost:4200', buscarCom({}, {}), modulos(reg)),
    ).resolves.toBeNull();
    expect(reg.provedores).toEqual([]);
  });

  it('desiste, sem lancar, enquanto a chave for o marcador', async () => {
    const reg = registro();

    await expect(
      montarAppCheck(
        'https://lexintegra.com.br',
        buscarCom({ appCheck: { siteKey: CHAVE_PENDENTE } }, FIREBASE),
        modulos(reg),
      ),
    ).resolves.toBeNull();
    expect(reg.provedores).toEqual([]);
  });

  it.each([
    ['recaptcha-enterprise', 'enterprise:6Lchave'],
    ['recaptcha-v3', 'v3:6Lchave'],
  ])('instancia o provedor %s', async (provedor, esperado) => {
    const reg = registro();

    await montarAppCheck(
      'https://lexintegra.com.br',
      buscarCom({ appCheck: { provedor, siteKey: '6Lchave' } }, FIREBASE),
      modulos(reg),
    );

    expect(reg.provedores).toEqual([esperado]);
  });

  /**
   * O App Check compartilha a aplicacao do Firebase com a autenticacao. Uma
   * segunda `initializeApp` lanca, e o recarregamento a quente do servidor de
   * desenvolvimento produz exatamente esse caso.
   */
  it('reusa a aplicacao ja inicializada', async () => {
    const reg = registro();

    await montarAppCheck(
      'https://lexintegra.com.br',
      buscarCom({ appCheck: { siteKey: '6Lchave' } }, FIREBASE),
      modulos(reg, 1),
    );

    expect(reg.inicializou).toEqual(['existente']);
  });

  it('inicializa a aplicacao quando ainda nao existe nenhuma', async () => {
    const reg = registro();

    await montarAppCheck(
      'https://lexintegra.com.br',
      buscarCom({ appCheck: { siteKey: '6Lchave' } }, FIREBASE),
      modulos(reg, 0),
    );

    expect(reg.inicializou).toEqual(['novo']);
  });

  it('devolve o contexto com o SDK junto', async () => {
    const contexto = await montarAppCheck(
      'https://lexintegra.com.br',
      buscarCom({ appCheck: { siteKey: '6Lchave' } }, FIREBASE),
      modulos(registro()),
    );

    expect(contexto?.appCheck).toEqual({ marcador: 'app-check' });
    expect(contexto?.sdk).toBeDefined();
  });
});
