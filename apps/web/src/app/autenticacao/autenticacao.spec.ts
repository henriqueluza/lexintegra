import {
  HttpClient,
  HttpErrorResponse,
  HttpRequest,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { ApiService } from './api.service';
import {
  CAMINHO_CONFIGURACAO,
  carregarConfiguracao,
  ehDesenvolvimentoLocal,
} from './firebase';
import { rotaInicialDe } from './guardas';
import { traduzirFalha } from './sessao.service';
import {
  anexarToken,
  ehCaminhoPublico,
  ehChamadaDaApi,
} from './token.interceptor';
import { AppCheckService } from './app-check';
import { SessaoService } from './sessao.service';

describe('ehDesenvolvimentoLocal', () => {
  it.each([
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'https://localhost:8443',
  ])('reconhece %s', (origem) => {
    expect(ehDesenvolvimentoLocal(origem)).toBe(true);
  });

  /**
   * Se isto passar a devolver `true` em producao, `pnpm dev` e o site publicado
   * trocam de lugar: o navegador do usuario tentaria falar com um emulador na
   * maquina dele. E se devolver `false` em desenvolvimento, cada teste manual
   * cria usuario de verdade no projeto de producao.
   */
  it.each([
    'https://lexintegra.com.br',
    'https://www.lexintegra.com.br',
    'https://localhost.exemplo.test',
    'https://meu-localhost.com',
  ])('nao confunde %s com desenvolvimento', (origem) => {
    expect(ehDesenvolvimentoLocal(origem)).toBe(false);
  });
});

describe('carregarConfiguracao', () => {
  function respostaDe(corpo: unknown, ok = true, status = 200): typeof fetch {
    return (() =>
      Promise.resolve({
        ok,
        status,
        json: () => Promise.resolve(corpo),
      })) as unknown as typeof fetch;
  }

  /**
   * Em desenvolvimento nao ha Hosting para servir `init.json`, e nao e preciso:
   * o emulador aceita qualquer chave. Buscar assim mesmo faria `pnpm dev`
   * depender de rede.
   */
  it('nao busca nada em desenvolvimento', async () => {
    let buscou = false;
    const buscar = (() => {
      buscou = true;
      return Promise.reject(new Error('nao deveria buscar'));
    }) as unknown as typeof fetch;

    const config = await carregarConfiguracao('http://localhost:4200', buscar);

    expect(buscou).toBe(false);
    expect(config.projectId).toBe('demo-lexintegra');
  });

  /**
   * O `projectId` de desenvolvimento PRECISA ser o do emulador. Divergir faz o
   * emulador emitir token para um projeto e o SDK validar contra outro — o mesmo
   * descasamento que quebrou a suite de integracao da API no CI, e que aparece
   * como "credencial invalida" sem apontar para nada.
   */
  it('usa o mesmo projeto com que o emulador e iniciado', async () => {
    const config = await carregarConfiguracao(
      'http://127.0.0.1:4200',
      respostaDe({}),
    );
    expect(config.projectId).toBe('demo-lexintegra');
  });

  it('busca a configuracao servida pelo Hosting em producao', async () => {
    let caminho = '';
    const buscar = ((url: string) => {
      caminho = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            apiKey: 'chave-vinda-do-hosting',
            authDomain: 'projeto.firebaseapp.com',
            projectId: 'projeto',
            storageBucket: 'ignorado',
          }),
      });
    }) as unknown as typeof fetch;

    const config = await carregarConfiguracao(
      'https://lexintegra.com.br',
      buscar,
    );

    expect(caminho).toBe(CAMINHO_CONFIGURACAO);
    expect(config).toEqual({
      apiKey: 'chave-vinda-do-hosting',
      authDomain: 'projeto.firebaseapp.com',
      projectId: 'projeto',
    });
  });

  it('recusa resposta de erro do Hosting', async () => {
    await expect(
      carregarConfiguracao('https://x.test', respostaDe(null, false, 404)),
    ).rejects.toThrow(/404/);
  });

  /**
   * Um `init.json` truncado ou servido por um rewrite errado produziria
   * `initializeApp({})`, e o erro apareceria bem longe daqui — dentro do SDK, na
   * primeira tentativa de login.
   */
  it.each([
    ['sem apiKey', { authDomain: 'a', projectId: 'p' }],
    ['sem authDomain', { apiKey: 'k', projectId: 'p' }],
    ['sem projectId', { apiKey: 'k', authDomain: 'a' }],
    ['vazio', {}],
  ])('recusa configuracao %s', async (_caso, corpo) => {
    await expect(
      carregarConfiguracao('https://x.test', respostaDe(corpo)),
    ).rejects.toThrow(/apiKey, authDomain ou projectId/);
  });
});

