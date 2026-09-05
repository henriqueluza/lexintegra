import type { Firestore } from 'firebase-admin/firestore';
import { CATALOGO_FICTICIO } from '../../../../scripts/dados-ficticios/catalogo-produtos.js';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { EntregaveisService } from './entregaveis.service.js';

const ADMIN = 'uid-admin';
const CLIENTE = 'uid-cliente';
const ADVOGADO = 'uid-advogado';
const ALVO = { pedidoId: 'pedido-1', entregavelId: '001' };
const CAMINHO = 'pedidos/pedido-1/entregaveis/001';

/** O parecer trabalhista: um entregavel, uma revisao contratada. */
const PARECER = CATALOGO_FICTICIO[1];

let banco: Firestore;
let entregaveis: EntregaveisService;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();
  entregaveis = new EntregaveisService(banco);
});

async function comprar(revisoes: number): Promise<void> {
  const produtos = new ProdutosService(banco);
  const pedidos = new PedidosService(banco);
  const { id } = await produtos.criar(
    { ...PARECER, numeroRevisoesPermitidas: revisoes },
    ADMIN,
  );

  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(
      transacao,
      await pedidos.preparar(transacao, [
        {
          pedidoId: 'pedido-1',
          clienteId: CLIENTE,
          pagamentoId: 'pagamento-1',
          produtoOrigemId: id,
        },
      ]),
    );
  });
}

async function ateAguardandoCliente(revisoes = 1): Promise<void> {
  await comprar(revisoes);
  await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);
  await entregaveis.registrarArquivo(ALVO, { nome: 'parecer.pdf' }, ADVOGADO);
}

async function estado(): Promise<string> {
  const documento = await banco.doc(CAMINHO).get();
  return documento.data()?.['estado'] as string;
}

describe('maquina de estados contra o Firestore', () => {
  it('vai de solicitado a entregue por eventos de dominio', async () => {
    await ateAguardandoCliente();

    expect(await estado()).toBe('em_elaboracao');
    await entregaveis.confirmarEntrega(ALVO, CLIENTE);
    expect(await estado()).toBe('entregue');
  });

  /**
   * O SEGUNDO CRITERIO DE ACEITE DA ETAPA 5, contra o banco de verdade: tentar
   * avancar manualmente um entregavel para `entregue` sem passar pelo evento de
   * confirmacao do cliente e rejeitado no servidor.
   */
  describe('entregue forcado', () => {
    it('recusa confirmar a partir de solicitado', async () => {
      await comprar(1);
      await expect(
        entregaveis.confirmarEntrega(ALVO, CLIENTE),
      ).rejects.toThrow();
      expect(await estado()).toBe('solicitado');
    });

    it('recusa confirmar sem arquivo enviado', async () => {
      await comprar(1);
      await entregaveis.iniciarTrabalho(ALVO, ADVOGADO);

      await expect(entregaveis.confirmarEntrega(ALVO, CLIENTE)).rejects.toThrow(
        /ainda nao tem arquivo/,
      );
      expect(await estado()).toBe('em_elaboracao');
    });

    it('recusa confirmar a partir de em_revisao', async () => {
      await ateAguardandoCliente();
      await entregaveis.pedirRevisao(ALVO, CLIENTE);

      await expect(
        entregaveis.confirmarEntrega(ALVO, CLIENTE),
      ).rejects.toThrow();
      expect(await estado()).toBe('em_revisao');
    });

    it('recusa confirmacao vinda de quem nao e o cliente do pedido', async () => {
      await ateAguardandoCliente();

      await expect(
        entregaveis.confirmarEntrega(ALVO, ADVOGADO),
      ).rejects.toThrow();
      await expect(entregaveis.confirmarEntrega(ALVO, ADMIN)).rejects.toThrow();
      expect(await estado()).toBe('em_elaboracao');
    });

    it('trata entregue como terminal', async () => {
      await ateAguardandoCliente();
      await entregaveis.confirmarEntrega(ALVO, CLIENTE);

      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow();
      await expect(
        entregaveis.iniciarTrabalho(ALVO, ADVOGADO),
      ).rejects.toThrow();
      expect(await estado()).toBe('entregue');
    });
  });

  describe('saldo de revisoes', () => {
    it('recusa revisao depois de esgotado o saldo contratado', async () => {
      await ateAguardandoCliente(1);

      await entregaveis.pedirRevisao(ALVO, CLIENTE);
      await entregaveis.retomarTrabalho(ALVO, ADVOGADO);
      await entregaveis.registrarArquivo(ALVO, { nome: 'v2.pdf' }, ADVOGADO);

      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow(
        /Saldo de revisoes esgotado/,
      );

      const documento = await banco.doc(CAMINHO).get();
      expect(documento.data()?.['revisoesUsadas']).toBe(1);
    });

    /**
     * O saldo sai do snapshot do pedido, nao do catalogo. Aumentar o numero de
     * revisoes no produto nao da revisao a quem ja comprou — regra inviolavel 5
     * dentro da maquina de estados.
     */
    it('nao ganha revisao quando o catalogo aumenta o numero contratado', async () => {
      await ateAguardandoCliente(0);
      const produtos = new ProdutosService(banco);
      const [produto] = await produtos.listar('todos');

      await produtos.editar(
        produto.id,
        { ...PARECER, numeroRevisoesPermitidas: 5 },
        ADMIN,
      );

      await expect(entregaveis.pedirRevisao(ALVO, CLIENTE)).rejects.toThrow(
        /Saldo de revisoes esgotado/,
      );
    });
  });

  describe('trilha de transicoes', () => {
    it('registra cada mudanca em ordem, com carimbo do servidor', async () => {
      await ateAguardandoCliente();
      await entregaveis.pedirRevisao(ALVO, CLIENTE);
      await entregaveis.retomarTrabalho(ALVO, ADVOGADO);

      const trilha = await banco.collection(`${CAMINHO}/transicoes`).get();
      const registros = trilha.docs.map((documento) => documento.data());

      expect(trilha.docs.map((d) => d.id)).toEqual([
        '0001',
        '0002',
        '0003',
        '0004',
      ]);
      expect(registros.map((r) => r['evento'])).toEqual([
        'criar-pedido',
        'iniciar-trabalho',
        'pedir-revisao',
        'retomar-trabalho',
      ]);
      expect(registros.every((r) => r['por'] === 'sistema')).toBe(true);
      // Carimbo de servidor: so materializa contra o Firestore de verdade.
      expect(registros.every((r) => r['em'] !== undefined)).toBe(true);
    });

    /**
     * A trilha registra MUDANCA DE ESTADO. Upload nao muda estado (ADR-11), entao
     * nao entra — a trilha do arquivo e a versao.
     */
    it('nao cria transicao para o upload', async () => {
      await ateAguardandoCliente();
      await entregaveis.registrarArquivo(ALVO, { nome: 'v2.pdf' }, ADVOGADO);

      const trilha = await banco.collection(`${CAMINHO}/transicoes`).get();
      expect(trilha.size).toBe(2);

      const documento = await banco.doc(CAMINHO).get();
      expect(
        (documento.data()?.['arquivoAtual'] as { versao: number }).versao,
      ).toBe(2);
    });
  });
});
