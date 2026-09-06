import type { CanActivate, ExecutionContext, Type } from '@nestjs/common';
import {
  GUARDS_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Perfil } from 'shared';
import { AdvogadosController } from './advogados/advogados.controller.js';
import type { AdvogadosService } from './advogados/advogados.service.js';
import {
  CHAVE_PERFIS,
  CHAVE_PUBLICO,
  UsuarioAtual,
} from './autenticacao/decoradores.js';
import { AutenticacaoController } from './autenticacao/senha/redefinicao.controller.js';
import type { RedefinicaoSenhaService } from './autenticacao/senha/redefinicao.service.js';
import type { UsuarioAutenticado } from './autenticacao/usuario.js';
import { HealthController } from './health/health.controller.js';
import type { Limite as ConfiguracaoDeLimite } from './limite/contador.js';
import { CHAVE_LIMITE, CHAVE_SEM_LIMITE } from './limite/decoradores.js';
import { PreCadastrosAdminController } from './pre-cadastros/pre-cadastros.admin.controller.js';
import { PreCadastrosController } from './pre-cadastros/pre-cadastros.controller.js';
import type { PreCadastrosService } from './pre-cadastros/pre-cadastros.service.js';
import { ProdutosController } from './produtos/produtos.controller.js';
import type { ProdutosService } from './produtos/produtos.service.js';
import { PreCadastroGuard } from './vitrine/pre-cadastro.guard.js';
import { VitrineController } from './vitrine/vitrine.controller.js';
import type { VitrineService } from './vitrine/vitrine.service.js';

const reflector = new Reflector();

const ADMIN: UsuarioAutenticado = {
  uid: 'uid-admin',
  email: 'admin@escritorio.test',
  perfil: 'admin',
};

/* -------------------------------------------------------------------------- */
/* Metadados de seguranca                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Estes testes olham para a ANOTACAO, nao para o comportamento, e e de proposito.
 *
 * Os guards ja tem teste proprio: dado `@Perfis('admin')`, negam quem nao e
 * admin. O que falta cobrir e o outro lado — que a anotacao esta la. Apagar um
 * `@Perfis` do controlador administrativo nao quebra teste de guard nenhum;
 * quebra estes.
 */
