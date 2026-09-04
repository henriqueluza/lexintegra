import type { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
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
  it('a superficie administrativa exige admin, na classe', () => {
    const exigidos = reflector.get<readonly Perfil[]>(
      CHAVE_PERFIS,
      AdvogadosController,
    );
    expect(exigidos).toEqual(['admin']);
  });

  it.each([
    ['listar', AdvogadosController.prototype.listar],
    ['criar', AdvogadosController.prototype.criar],
    ['suspender', AdvogadosController.prototype.suspender],
    ['reativar', AdvogadosController.prototype.reativar],
  ])('o metodo administrativo %s nao se declara publico', (_nome, metodo) => {
    expect(reflector.get(CHAVE_PUBLICO, metodo)).toBeUndefined();
  });

  /**
   * As unicas duas rotas publicas do sistema hoje. Cada linha aqui e uma decisao
   * que precisou de justificativa: o health e alvo do startup probe do Cloud Run,
   * que nao tem token; o pedido de redefinicao e para quem esqueceu a senha e
   * portanto nao consegue autenticar.
   */
  it.each([
    ['health', HealthController.prototype.obter],
    ['redefinicao de senha', AutenticacaoController.prototype.redefinirSenha],
  ])('%s e publico', (_nome, metodo) => {
    expect(reflector.get(CHAVE_PUBLICO, metodo)).toBe(true);
  });

  it('a rota `eu` NAO e publica', () => {
    expect(
      reflector.get(CHAVE_PUBLICO, AutenticacaoController.prototype.eu),
    ).toBeUndefined();
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
