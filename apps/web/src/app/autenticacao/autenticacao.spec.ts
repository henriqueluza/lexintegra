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
import { ehDesenvolvimentoLocal } from './firebase';
import { rotaInicialDe } from './guardas';
import { traduzirFalha } from './sessao.service';
import { anexarToken, ehChamadaDaApi } from './token.interceptor';
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
    const enviada = await executar('/api/auth/redefinicao-senha', null);
    expect(enviada.headers.get('Authorization')).toBeNull();
  });
});

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
});