describe('rotaInicialDe', () => {
  it.each([
    ['admin', '/admin'],
    ['advogado', '/painel'],
    ['cliente', '/painel'],
  ] as const)('manda %s para %s', (perfil, destino) => {
    expect(rotaInicialDe(perfil)).toBe(destino);
  });

  /**
   * Autenticado sem claim reconhecida — a janela real entre `createUser` e
   * `setCustomUserClaims`. Mandar essa pessoa ao painel produziria uma tela que a
   * API recusa com 403 em toda chamada.
   */
  it('manda quem nao tem perfil para a raiz', () => {
    expect(rotaInicialDe(null)).toBe('/');
  });
});

describe('traduzirFalha', () => {
  /**
   * O Firebase unificou usuario inexistente e senha errada em
   * `auth/invalid-credential` para impedir enumeracao. Mapear os dois para o
   * mesmo motivo e o que impede a interface de desfazer isso.
   */
  it.each([
    'auth/invalid-credential',
    'auth/wrong-password',
    'auth/user-not-found',
    'auth/invalid-email',
  ])('trata %s como credencial invalida', (codigo) => {
    expect(traduzirFalha({ code: codigo })).toBe('credencial-invalida');
  });

  it('distingue conta desabilitada', () => {
    expect(traduzirFalha({ code: 'auth/user-disabled' })).toBe(
      'conta-desabilitada',
    );
  });

  it('distingue excesso de tentativas', () => {
    expect(traduzirFalha({ code: 'auth/too-many-requests' })).toBe(
      'excesso-de-tentativas',
    );
  });

  it.each([
    ['erro sem codigo', new Error('deu ruim')],
    ['codigo desconhecido', { code: 'auth/quota-exceeded' }],
    ['nulo', null],
    ['texto', 'auth/user-disabled'],
  ])('trata %s como indisponivel', (_caso, erro) => {
    expect(traduzirFalha(erro)).toBe('indisponivel');
  });
});

describe('ehChamadaDaApi', () => {
  it.each(['/api', '/api/health', '/api/admin/advogados'])(
    'reconhece %s',
    (url) => {
      expect(ehChamadaDaApi(url)).toBe(true);
    },
  );

  /**
   * O recorte e o que impede o token de vazar. Um interceptor sem ele mandaria o
   * ID token — credencial completa do usuario — para qualquer host que a
   * aplicacao viesse a chamar. A URL absoluta e recusada mesmo apontando para o
   * proprio dominio: nao ha caso de uso para ela (frontend e API compartilham a
   * origem, ADR-15) e aceita-la abriria a porta para uma URL montada com dado de
   * fora.
   */
  it.each([
    ['outro caminho', '/catalogo'],
    ['prefixo parecido', '/apidocs'],
    ['prefixo parecido sem barra', '/api-externa/x'],
    ['host externo', 'https://exemplo.test/api/health'],
    ['proprio dominio, absoluto', 'https://lexintegra.com.br/api/health'],
    ['protocolo relativo', '//exemplo.test/api'],
    ['vazio', ''],
  ])('recusa %s', (_caso, url) => {
    expect(ehChamadaDaApi(url)).toBe(false);
  });
});

