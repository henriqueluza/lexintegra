import type { CanActivate, ExecutionContext, Type } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
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
import { OutboxAdminController } from './outbox/outbox.admin.controller.js';
import type { OutboxAdminService } from './outbox/outbox.admin.service.js';
import type {
  DespachanteOutbox,
  ResultadoDoDespacho,
} from './outbox/despachante.service.js';
import type { VarredorDoOutbox } from './outbox/varredor.service.js';
import { OutboxController } from './outbox/outbox.controller.js';
import type { Limite as ConfiguracaoDeLimite } from './limite/contador.js';
import { CHAVE_SEM_APP_CHECK } from './app-check/decoradores.js';
import { CHAVE_LIMITE, CHAVE_SEM_LIMITE } from './limite/decoradores.js';
import { AnexosService } from './anexos/anexos.service.js';
import type { PortaoDeArquivos } from './arquivos/portao.js';
import type { UploadDeEntregavelService } from './entregaveis/upload.service.js';
import type { TermosService } from './termos/termos.service.js';
import { ClientesAdminController } from './clientes/clientes.admin.controller.js';
import type { ClientesService } from './clientes/clientes.service.js';
import { DisponibilidadesController } from './disponibilidades/disponibilidades.controller.js';
import type { DisponibilidadesService } from './disponibilidades/disponibilidades.service.js';
import type { EntregaveisService } from './entregaveis/entregaveis.service.js';
import type { ObservacoesService } from './observacoes/observacoes.service.js';
import type { ConsultaPedidosService } from './pedidos/consulta.service.js';
import type { DistribuicaoService } from './pedidos/distribuicao.service.js';
import { PedidosAdminController } from './pedidos/pedidos.admin.controller.js';
import { PedidosAdvogadoController } from './pedidos/pedidos.advogado.controller.js';
import { PedidosClienteController } from './pedidos/pedidos.cliente.controller.js';
import { PreCadastrosAdminController } from './pre-cadastros/pre-cadastros.admin.controller.js';
import { RetencaoController } from './retencao/retencao.controller.js';
import { CHAVE_TAREFA_INTERNA } from './tarefas/tarefa.guard.js';
import { VarreduraController } from './varredura/varredura.controller.js';
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

const CLIENTE: UsuarioAutenticado = {
  uid: 'uid-clara',
  email: 'clara@exemplo.test',
  perfil: 'cliente',
};

