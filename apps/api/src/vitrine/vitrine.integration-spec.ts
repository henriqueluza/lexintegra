import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import type { NovoProduto, NovoPreCadastro } from 'shared';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { PreCadastrosService } from '../pre-cadastros/pre-cadastros.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import {
  CABECALHO_PRE_CADASTRO,
  PreCadastroGuard,
} from './pre-cadastro.guard.js';
import { VitrineService } from './vitrine.service.js';

const ADMIN = 'uid-admin';

const ANA: NovoPreCadastro = {
  nome: 'Ana Ribeiro Salgado',
  email: 'ana@empresa.com.br',
  telefone: '61990000000',
};

function produto(nome: string): NovoProduto {
  return {
    nome,
    descricao: 'Analise de risco com recomendacoes praticas.',
    precoCentavos: 250_000,
    entregaveis: ['Parecer em PDF'],
    textosOrientativos: ['Reuna os contratos vigentes.'],
    quantidadeReunioes: 2,
    prazoValidadeReunioesDias: 365,
    intervaloMinimoReunioesDias: 7,
    numeroRevisoesPermitidas: 2,
  };
}

function contextoCom(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: token === undefined ? {} : { [CABECALHO_PRE_CADASTRO]: token },
      }),
    }),
  } as unknown as ExecutionContext;
}

let banco: Firestore;
let produtos: ProdutosService;
let preCadastros: PreCadastrosService;
let vitrine: VitrineService;
let guard: PreCadastroGuard;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  produtos = new ProdutosService(banco);
  preCadastros = new PreCadastrosService(banco);
  vitrine = new VitrineService(produtos);
  guard = new PreCadastroGuard(preCadastros);
});

/**
 * A regra de negocio inteira da etapa, contra o banco de verdade: sem
 * pre-cadastro nao ha catalogo, com pre-cadastro ha — e o que aparece la e so o
 * que esta na vitrine.
 */
describe('vitrine liberada por pre-cadastro', () => {
  it('recusa quem nao apresenta token', async () => {
    await expect(guard.canActivate(contextoCom())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('aceita o token emitido pelo proprio pre-cadastro', async () => {
    const { token } = await preCadastros.registrar(ANA);

    await expect(guard.canActivate(contextoCom(token))).resolves.toBe(true);
  });

  /**
   * O caso que o item 2.5.4 pede e que o `ProdutosService` implementa como
   * desativacao em vez de exclusao. Aqui e onde a decisao aparece para o
   * visitante: o produto continua existindo, e some da vitrine.
   */
  it('mostra so os produtos ativos, em ordem de nome', async () => {
    await produtos.criar(produto('Alteracao de contrato social'), ADMIN);
    const parecer = await produtos.criar(produto('Parecer trabalhista'), ADMIN);
    const revisao = await produtos.criar(produto('Revisao de contrato'), ADMIN);
    await produtos.desativar(parecer.id, ADMIN);

    const publicados = await vitrine.listar();

    expect(publicados.map((item) => item.nome)).toEqual([
      'Alteracao de contrato social',
      'Revisao de contrato',
    ]);
    expect(publicados.map((item) => item.id)).toContain(revisao.id);
  });

  /**
   * O recorte de `paraVitrine` conferido contra um documento que passou pelo
   * Firestore de verdade — nao contra um objeto montado no teste. Um campo novo
   * no produto que vazasse para a rota publica apareceria aqui.
   */
  it('nao entrega campo administrativo nenhum', async () => {
    await produtos.criar(produto('Revisao de contrato'), ADMIN);

    const [item] = await vitrine.listar();

    expect(Object.keys(item).sort()).toEqual([
      'descricao',
      'entregaveis',
      'id',
      'nome',
      'numeroRevisoesPermitidas',
      'precoCentavos',
      'quantidadeReunioes',
    ]);
  });
});