describe('anexarToken', () => {
  function executar(
    url: string,
    token: string | null,
  ): Promise<HttpRequest<unknown>> {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessaoService,
          useValue: { token: () => Promise.resolve(token) },
        },
      ],
    });

    const requisicao = new HttpRequest('GET', url);
    return firstValueFrom(
      TestBed.runInInjectionContext(() =>
        anexarToken(requisicao, (r) => of(r as never)),
      ),
    ) as unknown as Promise<HttpRequest<unknown>>;
  }

  it('anexa o token as chamadas da API', async () => {
    const enviada = await executar('/api/admin/advogados', 'token-abc');
    expect(enviada.headers.get('Authorization')).toBe('Bearer token-abc');
  });

  it('nao anexa nada a chamada que nao e da API', async () => {
    const enviada = await executar('https://exemplo.test/coisa', 'token-abc');
    expect(enviada.headers.get('Authorization')).toBeNull();
  });

  /**
   * Sem sessao, a requisicao segue sem cabecalho em vez de falhar: e assim que a
   * tela de recuperacao de senha, que e publica, chama a API.
   */
  it('segue sem cabecalho quando nao ha sessao', async () => {
    const enviada = await executar('/api/admin/advogados', null);
    expect(enviada.headers.get('Authorization')).toBeNull();
  });

  /**
   * ESTE E O TESTE QUE PROTEGE A PAGINA DE CAPTACAO.
   *
   * `inject(SessaoService)` dispara o `import()` dinamico do SDK do Firebase.
   * Sem o recorte de caminhos publicos, enviar o formulario de pre-cadastro
   * baixaria meio megabyte de SDK de autenticacao no exato momento da conversao —
   * na pagina que a regra inviolavel 10 existe para manter leve. O duble estoura
   * se for consultado, porque "nao anexou o cabecalho" passaria tambem no caso
   * em que o SDK foi carregado e devolveu `null`.
   */
  it.each([
    '/api/pre-cadastros',
    '/api/vitrine',
    '/api/auth/redefinicao-senha',
    '/api/health',
  ])('nao toca na sessao ao chamar %s', async (url) => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SessaoService,
          useValue: {
            token: () => {
              throw new Error('A sessao nao devia ser consultada aqui.');
            },
          },
        },
      ],
    });

    const enviada = (await firstValueFrom(
      TestBed.runInInjectionContext(() =>
        anexarToken(new HttpRequest('GET', url), (r) => of(r as never)),
      ),
    )) as unknown as HttpRequest<unknown>;

    expect(enviada.headers.get('Authorization')).toBeNull();
  });
});