const ADVOGADO: UsuarioAutenticado = {
  uid: 'uid-ana',
  email: 'ana@escritorio.test',
  perfil: 'advogado',
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
    ['distribuicao de pedidos', PedidosAdminController],
    ['clientes', ClientesAdminController],
    ['entregas do outbox', OutboxAdminController],
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
    ['outbox.listar', OutboxAdminController.prototype.listar],
    ['outbox.reenviar', OutboxAdminController.prototype.reenviar],
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
   * As quatro internas sao publicas num sentido diferente, e o teste logo abaixo
   * e que cobra a contrapartida: elas exigem credencial de tarefa.
   *
   * A lista e nominal para que ABRIR uma rota nova exija editar este arquivo.
   * Uma contagem (`expect(publicas).toHaveLength(8)`) passaria a mesma sensacao
   * de rigor e aceitaria a troca de uma rota por outra sem ninguem notar.
   */
  it.each([
    ['health', HealthController.prototype.obter],
    ['redefinicao de senha', AutenticacaoController.prototype.redefinirSenha],
    ['pre-cadastro', PreCadastrosController.prototype.registrar],
    ['vitrine', VitrineController.prototype.listar],
    ['varredura (interna)', VarreduraController.prototype.processar],
    ['retencao (interna)', RetencaoController.prototype.executar],
    ['entrega do outbox (interna)', OutboxController.prototype.entregar],
    ['varredura do outbox (interna)', OutboxController.prototype.varrer],
  ])('%s e publico', (_nome, metodo) => {
    expect(reflector.get(CHAVE_PUBLICO, metodo)).toBe(true);
  });

  /**
   * AS ROTAS INTERNAS SAO `@Publico()` NUM SENTIDO ESTREITO:
   * nao ha usuario. Elas nao sao abertas — sao chamadas por Cloud Tasks e Cloud
   * Scheduler, e autenticadas por assinatura OIDC do Google, na mesma familia do
   * webhook do AbacatePay (arquitetura, secao 6, fronteira 2).
   *
   * `TarefaGuard` so age no que esta anotado com `@TarefaInterna()`. Sem a
   * anotacao, a rota fica aberta DE VERDADE — e nada mais quebraria. Este teste e
   * o que impede isso: uma rota interna nova sem a marca cai aqui.
   */
  it.each([
    ['varredura', VarreduraController.prototype.processar],
    ['retencao', RetencaoController.prototype.executar],
    ['entrega do outbox', OutboxController.prototype.entregar],
    ['varredura do outbox', OutboxController.prototype.varrer],
  ])('a rota interna de %s exige credencial de tarefa', (_nome, metodo) => {
    expect(reflector.get(CHAVE_TAREFA_INTERNA, metodo)).toBe(true);
  });

  /**
   * E o reverso: NENHUMA rota de usuario pode se declarar tarefa interna. A
   * anotacao trocada de lugar transformaria uma rota da area do cliente em algo
   * que o `TarefaGuard` tenta verificar com token de service account — e que
   * passaria a recusar todo cliente legitimo.
   */
  it.each([
    ['health', HealthController.prototype.obter],
    ['pre-cadastro', PreCadastrosController.prototype.registrar],
    ['vitrine', VitrineController.prototype.listar],
    ['cliente.listar', PedidosClienteController.prototype.listar],
    ['outbox.reenviar (painel)', OutboxAdminController.prototype.reenviar],
  ])('%s NAO e tarefa interna', (_nome, metodo) => {
    expect(reflector.get(CHAVE_TAREFA_INTERNA, metodo)).toBeUndefined();
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

  /**
   * O App Check prova que a chamada veio do NOSSO frontend. Quem nao e navegador
   * nao tem como produzir o token, e por isso ha duas listas aqui, as duas
   * nominais: quem e isento e quem e verificado.
   *
   * O health e isento porque o startup probe do Cloud Run nao e um navegador. As
   * internas, porque Cloud Tasks e Cloud Scheduler tambem nao sao — e elas nao
   * ficam desprotegidas por isso: `@TarefaInterna()` exige token OIDC do Google,
   * o que o teste acima cobra.
   *
   * Tirar uma rota de navegador da verificacao exige editar este arquivo, e e
   * esse o ponto. Uma rota publica de navegador sem App Check e um formulario
   * aberto a qualquer script.
   */
  it.each([
    ['health', HealthController.prototype.obter],
    ['varredura (interna)', VarreduraController.prototype.processar],
    ['retencao (interna)', RetencaoController.prototype.executar],
    ['entrega do outbox (interna)', OutboxController.prototype.entregar],
    ['varredura do outbox (interna)', OutboxController.prototype.varrer],
  ])('%s e isento de App Check', (_nome, metodo) => {
    expect(reflector.get(CHAVE_SEM_APP_CHECK, metodo)).toBe(true);
  });

  it.each([
    ['pre-cadastro', PreCadastrosController.prototype.registrar],
    ['redefinicao de senha', AutenticacaoController.prototype.redefinirSenha],
    ['vitrine', VitrineController.prototype.listar],
  ])('%s e verificado pelo App Check', (_nome, metodo) => {
    expect(reflector.get(CHAVE_SEM_APP_CHECK, metodo)).toBeUndefined();
  });

  /**
   * As internas tambem ficam fora do limitador: uma rajada de reentregas
   * legitima nao pode ser barrada por um contador que conta por instancia e veria
   * todas as tarefas vindo do mesmo endereco.
   */
  it.each([
    ['entrega do outbox', OutboxController.prototype.entregar],
    ['varredura do outbox', OutboxController.prototype.varrer],
  ])('a rota interna de %s e isenta do limitador', (_nome, metodo) => {
    expect(reflector.get(CHAVE_SEM_LIMITE, metodo)).toBe(true);
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

/* -------------------------------------------------------------------------- */
/* Etapa 9 — as areas de cliente e de advogado                                 */
/* -------------------------------------------------------------------------- */

/**
 * A Etapa 9 acrescentou tres controladores separados POR PERFIL, e nao um
 * controlador de pedidos com perfis por metodo.
 *
 * A diferenca importa: com `@Perfis` na classe, um endpoint novo em qualquer um
 * dos tres nasce restrito ao perfil daquele arquivo. Num controlador unico, o
 * endpoint novo nasceria aberto aos tres perfis autenticados — e o que nasceria
 * aberto ali e a leitura de pedido alheio.
 */
describe('perfis das areas autenticadas', () => {
  it.each([
    ['cliente', PedidosClienteController, ['cliente']],
    ['advogado', PedidosAdvogadoController, ['advogado']],
    ['disponibilidade', DisponibilidadesController, ['advogado']],
  ])('a area de %s declara o perfil na classe', (_nome, classe, esperado) => {
    expect(reflector.get<readonly Perfil[]>(CHAVE_PERFIS, classe)).toEqual(
      esperado,
    );
  });

  /**
   * O reverso da lista nominal de rotas publicas: nenhuma rota da area
   * autenticada pode se declarar publica. Um `@Publico()` distraido em
   * `PedidosClienteController` abriria os cartoes de todos os clientes.
   */
  it.each([
    ['cliente.listar', PedidosClienteController.prototype.listar],
    ['cliente.obter', PedidosClienteController.prototype.obter],
    ['cliente.anexar', PedidosClienteController.prototype.pedirEnvioDeAnexos],
    ['advogado.listar', PedidosAdvogadoController.prototype.listar],
    ['advogado.anamnese', PedidosAdvogadoController.prototype.anamnese],
    ['admin.atribuir', PedidosAdminController.prototype.atribuir],
    ['clientes.buscar', ClientesAdminController.prototype.buscar],
    ['disponibilidade.publicar', DisponibilidadesController.prototype.publicar],
  ])('%s NAO e publico', (_nome, metodo) => {
    expect(reflector.get(CHAVE_PUBLICO, metodo)).toBeUndefined();
  });

  /**
   * A area do cliente nao expoe exclusao de observacao, e a ausencia e a decisao
   * (item 2.3.3): observacao e append-only porque o advogado trabalha a partir
   * do que o cliente escreveu. Decisao que so existe como ausencia ninguem
   * defende numa revisao futura.
   */
  it('nao expoe exclusao nem edicao de observacao', () => {
    const metodos = PedidosClienteController.prototype as unknown as Record<
      string,
      unknown
    >;

    expect(metodos['excluirObservacao']).toBeUndefined();
    expect(metodos['editarObservacao']).toBeUndefined();
  });
});

describe('PedidosClienteController', () => {
  function montar(): {
    controlador: PedidosClienteController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];
    const registrar =
      (nome: string) =>
      (...argumentos: unknown[]): Promise<unknown> => {
        chamadas.push(`${nome} ${argumentos.map(String).join(' ')}`);
        return Promise.resolve([]);
      };

    return {
      controlador: new PedidosClienteController(
        {
          listarDoCliente: registrar('listarDoCliente'),
          obterCartao: registrar('obterCartao'),
        } as unknown as ConsultaPedidosService,
        {
          confirmarEntrega: (alvo: { pedidoId: string }, uid: string) =>
            registrar('confirmar')(alvo.pedidoId, uid),
          pedirRevisao: (alvo: { pedidoId: string }, uid: string) =>
            registrar('revisao')(alvo.pedidoId, uid),
        } as unknown as EntregaveisService,
        {
          listar: registrar('observacoes.listar'),
          registrar: registrar('observacoes.registrar'),
        } as unknown as ObservacoesService,
        {
          listar: registrar('anexos.listar'),
          pedirEnvio: registrar('anexos.pedirEnvio'),
          confirmarEnvio: registrar('anexos.confirmarEnvio'),
        } as unknown as AnexosService,
        {
          linkDoEntregavel: registrar('portao.entregavel'),
          linkDoAnexo: registrar('portao.anexo'),
        } as unknown as PortaoDeArquivos,
        {
          registrar: registrar('termos.registrar'),
        } as unknown as TermosService,
      ),
      chamadas,
    };
  }

  /**
   * O `clienteId` sai do TOKEN em toda rota — nenhuma delas o aceita no caminho
   * ou na query. Um `GET /pedidos?clienteId=...` funcionaria e seria a forma mais
   * direta de um cliente ler os pedidos de outro; estes testes fixam que o uid
   * usado e sempre o do usuario autenticado.
   */
  it('lista e obtem usando o uid do token', async () => {
    const { controlador, chamadas } = montar();

    await controlador.listar(CLIENTE);
    await controlador.obter('pedido-1', CLIENTE);

    expect(chamadas).toEqual([
      'listarDoCliente uid-clara',
      'obterCartao pedido-1 uid-clara',
    ]);
  });

  /**
   * As acoes do entregavel sao EVENTOS, nao estados de destino: nao existe
   * `PATCH { estado }` neste controlador. E a diferenca entre "mude para
   * entregue" — a transicao manual que o ADR-11 proibe — e "o cliente
   * confirmou".
   */
  it('dispara os dois eventos do cliente pelo uid do token', async () => {
    const { controlador, chamadas } = montar();

    await controlador.confirmar('pedido-1', '001', CLIENTE);
    await controlador.pedirRevisao('pedido-1', '001', CLIENTE);

    expect(chamadas).toEqual([
      'confirmar pedido-1 uid-clara',
      'revisao pedido-1 uid-clara',
    ]);
  });

  it('delega observacoes e anexos com o autor do token', async () => {
    const { controlador, chamadas } = montar();
    const envio = { anexos: [] } as never;

    await controlador.listarObservacoes('pedido-1', CLIENTE);
    await controlador.registrarObservacao('pedido-1', { texto: 'oi' }, CLIENTE);
    await controlador.listarAnexos('pedido-1', CLIENTE);
    await controlador.pedirEnvioDeAnexos('pedido-1', envio, CLIENTE);

    expect(chamadas).toEqual([
      'observacoes.listar pedido-1 [object Object]',
      'observacoes.registrar pedido-1 [object Object] [object Object]',
      'anexos.listar pedido-1 [object Object]',
      'anexos.pedirEnvio pedido-1 [object Object] undefined',
    ]);
  });

  /**
   * O DOWNLOAD PASSA PELO PORTAO, sempre. Nenhuma rota deste controlador emite
   * link por conta propria — e a regra inviolavel 6 depende disso: a checagem de
   * `limpo` vive num lugar so, e o controlador nao e esse lugar.
   */
  it('os dois downloads delegam ao portao', async () => {
    const { controlador, chamadas } = montar();

    await controlador.baixarEntregavel('pedido-1', '001', CLIENTE);
    await controlador.baixarAnexo('pedido-1', 'anexo-1', CLIENTE);

    expect(chamadas).toEqual([
      'portao.entregavel [object Object] [object Object]',
      'portao.anexo [object Object] [object Object]',
    ]);
  });

  /** O aceite de termos e por VERSAO do arquivo, e o uid sai do token. */
  it('registra o aceite com o usuario do token e a versao', async () => {
    const { controlador, chamadas } = montar();

    await controlador.aceitarTermos(
      'pedido-1',
      '001',
      { versaoArquivo: 2 },
      CLIENTE,
    );

    expect(chamadas).toEqual(['termos.registrar [object Object]']);
  });
});

describe('PedidosAdvogadoController', () => {
  function montar(): {
    controlador: PedidosAdvogadoController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];
    const registrar =
      (nome: string) =>
      (...argumentos: unknown[]): Promise<unknown> => {
        chamadas.push(`${nome} ${argumentos.map(String).join(' ')}`);
        return Promise.resolve([]);
      };

    return {
      controlador: new PedidosAdvogadoController(
        {
          listarDoAdvogado: registrar('listarDoAdvogado'),
          obterDemanda: (pedidoId: string, uid: string) => {
            chamadas.push(`obterDemanda ${pedidoId} ${uid}`);
            return Promise.resolve({ cliente: { uid: 'uid-clara' } });
          },
        } as unknown as ConsultaPedidosService,
        {
          iniciarTrabalho: (alvo: { pedidoId: string }, uid: string) =>
            registrar('iniciar')(alvo.pedidoId, uid),
          retomarTrabalho: (alvo: { pedidoId: string }, uid: string) =>
            registrar('retomar')(alvo.pedidoId, uid),
        } as unknown as EntregaveisService,
        {
          listar: registrar('observacoes.listar'),
          registrar: registrar('observacoes.registrar'),
        } as unknown as ObservacoesService,
        { listar: registrar('anexos.listar') } as unknown as AnexosService,
        { anamneseDe: registrar('anamneseDe') } as unknown as ClientesService,
        {
          pedirEnvio: (
            alvo: { pedidoId: string },
            uid: string,
            arquivo: { nome: string },
          ) => registrar('arquivo')(alvo.pedidoId, arquivo.nome, uid),
          confirmarEnvio: (alvo: { pedidoId: string }, uid: string) =>
            registrar('arquivo.confirmar')(alvo.pedidoId, uid),
        } as unknown as UploadDeEntregavelService,
        {
          linkDoEntregavel: registrar('portao.entregavel'),
          linkDoAnexo: registrar('portao.anexo'),
        } as unknown as PortaoDeArquivos,
      ),
      chamadas,
    };
  }

  it('lista e obtem usando o uid do token', async () => {
    const { controlador, chamadas } = montar();

    await controlador.listar(ADVOGADO);
    await controlador.obter('pedido-1', ADVOGADO);

    expect(chamadas).toEqual([
      'listarDoAdvogado uid-ana',
      'obterDemanda pedido-1 uid-ana',
    ]);
  });

  /**
   * A ORDEM AQUI E A SEGURANCA. `obterDemanda` roda ANTES de `anamneseDe`: sem
   * isso, bastaria conhecer o id de um pedido qualquer para ler a ficha juridica
   * do cliente dele, que e o dado mais sensivel do sistema (arquitetura, secao
   * 13). Este teste falha se alguem inverter as duas linhas.
   */
  it('confere a atribuicao antes de ler a anamnese', async () => {
    const { controlador, chamadas } = montar();

    await controlador.anamnese('pedido-1', ADVOGADO);

    expect(chamadas).toEqual([
      'obterDemanda pedido-1 uid-ana',
      'anamneseDe uid-clara',
    ]);
  });

  it('dispara os eventos do advogado pelo uid do token', async () => {
    const { controlador, chamadas } = montar();

    await controlador.iniciar('pedido-1', '001', ADVOGADO);
    await controlador.retomar('pedido-1', '001', ADVOGADO);
    await controlador.pedirEnvioDeArquivo(
      'pedido-1',
      '001',
      { nome: 'minuta.pdf', tipo: 'application/pdf', tamanhoBytes: 1000 },
      ADVOGADO,
    );
    await controlador.confirmarArquivo('pedido-1', '001', ADVOGADO);

    expect(chamadas).toEqual([
      'iniciar pedido-1 uid-ana',
      'retomar pedido-1 uid-ana',
      'arquivo pedido-1 minuta.pdf uid-ana',
      'arquivo.confirmar pedido-1 uid-ana',
    ]);
  });

  it('le observacoes e anexos da demanda', async () => {
    const { controlador, chamadas } = montar();

    await controlador.listarObservacoes('pedido-1', ADVOGADO);
    await controlador.registrarObservacao(
      'pedido-1',
      { texto: 'ok' },
      ADVOGADO,
    );
    await controlador.listarAnexos('pedido-1', ADVOGADO);

    expect(chamadas).toHaveLength(3);
  });
});

describe('PedidosAdminController', () => {
  function montar(): {
    controlador: PedidosAdminController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];

    return {
      controlador: new PedidosAdminController({
        listar: (situacao: string) => {
          chamadas.push(`listar ${situacao}`);
          return Promise.resolve([]);
        },
        atribuir: (pedidoId: string, advogadoId: string, admin: string) => {
          chamadas.push(`atribuir ${pedidoId} a ${advogadoId} por ${admin}`);
          return Promise.resolve({});
        },
        remover: (pedidoId: string, admin: string) => {
          chamadas.push(`remover ${pedidoId} por ${admin}`);
          return Promise.resolve({});
        },
      } as unknown as DistribuicaoService),
      chamadas,
    };
  }

  /**
   * O padrao e `nao_distribuidos`, e nao `todos`: a caixa de entrada existe para
   * mostrar o que ainda precisa de acao. Valor desconhecido cai no padrao em vez
   * de derrubar a tela com 400, como em `produtos`.
   */
  it.each([
    ['nao_distribuidos', 'nao_distribuidos'],
    ['distribuidos', 'distribuidos'],
    ['todos', 'todos'],
    [undefined, 'nao_distribuidos'],
    ['inventado', 'nao_distribuidos'],
  ])('lista com situacao %s', async (recebido, esperado) => {
    const { controlador, chamadas } = montar();

    await controlador.listar(recebido);

    expect(chamadas).toEqual([`listar ${esperado}`]);
  });

  /** O autor da distribuicao sai do TOKEN, nunca do corpo: se viesse do corpo, um
   * administrador poderia registrar a distribuicao em nome de outro. */
  it('atribui e remove registrando o administrador autenticado', async () => {
    const { controlador, chamadas } = montar();

    await controlador.atribuir('pedido-1', { advogadoId: 'uid-ana' }, ADMIN);
    await controlador.remover('pedido-1', ADMIN);

    expect(chamadas).toEqual([
      'atribuir pedido-1 a uid-ana por uid-admin',
      'remover pedido-1 por uid-admin',
    ]);
  });
});

describe('ClientesAdminController', () => {
  function montar(): {
    controlador: ClientesAdminController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];

    return {
      controlador: new ClientesAdminController({
        buscar: (filtro: Record<string, unknown>) => {
          chamadas.push(`buscar ${JSON.stringify(filtro)}`);
          return Promise.resolve([]);
        },
        anamneseDe: (uid: string) => {
          chamadas.push(`anamnese ${uid}`);
          return Promise.resolve([]);
        },
      } as unknown as ClientesService),
      chamadas,
    };
  }

  it('passa os dois filtros aparados', async () => {
    const { controlador, chamadas } = montar();

    await controlador.buscar('  ana  ', ' Parecer ');

    expect(chamadas).toEqual(['buscar {"busca":"ana","produto":"Parecer"}']);
  });

  /** Query string e texto livre: termo absurdo deixa de filtrar em vez de
   * derrubar a tela com 400. */
  it('descarta termo longo demais sem estourar', async () => {
    const { controlador, chamadas } = montar();

    await controlador.buscar('a'.repeat(500));

    expect(chamadas).toEqual(['buscar {}']);
  });

  it('le a anamnese pelo uid do caminho', async () => {
    const { controlador, chamadas } = montar();

    await controlador.anamnese('uid-clara');

    expect(chamadas).toEqual(['anamnese uid-clara']);
  });

  /** Nao ha exclusao de cliente: eliminacao de titular e rotina com varredura
   * entre colecoes (arquitetura, secao 13), nao botao numa tabela. */
  it('nao expoe exclusao de cliente', () => {
    const metodos = ClientesAdminController.prototype as unknown as Record<
      string,
      unknown
    >;

    expect(metodos['excluir']).toBeUndefined();
    expect(metodos['remover']).toBeUndefined();
  });
});

describe('DisponibilidadesController', () => {
  function montar(): {
    controlador: DisponibilidadesController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];

    return {
      controlador: new DisponibilidadesController({
        obter: (advogadoId: string, semana?: string) => {
          chamadas.push(`obter ${advogadoId} ${String(semana)}`);
          return Promise.resolve([]);
        },
        publicar: (advogadoId: string, corpo: { semana: string }) => {
          chamadas.push(`publicar ${advogadoId} ${corpo.semana}`);
          return Promise.resolve([]);
        },
      } as unknown as DisponibilidadesService),
      chamadas,
    };
  }

  /**
   * `semanas` viaja na resposta para a tela nao repetir a aritmetica de
   * calendario. Duas implementacoes do "que semana e hoje" — uma no servidor, uma
   * no navegador — discordam na noite de domingo, quando o navegador esta em
   * Sao Paulo e o Cloud Run em UTC.
   */
  it('devolve a janela editavel junto da grade', async () => {
    const { controlador, chamadas } = montar();

    const resposta = await controlador.obter(ADVOGADO, '2026-09-07');

    expect(resposta.semanas).toHaveLength(2);
    expect(chamadas).toEqual(['obter uid-ana 2026-09-07']);
  });

  it('sem semana, deixa o servico calcular a corrente', async () => {
    const { controlador, chamadas } = montar();

    await controlador.obter(ADVOGADO);

    expect(chamadas).toEqual(['obter uid-ana undefined']);
  });

  /** O advogado publica a PROPRIA grade: o uid sai do token, e o servico nao tem
   * parametro por onde receber outro. */
  it('publica com o uid do token', async () => {
    const { controlador, chamadas } = montar();

    await controlador.publicar({ semana: '2026-09-07', slots: [] }, ADVOGADO);

    expect(chamadas).toEqual(['publicar uid-ana 2026-09-07']);
  });
});

