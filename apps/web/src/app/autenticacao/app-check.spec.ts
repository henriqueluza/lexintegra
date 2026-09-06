import { TestBed } from '@angular/core/testing';
import {
  AppCheckService,
  CARREGADOR_APP_CHECK,
  carregarConfiguracaoAppCheck,
  CHAVE_PENDENTE,
  type ContextoAppCheck,
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