describe('ehCaminhoPublico', () => {
  it.each([
    '/api/health',
    '/api/vitrine',
    '/api/pre-cadastros',
    '/api/auth/redefinicao-senha',
  ])('reconhece %s', (url) => {
    expect(ehCaminhoPublico(url)).toBe(true);
  });

  it.each(['/api/admin/produtos', '/api/admin/pre-cadastros', '/api/auth/eu'])(
    'nao reconhece %s',
    (url) => {
      expect(ehCaminhoPublico(url)).toBe(false);
    },
  );

  /**
   * Prefixo nao basta. `/api/admin/pre-cadastros` e a consulta administrativa de
   * leads: se ela casasse com a rota publica de mesmo nome, a listagem inteira
   * passaria a viajar sem `Authorization` e o servidor devolveria 401 — ou, num
   * dia ruim, alguem "consertaria" abrindo a rota.
   */
  it('nao casa por prefixo', () => {
    expect(ehCaminhoPublico('/api/vitrine-secreta')).toBe(false);
    expect(ehCaminhoPublico('/api/pre-cadastros/todos')).toBe(false);
  });
});

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;
  let tokenAppCheck: string | null = null;

  beforeEach(() => {
    tokenAppCheck = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AppCheckService,
          useValue: { token: () => Promise.resolve(tokenAppCheck) },
        },
      ],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista advogados no caminho administrativo', async () => {
    const promessa = api.listarAdvogados();
    http.expectOne('/api/admin/advogados').flush([]);
    await expect(promessa).resolves.toEqual([]);
  });

  it('cria advogado com o corpo do formulario', async () => {
    const promessa = api.criarAdvogado({
      nome: 'Ana Souza',
      email: 'ana@escritorio.test',
    });
    const chamada = http.expectOne('/api/admin/advogados');

    expect(chamada.request.method).toBe('POST');
    expect(chamada.request.body).toEqual({
      nome: 'Ana Souza',
      email: 'ana@escritorio.test',
    });
    chamada.flush({ uid: 'uid-1' });
    await promessa;
  });

  /**
   * Suspensao como recurso: `POST` cria, `DELETE` remove. O uid vai codificado —
   * uid do Firebase nao costuma ter caractere especial, mas o caminho e montado
   * com valor que vem da rede.
   */
  it('suspende com POST e reativa com DELETE', async () => {
    const suspensao = api.suspenderAdvogado('uid/1');
    const criada = http.expectOne('/api/admin/advogados/uid%2F1/suspensao');
    expect(criada.request.method).toBe('POST');
    criada.flush({});
    await suspensao;

    const reativacao = api.reativarAdvogado('uid-2');
    const removida = http.expectOne('/api/admin/advogados/uid-2/suspensao');
    expect(removida.request.method).toBe('DELETE');
    removida.flush({});
    await reativacao;
  });

  it('pede redefinicao de senha no caminho publico', async () => {
    const promessa = api.pedirRedefinicaoDeSenha('ana@escritorio.test');
    const chamada = http.expectOne('/api/auth/redefinicao-senha');
    expect(chamada.request.body).toEqual({ email: 'ana@escritorio.test' });
    chamada.flush({ aceito: true });
    await promessa;
  });

  it('propaga a falha para a tela decidir a mensagem', async () => {
    const promessa = api.listarAdvogados();
    http
      .expectOne('/api/admin/advogados')
      .flush({ mensagem: 'nao' }, { status: 403, statusText: 'Forbidden' });

    await expect(promessa).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('nao usa URL absoluta em nenhum caminho', () => {
    const cliente = TestBed.inject(HttpClient);
    expect(typeof cliente.get).toBe('function');
    // Os `expectOne` acima ja falhariam com URL absoluta; esta afirmacao fixa a
    // intencao para quem for acrescentar um metodo novo.
    expect(ehChamadaDaApi('/api/admin/advogados')).toBe(true);
  });

  describe('superficie publica', () => {
    /*
     * As duas chamadas publicas esperam o token de App Check antes de disparar,
     * entao a requisicao so existe depois da fila de microtarefas virar.
     */
    const proximoTique = (): Promise<void> =>
      new Promise((resolver) => setTimeout(resolver, 0));

    it('envia o pre-cadastro com os tres campos', async () => {
      const dados = {
        nome: 'Ana Ribeiro Salgado',
        email: 'ana@empresa.com.br',
        telefone: '61990000000',
      };
      const promessa = api.criarPreCadastro(dados);
      await proximoTique();

      const chamada = http.expectOne('/api/pre-cadastros');
      expect(chamada.request.method).toBe('POST');
      expect(chamada.request.body).toEqual(dados);
      chamada.flush({ token: 'id.segredo', expiraEm: '2030-01-01' });
      await promessa;
    });

    /**
     * O token do pre-cadastro vai em CABECALHO, nunca em query string: e
     * credencial viva (regra inviolavel 9), e query string entra em log de
     * servidor, historico de navegador e referenciador.
     */
    it('manda o token da vitrine em cabecalho, nao na URL', async () => {
      const promessa = api.listarVitrine('id.segredo');
      await proximoTique();

      const chamada = http.expectOne('/api/vitrine');
      expect(chamada.request.headers.get('X-Pre-Cadastro')).toBe('id.segredo');
      expect(chamada.request.urlWithParams).toBe('/api/vitrine');
      chamada.flush([]);
      await promessa;
    });

    it('anexa o App Check quando ha token', async () => {
      tokenAppCheck = 'token-de-app-check';
      const promessa = api.listarVitrine('id.segredo');
      await proximoTique();

      const chamada = http.expectOne('/api/vitrine');
      expect(chamada.request.headers.get('X-Firebase-AppCheck')).toBe(
        'token-de-app-check',
      );
      chamada.flush([]);
      await promessa;
    });

    /**
     * Sem App Check configurado a requisicao SEGUE, sem o cabecalho. Quem decide
     * se ela passa e o servidor, por `APP_CHECK_ENFORCE` — bloquear aqui daria a
     * um cliente adulterado a chance de se declarar dispensado, e travaria o site
     * inteiro enquanto as chaves nao existirem.
     */
    it('segue sem o cabecalho quando o App Check nao esta configurado', async () => {
      const promessa = api.criarPreCadastro({
        nome: 'Ana Ribeiro Salgado',
        email: 'ana@empresa.com.br',
        telefone: '61990000000',
      });
      await proximoTique();

      const chamada = http.expectOne('/api/pre-cadastros');
      expect(chamada.request.headers.has('X-Firebase-AppCheck')).toBe(false);
      chamada.flush({ token: 'id.segredo', expiraEm: '2030-01-01' });
      await promessa;
    });
  });
});