describe('anotacoes de seguranca dos controladores', () => {
  it.each([
    ['advogados', AdvogadosController],
    ['produtos', ProdutosController],
    ['pre-cadastros', PreCadastrosAdminController],
  ])(
    'a superficie administrativa de %s exige admin, na classe',
    (_nome, classe) => {
      const exigidos = reflector.get<readonly Perfil[]>(CHAVE_PERFIS, classe);
      expect(exigidos).toEqual(['admin']);
    },
  );

  it.each([
    ['listar', AdvogadosController.prototype.listar],
    ['criar', AdvogadosController.prototype.criar],
    ['suspender', AdvogadosController.prototype.suspender],
    ['reativar', AdvogadosController.prototype.reativar],
    ['produtos.listar', ProdutosController.prototype.listar],
    ['produtos.obter', ProdutosController.prototype.obter],
    ['produtos.criar', ProdutosController.prototype.criar],
    ['produtos.editar', ProdutosController.prototype.editar],
    ['produtos.ativar', ProdutosController.prototype.ativar],
    ['produtos.desativar', ProdutosController.prototype.desativar],
    ['pre-cadastros.listar', PreCadastrosAdminController.prototype.listar],
  ])('o metodo administrativo %s nao se declara publico', (_nome, metodo) => {
    expect(reflector.get(CHAVE_PUBLICO, metodo)).toBeUndefined();
  });

  /**
   * A ausencia de exclusao e uma decisao, e decisao que so existe como ausencia
   * ninguem defende numa revisao futura. Produto sai da vitrine por desativacao;
   * apagar a linha deixaria `pedidos.produtoOrigemId` apontando para o vazio.
   */
  it('nao expoe exclusao de produto', () => {
    expect(
      (ProdutosController.prototype as Record<string, unknown>)['excluir'],
    ).toBeUndefined();
    expect(
      (ProdutosController.prototype as Record<string, unknown>)['remover'],
    ).toBeUndefined();
  });

  /**
   * As unicas rotas publicas do sistema hoje. Cada linha aqui e uma decisao que
   * precisou de justificativa: o health e alvo do startup probe do Cloud Run, que
   * nao tem token; o pedido de redefinicao e para quem esqueceu a senha e
   * portanto nao consegue autenticar; o pre-cadastro e a porta de entrada de quem
   * ainda nao existe como usuario (arquitetura, secao 6, fronteira 1).
   *
   * A lista e nominal para que ABRIR uma rota nova exija editar este arquivo.
   * Uma contagem (`expect(publicas).toHaveLength(3)`) passaria a mesma sensacao
   * de rigor e aceitaria a troca de uma rota por outra sem ninguem notar.
   */
  it.each([
    ['health', HealthController.prototype.obter],
    ['redefinicao de senha', AutenticacaoController.prototype.redefinirSenha],
    ['pre-cadastro', PreCadastrosController.prototype.registrar],
    ['vitrine', VitrineController.prototype.listar],
  ])('%s e publico', (_nome, metodo) => {
    expect(reflector.get(CHAVE_PUBLICO, metodo)).toBe(true);
  });

  /**
   * O reverso: a consulta administrativa de leads NAO e publica. Ela e vizinha de
   * arquivo da rota que e, e o erro de anotar a classe errada nao produziria
   * sintoma nenhum — produziria a base de leads inteira aberta na internet.
   */
  it('a consulta de pre-cadastros NAO e publica', () => {
    expect(
      reflector.get(
        CHAVE_PUBLICO,
        PreCadastrosAdminController.prototype.listar,
      ),
    ).toBeUndefined();
    expect(
      reflector.get(CHAVE_PUBLICO, PreCadastrosAdminController),
    ).toBeUndefined();
  });

  it('a rota `eu` NAO e publica', () => {
    expect(
      reflector.get(CHAVE_PUBLICO, AutenticacaoController.prototype.eu),
    ).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Limite de requisicoes                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Os testes do guard provam que ele barra quando anotado. O que falta cobrir e o
 * outro lado — que a anotacao esta no lugar certo. Tirar o `@Limite` do
 * formulario publico nao quebraria teste de guard nenhum, e o sintoma so
 * apareceria na conta do Firestore.
 */
describe('limite de requisicoes das rotas publicas', () => {
  it.each([
    ['pre-cadastro', PreCadastrosController.prototype.registrar],
    ['redefinicao de senha', AutenticacaoController.prototype.redefinirSenha],
    ['vitrine', VitrineController.prototype.listar],
  ])('%s declara limite proprio', (_nome, metodo) => {
    const limite = reflector.get<ConfiguracaoDeLimite | undefined>(
      CHAVE_LIMITE,
      metodo,
    );

    expect(limite?.maximo).toBeGreaterThan(0);
    expect(limite?.janelaMs).toBeGreaterThan(0);
  });

  /**
   * O formulario tem que ser mais apertado que a leitura da vitrine. Se um dia os
   * dois numeros se aproximarem por edicao distraida, este teste avisa: escrever
   * lead e caro e raro, ler catalogo e barato e repetido.
   */
  it('o formulario e mais apertado que a vitrine', () => {
    const formulario = reflector.get<ConfiguracaoDeLimite>(
      CHAVE_LIMITE,
      PreCadastrosController.prototype.registrar,
    );
    const vitrine = reflector.get<ConfiguracaoDeLimite>(
      CHAVE_LIMITE,
      VitrineController.prototype.listar,
    );

    const porMinuto = (limite: ConfiguracaoDeLimite): number =>
      limite.maximo / (limite.janelaMs / 60_000);

    expect(porMinuto(formulario)).toBeLessThan(porMinuto(vitrine));
  });

  /**
   * E o health tem que ficar de fora. O startup probe do Cloud Run bate em
   * cadencia fixa e nao sabe reagir a 429: uma instancia que responde 429 ao
   * proprio probe nao entra em servico, e o deploy falha no smoke test sem dizer
   * por que.
   */
  it('o health e isento', () => {
    expect(
      reflector.get(CHAVE_SEM_LIMITE, HealthController.prototype.obter),
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Delegacao                                                                   */
/* -------------------------------------------------------------------------- */

describe('AdvogadosController', () => {
  function montar(): {
    controlador: AdvogadosController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];
    const servico = {
      listar: () => {
        chamadas.push('listar');
        return Promise.resolve([]);
      },
      criar: (dados: { email: string }, admin: string) => {
        chamadas.push(`criar ${dados.email} por ${admin}`);
        return Promise.resolve({});
      },
      suspender: (uid: string, admin: string) => {
        chamadas.push(`suspender ${uid} por ${admin}`);
        return Promise.resolve({});
      },
      reativar: (uid: string, admin: string) => {
        chamadas.push(`reativar ${uid} por ${admin}`);
        return Promise.resolve({});
      },
    } as unknown as AdvogadosService;

    return { controlador: new AdvogadosController(servico), chamadas };
  }

  it('lista', async () => {
    const { controlador, chamadas } = montar();
    await controlador.listar();
    expect(chamadas).toEqual(['listar']);
  });

  /**
   * O `criadoPor` vem do TOKEN, nunca do corpo. Se viesse do corpo, um
   * administrador poderia registrar a criacao em nome de outro — e a trilha de
   * auditoria de quem provisionou qual acesso deixaria de valer alguma coisa.
   */
  it('cria atribuindo a autoria ao administrador autenticado', async () => {
    const { controlador, chamadas } = montar();
    await controlador.criar(
      { nome: 'Ana Souza', email: 'ana@escritorio.test' },
      ADMIN,
    );
    expect(chamadas).toEqual(['criar ana@escritorio.test por uid-admin']);
  });

  it('suspende e reativa pelo uid do caminho', async () => {
    const { controlador, chamadas } = montar();
    await controlador.suspender('uid-advogado', ADMIN);
    await controlador.reativar('uid-advogado', ADMIN);
    expect(chamadas).toEqual([
      'suspender uid-advogado por uid-admin',
      'reativar uid-advogado por uid-admin',
    ]);
  });
});

describe('ProdutosController', () => {
  function montar(): { controlador: ProdutosController; chamadas: string[] } {
    const chamadas: string[] = [];
    const servico = {
      listar: (situacao: string) => {
        chamadas.push(`listar ${situacao}`);
        return Promise.resolve([]);
      },
      obter: (id: string) => {
        chamadas.push(`obter ${id}`);
        return Promise.resolve({});
      },
      criar: (dados: { nome: string }, admin: string) => {
        chamadas.push(`criar ${dados.nome} por ${admin}`);
        return Promise.resolve({});
      },
      editar: (id: string, dados: { nome: string }, admin: string) => {
        chamadas.push(`editar ${id} para ${dados.nome} por ${admin}`);
        return Promise.resolve({});
      },
      ativar: (id: string, admin: string) => {
        chamadas.push(`ativar ${id} por ${admin}`);
        return Promise.resolve({});
      },
      desativar: (id: string, admin: string) => {
        chamadas.push(`desativar ${id} por ${admin}`);
        return Promise.resolve({});
      },
    } as unknown as ProdutosService;

    return { controlador: new ProdutosController(servico), chamadas };
  }

  /**
   * `situacao` chega da query string, e query string e texto livre. O `catch` do
   * schema faz um valor desconhecido cair no filtro mais amplo em vez de derrubar
   * a tela do administrador com 400 — e a consulta continua sendo uma das tres
   * que o indice composto cobre.
   */
  it.each([
    ['ativos', 'ativos'],
    ['inativos', 'inativos'],
    ['todos', 'todos'],
    [undefined, 'todos'],
    ['arquivados', 'todos'],
  ])('lista com situacao %s', async (recebido, esperado) => {
    const { controlador, chamadas } = montar();
    await controlador.listar(recebido);
    expect(chamadas).toEqual([`listar ${esperado}`]);
  });

  it('cria e edita atribuindo a autoria ao administrador autenticado', async () => {
    const { controlador, chamadas } = montar();
    const corpo = { nome: 'Parecer' } as never;

    await controlador.criar(corpo, ADMIN);
    await controlador.editar('produto-1', corpo, ADMIN);

    expect(chamadas).toEqual([
      'criar Parecer por uid-admin',
      'editar produto-1 para Parecer por uid-admin',
    ]);
  });

  it('ativa e desativa pelo id do caminho', async () => {
    const { controlador, chamadas } = montar();

    await controlador.ativar('produto-1', ADMIN);
    await controlador.desativar('produto-1', ADMIN);
    await controlador.obter('produto-1');

    expect(chamadas).toEqual([
      'ativar produto-1 por uid-admin',
      'desativar produto-1 por uid-admin',
      'obter produto-1',
    ]);
  });
});

/**
 * A vitrine e a unica rota `@Publico()` que mesmo assim exige autorizacao — o
 * token de pre-cadastro. Como o guard e de CONTROLADOR e nao global, apagar o
 * `@UseGuards` nao quebraria teste de guard nenhum: quebraria o sigilo do
 * catalogo, em silencio. Este teste olha para a anotacao pela mesma razao que os
 * de `@Perfis` olham.
 */
describe('a vitrine exige o token de pre-cadastro, na classe', () => {
  it('declara o guard no controlador', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VitrineController) as
      ReadonlyArray<Type<CanActivate>> | undefined;

    expect(guards).toContain(PreCadastroGuard);
  });
});

describe('VitrineController', () => {
  it('delega a listagem ao servico', async () => {
    const chamadas: string[] = [];
    const controlador = new VitrineController({
      listar: () => {
        chamadas.push('listar');
        return Promise.resolve([]);
      },
    } as unknown as VitrineService);

    await expect(controlador.listar()).resolves.toEqual([]);
    expect(chamadas).toEqual(['listar']);
  });
});

describe('PreCadastrosController', () => {
  function montar(): {
    publico: PreCadastrosController;
    admin: PreCadastrosAdminController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];
    const servico = {
      registrar: (dados: { email: string }) => {
        chamadas.push(`registrar ${dados.email}`);
        return Promise.resolve({ token: 'id.segredo', expiraEm: '2026-01-01' });
      },
      listar: (limite: number) => {
        chamadas.push(`listar ${limite}`);
        return Promise.resolve([]);
      },
    } as unknown as PreCadastrosService;

    return {
      publico: new PreCadastrosController(servico),
      admin: new PreCadastrosAdminController(servico),
      chamadas,
    };
  }

  it('devolve o token de liberacao no corpo', async () => {
    const { publico } = montar();

    const resposta = await publico.registrar({
      nome: 'Ana Ribeiro Salgado',
      email: 'ana@empresa.com.br',
      telefone: '61990000000',
    });

    expect(resposta).toEqual({ token: 'id.segredo', expiraEm: '2026-01-01' });
  });

  /**
   * `limite` chega da query string, que e texto livre. O `catch` do schema faz
   * um valor absurdo cair no padrao em vez de derrubar a tela do administrador
   * com 400 — e impede que `?limite=999999` vire uma varredura da colecao.
   */
  it.each([
    ['10', 'listar 10'],
    [undefined, 'listar 50'],
    ['nao-e-numero', 'listar 50'],
    ['0', 'listar 50'],
    ['99999', 'listar 50'],
  ])('lista com limite %s', async (recebido, esperado) => {
    const { admin, chamadas } = montar();

    await admin.listar(recebido);

    expect(chamadas).toEqual([esperado]);
  });
});

describe('AutenticacaoController', () => {
  it('aceita o pedido de redefinicao e responde sempre igual', async () => {
    const pedidos: string[] = [];
    const controlador = new AutenticacaoController({
      solicitar: (email: string) => {
        pedidos.push(email);
        return Promise.resolve();
      },
    } as unknown as RedefinicaoSenhaService);

    const conhecido = await controlador.redefinirSenha({
      email: 'ana@escritorio.test',
    });
    const desconhecido = await controlador.redefinirSenha({
      email: 'ninguem@escritorio.test',
    });

    expect(conhecido).toEqual({ aceito: true });
    expect(desconhecido).toEqual(conhecido);
    expect(pedidos).toEqual(['ana@escritorio.test', 'ninguem@escritorio.test']);
  });

  it('devolve o usuario que o guard validou', () => {
    const controlador = new AutenticacaoController(
      {} as unknown as RedefinicaoSenhaService,
    );
    expect(controlador.eu(ADMIN)).toEqual(ADMIN);
  });
});

/* -------------------------------------------------------------------------- */
/* @UsuarioAtual                                                               */
/* -------------------------------------------------------------------------- */

type FabricaDeParametro = (
  dado: unknown,
  contexto: ExecutionContext,
) => UsuarioAutenticado;

/**
 * `createParamDecorator` guarda a fabrica nos metadados da rota. Aplicar o
 * decorador numa classe de teste e ler de volta e a unica forma de exercitar a
 * fabrica sem subir um servidor HTTP inteiro.
 */
function fabricaDeUsuarioAtual(): FabricaDeParametro {
  class Alvo {
    metodo(@UsuarioAtual() _usuario: UsuarioAutenticado): void {}
  }

  const argumentos = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    Alvo,
    'metodo',
  ) as Record<string, { factory: FabricaDeParametro }>;

  return argumentos[Object.keys(argumentos)[0]].factory;
}

describe('@UsuarioAtual', () => {
  function contextoCom(usuario?: UsuarioAutenticado): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, usuario }) }),
    } as unknown as ExecutionContext;
  }

  it('devolve o usuario anexado pelo guard', () => {
    expect(fabricaDeUsuarioAtual()(undefined, contextoCom(ADMIN))).toEqual(
      ADMIN,
    );
  });

  /**
   * Chegar aqui sem usuario significa guard global removido, ou rota `@Publico()`
   * pedindo usuario. Devolver `undefined` empurraria a falha para dentro do
   * servico, onde ela apareceria como `usuario.uid` estourando longe da causa.
   */
  it('lanca quando nao ha usuario, em vez de devolver undefined', () => {
    expect(() => fabricaDeUsuarioAtual()(undefined, contextoCom())).toThrow(
      /sem autenticacao/,
    );
  });
});
