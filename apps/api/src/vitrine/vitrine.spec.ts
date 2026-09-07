import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ProdutoResumo } from 'shared';
import type { PreCadastrosService } from '../pre-cadastros/pre-cadastros.service.js';
import type { ProdutosService } from '../produtos/produtos.service.js';
import {
  CABECALHO_PRE_CADASTRO,
  PreCadastroGuard,
} from './pre-cadastro.guard.js';
import { VitrineService } from './vitrine.service.js';

const PRODUTO: ProdutoResumo = {
  id: 'produto-1',
  nome: 'Parecer Juridico Trabalhista',
  descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: ['Reuna os contratos vigentes.'],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 7,
  numeroRevisoesPermitidas: 2,
  ativo: true,
  criadoEm: null,
  atualizadoEm: null,
};

function contextoCom(
  cabecalhos: Record<string, string | string[] | undefined>,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: cabecalhos }) }),
  } as unknown as ExecutionContext;
}

function guardaQue(responde: boolean): {
  guard: PreCadastroGuard;
  conferidos: string[];
} {
  const conferidos: string[] = [];
  const servico = {
    liberado: (token: string) => {
      conferidos.push(token);
      return Promise.resolve(responde);
    },
  } as unknown as PreCadastrosService;

  return { guard: new PreCadastroGuard(servico), conferidos };
}

describe('PreCadastroGuard', () => {
  it('deixa passar quem apresenta token valido', async () => {
    const { guard, conferidos } = guardaQue(true);

    await expect(
      guard.canActivate(
        contextoCom({ [CABECALHO_PRE_CADASTRO]: 'id.segredo' }),
      ),
    ).resolves.toBe(true);
    expect(conferidos).toEqual(['id.segredo']);
  });

  /**
   * A mensagem e IDENTICA nos quatro casos. Dizer "token vencido" em vez de
   * "token invalido" contaria a quem esta sondando que aquele e-mail existe na
   * base de leads — e a base de leads de um escritorio de advocacia e uma lista
   * de quem procurou um advogado.
   */
  it.each([
    ['ausente', {}],
    ['vazio', { [CABECALHO_PRE_CADASTRO]: '' }],
    [
      'repetido, que chega como lista',
      { [CABECALHO_PRE_CADASTRO]: ['a', 'b'] },
    ],
  ])('recusa cabecalho %s', async (_nome, cabecalhos) => {
    const { guard } = guardaQue(true);

    await expect(guard.canActivate(contextoCom(cabecalhos))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa token que o servico nao reconhece', async () => {
    const { guard } = guardaQue(false);

    await expect(
      guard.canActivate(contextoCom({ [CABECALHO_PRE_CADASTRO]: 'id.errado' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  /**
   * Cabecalho ausente nem chega a consultar o Firestore. E leitura economizada em
   * toda requisicao de quem nao tem token — inclusive a de um robo que descobriu
   * a rota.
   */
  it.each([
    ['ausente', {}],
    ['vazio', { [CABECALHO_PRE_CADASTRO]: '' }],
    ['repetido', { [CABECALHO_PRE_CADASTRO]: ['a', 'b'] }],
  ])('nao consulta o banco com cabecalho %s', async (_nome, cabecalhos) => {
    const { guard, conferidos } = guardaQue(true);

    await expect(guard.canActivate(contextoCom(cabecalhos))).rejects.toThrow();
    expect(conferidos).toEqual([]);
  });
});

describe('VitrineService', () => {
  function montar(): { servico: VitrineService; chamadas: string[] } {
    const chamadas: string[] = [];
    const produtos = {
      listar: (situacao: string) => {
        chamadas.push(`listar ${situacao}`);
        return Promise.resolve([PRODUTO]);
      },
    } as unknown as ProdutosService;

    return { servico: new VitrineService(produtos), chamadas };
  }

  /**
   * `ativos`, nunca `todos`. Um produto tirado da vitrine pelo administrador
   * (item 2.5.4) tem que sumir da vitrine — e este e o unico ponto do sistema em
   * que "sumir da vitrine" acontece de fato.
   */
  it('pede so os produtos ativos', async () => {
    const { servico, chamadas } = montar();

    await servico.listar();

    expect(chamadas).toEqual(['listar ativos']);
  });

  it('devolve o recorte publico, sem os campos administrativos', async () => {
    const { servico } = montar();

    const [item] = await servico.listar();

    expect(item).toEqual({
      id: 'produto-1',
      nome: 'Parecer Juridico Trabalhista',
      descricao: 'Analise de risco trabalhista com recomendacoes praticas.',
      precoCentavos: 250_000,
      entregaveis: ['Parecer em PDF'],
      quantidadeReunioes: 2,
      numeroRevisoesPermitidas: 2,
    });
  });
});