describe('OutboxController', () => {
  function montar(situacao: ResultadoDoDespacho): {
    controlador: OutboxController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];

    const despachante = {
      despachar: (id: string) => {
        chamadas.push(`despachar ${id}`);
        return Promise.resolve(situacao);
      },
    } as unknown as DespachanteOutbox;

    const varredor = {
      varrer: () => {
        chamadas.push('varrer');
        return Promise.resolve({ pendentes: 2, falhados: 1 });
      },
    } as unknown as VarredorDoOutbox;

    return {
      controlador: new OutboxController(despachante, varredor),
      chamadas,
    };
  }

  /**
   * O STATUS HTTP E O QUE CONTROLA A REENTREGA, e nao detalhe de apresentacao: o
   * Cloud Tasks reentrega o que respondeu erro e conclui o que respondeu 2xx. Um
   * `falhou` respondendo 200 seria uma fila que nunca tenta de novo, com toda a
   * aparencia de um sistema resiliente.
   */
  it('so `falhou` vira erro, para a fila tentar de novo', async () => {
    const { controlador } = montar('falhou');

    await expect(controlador.entregar({ id: 'id-1' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  /**
   * `abandonado` responde 2xx porque o orcamento acabou e insistir nao e o que se
   * quer; `em-andamento` porque outra tarefa esta com o registro, e insistir em
   * cima de quem ja trabalha so gastaria a fila; os outros dois porque nao ha
   * nada a fazer.
   */
  it.each([
    ['entregue'],
    ['abandonado'],
    ['em-andamento'],
    ['ja-entregue'],
    ['inexistente'],
  ] as ResultadoDoDespacho[][])('%s conclui a tarefa', async (situacao) => {
    const { controlador, chamadas } = montar(situacao);

    await expect(controlador.entregar({ id: 'id-1' })).resolves.toEqual({
      situacao,
    });
    expect(chamadas).toEqual(['despachar id-1']);
  });

  it('delega a varredura e devolve o resumo', async () => {
    const { controlador, chamadas } = montar('entregue');

    await expect(controlador.varrer()).resolves.toEqual({
      pendentes: 2,
      falhados: 1,
    });
    expect(chamadas).toEqual(['varrer']);
  });
});

describe('OutboxAdminController', () => {
  function montar(): {
    controlador: OutboxAdminController;
    chamadas: string[];
  } {
    const chamadas: string[] = [];
    const servico = {
      listar: (situacao?: string) => {
        chamadas.push(`listar ${situacao ?? 'todos'}`);
        return Promise.resolve([]);
      },
      reenviar: (id: string, admin: string) => {
        chamadas.push(`reenviar ${id} por ${admin}`);
        return Promise.resolve({ reenviado: true });
      },
    } as unknown as OutboxAdminService;

    return { controlador: new OutboxAdminController(servico), chamadas };
  }

  it('repassa o filtro de situacao', async () => {
    const { controlador, chamadas } = montar();
    await controlador.listar('falhou');
    expect(chamadas).toEqual(['listar falhou']);
  });

  it('lista tudo quando nao ha filtro', async () => {
    const { controlador, chamadas } = montar();
    await controlador.listar();
    expect(chamadas).toEqual(['listar todos']);
  });

  /** Quem reenviou vem do TOKEN, nunca do corpo — e o unico registro de autoria
   * que esta acao tem. */
  it('reenvia atribuindo a autoria ao administrador autenticado', async () => {
    const { controlador, chamadas } = montar();

    await controlador.reenviar('id-1', ADMIN);

    expect(chamadas).toEqual(['reenviar id-1 por uid-admin']);
  });
});
