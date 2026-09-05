import type { Firestore } from 'firebase-admin/firestore';
import { esquemaNovoProduto } from 'shared';
import { CATALOGO_FICTICIO } from '../../../../scripts/dados-ficticios/catalogo-produtos.js';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { COLECAO_PRODUTOS, ProdutosService } from './produtos.service.js';

const ADMIN = 'uid-admin';

let banco: Firestore;
let servico: ProdutosService;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  servico = new ProdutosService(banco);
});

/**
 * O contrato que o LEIA-ME de `scripts/dados-ficticios/` promete: quando o
 * catalogo real da B&C chegar e alguem trocar os objetos daquele arquivo, um
 * preco digitado em reais em vez de centavos, ou um produto sem entregavel, falha
 * AQUI — nao em producao, e nao na primeira compra.
 */
describe('catalogo ficticio', () => {
  it('tem entre 4 e 6 produtos', () => {
    expect(CATALOGO_FICTICIO.length).toBeGreaterThanOrEqual(4);
    expect(CATALOGO_FICTICIO.length).toBeLessThanOrEqual(6);
  });

  it.each(CATALOGO_FICTICIO.map((produto) => [produto.nome, produto]))(
    'o produto %s passa pelo mesmo schema que a API usa para recusar',
    (_nome, produto) => {
      expect(esquemaNovoProduto.safeParse(produto).success).toBe(true);
    },
  );

  /**
   * Preco em centavos e inteiro. Um valor abaixo de mil centavos (R$ 10) num
   * catalogo juridico e o sintoma classico de alguem ter digitado reais.
   */
  it.each(CATALOGO_FICTICIO.map((p) => [p.nome, p.precoCentavos]))(
    'o preco de %s esta em centavos',
    (_nome, precoCentavos) => {
      expect(Number.isInteger(precoCentavos)).toBe(true);
      expect(precoCentavos).toBeGreaterThan(1000);
    },
  );
});

describe('ProdutosService contra o Firestore', () => {
  it('materializa o carimbo do servidor', async () => {
    const { id } = await servico.criar(CATALOGO_FICTICIO[0], ADMIN);

    // O `criar` devolve `null` porque o sentinel ainda nao virou Timestamp; a
    // releitura e o que prova que ele materializou de verdade no servidor.
    const relido = await servico.obter(id);
    expect(relido.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(relido.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('grava o preco como inteiro, nao como double', async () => {
    const { id } = await servico.criar(CATALOGO_FICTICIO[0], ADMIN);
    const bruto = await banco.collection(COLECAO_PRODUTOS).doc(id).get();

    expect(Number.isInteger(bruto.data()?.['precoCentavos'])).toBe(true);
    expect(bruto.data()?.['precoCentavos']).toBe(
      CATALOGO_FICTICIO[0].precoCentavos,
    );
  });

  /**
   * A consulta que o indice composto de `infra/terraform/firestore.tf` cobre:
   * `where('ativo') + orderBy('nome')`. O emulador nao exige indice — e por isso
   * que o Terraform existe — mas exercitar a consulta aqui garante ao menos que
   * ela devolve o conjunto certo.
   */
  it('filtra por situacao e ordena por nome', async () => {
    for (const produto of CATALOGO_FICTICIO)
      await servico.criar(produto, ADMIN);
    const todos = await servico.listar('todos');
    await servico.desativar(todos[0].id, ADMIN);

    const ativos = await servico.listar('ativos');
    const inativos = await servico.listar('inativos');

    expect(ativos).toHaveLength(CATALOGO_FICTICIO.length - 1);
    expect(inativos.map((p) => p.nome)).toEqual([todos[0].nome]);
    expect([...ativos].map((p) => p.nome)).toEqual(
      [...ativos].map((p) => p.nome).sort((a, b) => a.localeCompare(b)),
    );
  });

  it('nao reativa produto desativado ao editar, contra o banco de verdade', async () => {
    const { id } = await servico.criar(CATALOGO_FICTICIO[0], ADMIN);
    await servico.desativar(id, ADMIN);

    await servico.editar(
      id,
      { ...CATALOGO_FICTICIO[0], precoCentavos: 111_100 },
      ADMIN,
    );

    const relido = await servico.obter(id);
    expect(relido.ativo).toBe(false);
    expect(relido.precoCentavos).toBe(111_100);
  });
});
