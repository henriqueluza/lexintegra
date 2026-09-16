import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Auth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  VERSAO_TERMOS_CHECKOUT,
  type NovoCheckout,
  type NovoProduto,
} from 'shared';
import { FirestoreFalso } from '../firestore-falso.js';
import { GatewayPagamentoFalso } from '../pagamentos/gateway/gateway-falso.js';
import { PagamentosDesligados } from '../pagamentos/gateway/gateway.js';
import { GatewayPagamentoDesligado } from '../pagamentos/gateway/gateway-falso.js';
import type { GatewayPagamento } from '../pagamentos/gateway/gateway.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import {
  COLECAO_CHECKOUTS,
  FOLGA_ANTES_DE_APAGAR_MS,
  VALIDADE_CHECKOUT_HOSPEDADO_MS,
  type DocumentoCheckout,
} from './checkout.js';
import { CheckoutService } from './checkout.service.js';
import { CobrancaDoCheckout } from './cobranca.service.js';
import {
  COLECAO_PRODUTOS_GATEWAY,
  idDoProdutoNoGateway,
  ProdutosNoGateway,
} from './produtos-no-gateway.js';

const ADMIN = 'uid-admin';
const LEAD = 'hash-do-email-da-ana';
const AGORA = Date.parse('2026-09-14T15:00:00.000Z');

const PARECER: NovoProduto = {
  nome: 'Parecer de risco trabalhista',
  descricao: 'Diagnostico das rotinas atuais.',
  precoCentavos: 250_000,
  entregaveis: ['Parecer em PDF'],
  textosOrientativos: [],
  quantidadeReunioes: 2,
  prazoValidadeReunioesDias: 365,
  intervaloMinimoReunioesDias: 15,
  numeroRevisoesPermitidas: 2,
};

const CONTRATO: NovoProduto = {
  ...PARECER,
  nome: 'Revisao de contrato comercial',
  precoCentavos: 120_000,
};

interface UsuarioFalso {
  email: string;
  customClaims?: Record<string, unknown>;
}

interface Arranjo {
  banco: FirestoreFalso;
  gateway: GatewayPagamentoFalso;
  produtos: ProdutosService;
  usuarios: UsuarioFalso[];
  servico: CheckoutService;
  parecer: string;
  contrato: string;
}

async function montar(
  gatewayAlternativo?: GatewayPagamento,
  erroDoAuth?: Error,
): Promise<Arranjo> {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  const gateway = new GatewayPagamentoFalso();
  const produtos = new ProdutosService(db);
  const usuarios: UsuarioFalso[] = [];

  const auth = {
    getUserByEmail: (email: string) => {
      if (erroDoAuth !== undefined) return Promise.reject(erroDoAuth);
      const usuario = usuarios.find((u) => u.email === email);
      return usuario === undefined
        ? Promise.reject(
            Object.assign(new Error('no user'), {
              code: 'auth/user-not-found',
            }),
          )
        : Promise.resolve(usuario);
    },
  } as unknown as Auth;

  const servico = new CheckoutService(
    db,
    auth,
    new PedidosService(db),
    new CobrancaDoCheckout(
      db,
      gatewayAlternativo ?? gateway,
      new ProdutosNoGateway(db, gatewayAlternativo ?? gateway),
    ),
  );

  const { id: parecer } = await produtos.criar(PARECER, ADMIN);
  const { id: contrato } = await produtos.criar(CONTRATO, ADMIN);

  return { banco, gateway, produtos, usuarios, servico, parecer, contrato };
}

function pedido(
  arranjo: Arranjo,
  alteracao: Partial<NovoCheckout> = {},
): NovoCheckout {
  return {
    itens: [{ produtoId: arranjo.parecer }, { produtoId: arranjo.contrato }],
    metodo: 'pix',
    comprador: { nome: 'Ana Ribeiro', email: 'ana@empresa.com.br' },
    termosVersao: VERSAO_TERMOS_CHECKOUT,
    chaveDoCarrinho: '7d3c2f7e-1b1a-4c5e-9a3f-2b8d9c0e1f2a',
    ...alteracao,
  };
}

function checkout(arranjo: Arranjo, id: string): DocumentoCheckout {
  return arranjo.banco.documentos.get(
    `${COLECAO_CHECKOUTS}/${id}`,
  ) as unknown as DocumentoCheckout;
}

function checkouts(arranjo: Arranjo): string[] {
  return [...arranjo.banco.documentos.keys()].filter((caminho) =>
    caminho.startsWith(`${COLECAO_CHECKOUTS}/`),
  );
}

describe('CheckoutService', () => {
  describe('PIX', () => {
    it('congela o carrinho e devolve o QR code', async () => {
      const arranjo = await montar();

      const iniciado = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      expect(iniciado).toMatchObject({ metodo: 'pix', totalCentavos: 370_000 });
      if (iniciado.metodo !== 'pix') throw new Error('esperava PIX');
      expect(iniciado.pix.brCodeBase64).toMatch(/^data:image\/png/);

      const gravado = checkout(arranjo, iniciado.checkoutId);
      expect(gravado).toMatchObject({
        estado: 'aguardando_pagamento',
        preCadastroId: LEAD,
        metodo: 'pix',
        totalCentavos: 370_000,
        comprador: { nome: 'Ana Ribeiro', email: 'ana@empresa.com.br' },
        termosVersao: VERSAO_TERMOS_CHECKOUT,
      });
      expect(gravado.cobranca).toMatchObject({
        origem: 'transparente',
        valorCentavos: 370_000,
      });
    });

    /**
     * REGRA INVIOLAVEL 5, na ponta do checkout: o snapshot de cada item fica no
     * documento. Os itens sao ordenados, entao a ordem de clique nao muda nada.
     */
    it('guarda o snapshot de cada item no documento', async () => {
      const arranjo = await montar();

      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      const itens = checkout(arranjo, checkoutId).itens;
      expect(itens.map((item) => item.snapshot.nome).sort()).toEqual(
        [CONTRATO.nome, PARECER.nome].sort(),
      );
      expect(
        itens.find((i) => i.produtoOrigemId === arranjo.parecer)?.snapshot,
      ).toEqual(PARECER);
    });

    it('cobra no gateway o total congelado, com o id do checkout', async () => {
      const arranjo = await montar();

      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      const [cobranca] = [...arranjo.gateway.cobrancas.values()];
      expect(cobranca).toMatchObject({
        externalId: checkoutId,
        valorCentavos: 370_000,
        origem: 'transparente',
      });
    });

    /**
     * Um administrador que muda o preco DEPOIS do checkout nao muda o que esta no
     * documento — e e dele que os pedidos vao nascer.
     */
    it('editar o produto depois nao altera o checkout', async () => {
      const arranjo = await montar();
      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      await arranjo.produtos.editar(
        arranjo.parecer,
        { ...PARECER, nome: 'Parecer Premium', precoCentavos: 990_000 },
        ADMIN,
      );

      const gravado = checkout(arranjo, checkoutId);
      expect(gravado.totalCentavos).toBe(370_000);
      expect(
        gravado.itens.find((i) => i.produtoOrigemId === arranjo.parecer)
          ?.snapshot.precoCentavos,
      ).toBe(250_000);
    });

    /** A intencao existe ANTES da cobranca (arquitetura 7.1): leitura, escrita, gateway. */
    it('le antes de escrever, e grava a intencao antes de cobrar', async () => {
      const arranjo = await montar();
      arranjo.banco.ordemDeEscrita.length = 0;

      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      const caminho = `${COLECAO_CHECKOUTS}/${checkoutId}`;
      const operacoes = arranjo.banco.ordemDeEscrita.filter((op) =>
        op.includes(COLECAO_CHECKOUTS),
      );
      expect(operacoes).toEqual([
        `get ${COLECAO_CHECKOUTS}`,
        `get ${caminho}`,
        `set ${caminho}`,
        `update ${caminho}`,
      ]);
    });
  });

  describe('apagarApos (TTL)', () => {
    it('e o vencimento da cobranca mais a folga', async () => {
      const arranjo = await montar();

      const iniciado = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );
      if (iniciado.metodo !== 'pix') throw new Error('esperava PIX');

      const gravado = checkout(arranjo, iniciado.checkoutId);
      expect(gravado.apagarApos.toMillis()).toBe(
        Date.parse(iniciado.pix.expiraEm) + FOLGA_ANTES_DE_APAGAR_MS,
      );
      expect(gravado.expiraEm?.toMillis()).toBe(
        Date.parse(iniciado.pix.expiraEm),
      );
    });

    /**
     * O checkout cuja cobranca nunca saiu tambem guarda nome e e-mail. Sem o campo,
     * a TTL o ignoraria para sempre.
     */
    it('existe tambem quando a cobranca falha', async () => {
      const arranjo = await montar();
      arranjo.gateway.falharProximas(1);

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toThrow(ServiceUnavailableException);

      const [caminho] = checkouts(arranjo);
      const gravado = arranjo.banco.documentos.get(
        caminho,
      ) as unknown as DocumentoCheckout;
      expect(gravado.apagarApos).toBeInstanceOf(Timestamp);
      expect(gravado.apagarApos.toMillis()).toBeGreaterThan(
        AGORA + FOLGA_ANTES_DE_APAGAR_MS,
      );
    });
  });

  describe('retentativa e carrinho alterado', () => {
    it('o mesmo carrinho devolve a mesma cobranca, sem cobrar de novo', async () => {
      const arranjo = await montar();

      const primeiro = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );
      const segundo = await arranjo.servico.iniciar(
        pedido(arranjo, {
          itens: [
            { produtoId: arranjo.contrato },
            { produtoId: arranjo.parecer },
          ],
        }),
        LEAD,
        AGORA + 60_000,
      );

      expect(segundo).toEqual(primeiro);
      expect(checkouts(arranjo)).toHaveLength(1);
    });

    /**
     * O CARRINHO MUDOU DEPOIS DO QR. O checkout antigo vira `substituido` e um
     * novo, com outro id e outra cobranca, toma o lugar dele. Reaproveitar a
     * cobranca antiga faria a pessoa pagar por uma lista que nao esta mais na tela.
     */
    it('carrinho alterado substitui o checkout anterior e cobra de novo', async () => {
      const arranjo = await montar();
      const antigo = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      const novo = await arranjo.servico.iniciar(
        pedido(arranjo, { itens: [{ produtoId: arranjo.parecer }] }),
        LEAD,
        AGORA + 60_000,
      );

      expect(novo.checkoutId).not.toBe(antigo.checkoutId);
      expect(novo.totalCentavos).toBe(250_000);
      expect(checkout(arranjo, antigo.checkoutId).estado).toBe('substituido');
      expect(checkout(arranjo, novo.checkoutId).estado).toBe(
        'aguardando_pagamento',
      );
      expect(arranjo.gateway.cobrancas.size).toBe(2);
    });

    it('nao substitui checkout de outro carrinho', async () => {
      const arranjo = await montar();
      const outro = await arranjo.servico.iniciar(
        pedido(arranjo, {
          chaveDoCarrinho: '11111111-1111-4111-8111-111111111111',
        }),
        LEAD,
        AGORA,
      );

      await arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA);

      expect(checkout(arranjo, outro.checkoutId).estado).toBe(
        'aguardando_pagamento',
      );
    });

    it('nao reabre um carrinho ja pago', async () => {
      const arranjo = await montar();
      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );
      await arranjo.banco
        .collection(COLECAO_CHECKOUTS)
        .doc(checkoutId)
        .update({ estado: 'pago' });

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA + 60_000),
      ).rejects.toThrow(ConflictException);
    });

    it('cobranca vencida abre tentativa nova no mesmo documento', async () => {
      const arranjo = await montar();
      const primeiro = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );
      const cobrancas = arranjo.gateway.cobrancas.size;

      const depois = Date.now() + 2 * 60 * 60 * 1000;
      const segundo = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        depois,
      );

      expect(segundo.checkoutId).toBe(primeiro.checkoutId);
      expect(checkout(arranjo, segundo.checkoutId).estado).toBe(
        'aguardando_pagamento',
      );
      /* O falso devolve a mesma cobranca para o mesmo externalId, como o real. */
      expect(arranjo.gateway.cobrancas.size).toBe(cobrancas);
    });

    it('depois de uma falha, a retentativa cobra', async () => {
      const arranjo = await montar();
      arranjo.gateway.falharProximas(1);
      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toThrow(ServiceUnavailableException);

      const iniciado = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      expect(checkout(arranjo, iniciado.checkoutId).estado).toBe(
        'aguardando_pagamento',
      );
    });
  });

  describe('falhas do gateway', () => {
    it('marca o checkout e responde 503', async () => {
      const arranjo = await montar();
      arranjo.gateway.falharProximas(1);

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toThrow('Nao foi possivel gerar a cobranca');

      const [caminho] = checkouts(arranjo);
      expect(arranjo.banco.documentos.get(caminho)?.['estado']).toBe(
        'falhou_cobranca',
      );
    });

    /**
     * O gateway registrou outro valor. O QR nao chega a tela: seria cobrar um
     * preco diferente do congelado.
     */
    it('valor divergente nao chega a tela', async () => {
      const arranjo = await montar();
      arranjo.gateway.forcarValor(1);

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toThrow(ServiceUnavailableException);

      const [caminho] = checkouts(arranjo);
      expect(arranjo.banco.documentos.get(caminho)).toMatchObject({
        estado: 'falhou_cobranca',
        cobranca: null,
      });
    });

    it('com pagamentos desligados, responde 503 com mensagem propria', async () => {
      const arranjo = await montar(new GatewayPagamentoDesligado());

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toThrow('indisponivel no momento');
    });

    it('erro inesperado sobe como esta, depois de marcar o checkout', async () => {
      const inesperado = new Error('bug');
      const arranjo = await montar({
        ...new GatewayPagamentoDesligado(),
        criarCobrancaPix: () => Promise.reject(inesperado),
      } as unknown as GatewayPagamento);

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toBe(inesperado);

      const [caminho] = checkouts(arranjo);
      expect(arranjo.banco.documentos.get(caminho)?.['estado']).toBe(
        'falhou_cobranca',
      );
    });

    it('PagamentosDesligados e reconhecido', () => {
      expect(new PagamentosDesligados()).toBeInstanceOf(Error);
    });
  });

  describe('recusas antes de qualquer escrita', () => {
    it.each([['termos de outra versao', { termosVersao: 'versao-antiga' }]])(
      '%s',
      async (_caso, alteracao) => {
        const arranjo = await montar();

        await expect(
          arranjo.servico.iniciar(pedido(arranjo, alteracao), LEAD, AGORA),
        ).rejects.toThrow(UnprocessableEntityException);
        expect(checkouts(arranjo)).toEqual([]);
        expect(arranjo.gateway.cobrancas.size).toBe(0);
      },
    );

    it('produto inativo', async () => {
      const arranjo = await montar();
      await arranjo.produtos.desativar(arranjo.contrato, ADMIN);

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(checkouts(arranjo)).toEqual([]);
    });

    /**
     * A claim nunca e sobrescrita (regra 17): o pagamento de um e-mail de advogado
     * nao teria onde virar pedido. Recusar aqui evita dinheiro pago sem destino.
     */
    it.each(['advogado', 'admin'])(
      'e-mail de conta %s, com mensagem que nao diz o perfil',
      async (perfil) => {
        const arranjo = await montar();
        arranjo.usuarios.push({
          email: 'ana@empresa.com.br',
          customClaims: { role: perfil },
        });

        const erro = await arranjo.servico
          .iniciar(pedido(arranjo), LEAD, AGORA)
          .catch((e: Error) => e);

        expect(erro).toBeInstanceOf(ConflictException);
        expect((erro as Error).message).not.toContain(perfil);
        expect(checkouts(arranjo)).toEqual([]);
      },
    );

    it('e-mail de cliente existente compra de novo', async () => {
      const arranjo = await montar();
      arranjo.usuarios.push({
        email: 'ana@empresa.com.br',
        customClaims: { role: 'cliente' },
      });

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).resolves.toMatchObject({ metodo: 'pix' });
    });

    it('conta sem claim nenhuma compra (vira cliente na confirmacao)', async () => {
      const arranjo = await montar();
      arranjo.usuarios.push({ email: 'ana@empresa.com.br' });

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).resolves.toMatchObject({ metodo: 'pix' });
    });

    it('falha do Auth que nao e usuario inexistente sobe', async () => {
      const arranjo = await montar(
        undefined,
        new Error('AUTH_BACKEND_UNAVAILABLE'),
      );

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).rejects.toThrow('AUTH_BACKEND_UNAVAILABLE');
    });

    it('usuario inexistente reconhecido pela mensagem, como no dublê antigo', async () => {
      const arranjo = await montar(undefined, new Error('auth/user-not-found'));

      await expect(
        arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA),
      ).resolves.toMatchObject({ metodo: 'pix' });
    });
  });

  describe('situacao', () => {
    it('devolve so o estado a quem abriu o checkout', async () => {
      const arranjo = await montar();
      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      expect(await arranjo.servico.situacao(checkoutId, LEAD, AGORA)).toEqual({
        estado: 'aguardando_pagamento',
      });
    });

    /** 404, e nao 403: um 403 confirmaria que o id existe. */
    it.each([
      ['de outro pre-cadastro', 'outro-lead'],
      ['inexistente', LEAD],
    ])('recusa checkout %s com 404', async (caso, lead) => {
      const arranjo = await montar();
      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );
      const id = caso === 'inexistente' ? 'nao-existe' : checkoutId;

      await expect(arranjo.servico.situacao(id, lead, AGORA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cobranca vencida aparece como expirada, sem gravar nada', async () => {
      const arranjo = await montar();
      const { checkoutId } = await arranjo.servico.iniciar(
        pedido(arranjo),
        LEAD,
        AGORA,
      );

      const depois = Date.now() + 2 * 60 * 60 * 1000;
      expect(await arranjo.servico.situacao(checkoutId, LEAD, depois)).toEqual({
        estado: 'expirado',
      });
      expect(checkout(arranjo, checkoutId).estado).toBe('aguardando_pagamento');
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Cartao pelo checkout hospedado (ADR-19)                                    */
  /* ------------------------------------------------------------------------ */

  describe('cartao', () => {
    const CARTAO = { metodo: 'cartao' as const };

    it('devolve a URL da pagina do gateway e grava a cobranca hospedada', async () => {
      const arranjo = await montar();

      const iniciado = await arranjo.servico.iniciar(
        pedido(arranjo, CARTAO),
        LEAD,
        AGORA,
      );

      expect(iniciado).toMatchObject({
        metodo: 'cartao',
        totalCentavos: 370_000,
      });
      if (iniciado.metodo !== 'cartao') throw new Error('esperava cartao');
      expect(iniciado.url).toContain(`/checkout?id=${iniciado.checkoutId}`);

      const gravado = checkout(arranjo, iniciado.checkoutId);
      expect(gravado.cobranca).toMatchObject({
        origem: 'hospedado',
        valorCentavos: 370_000,
        pix: null,
      });
      expect(gravado.apagarApos.toMillis()).toBe(
        AGORA + VALIDADE_CHECKOUT_HOSPEDADO_MS + FOLGA_ANTES_DE_APAGAR_MS,
      );
    });

    /**
     * O produto do gateway e o SNAPSHOT: o preco cobrado na pagina hospedada e o
     * congelado. Dois itens iguais sao um produto com quantidade dois.
     */
    it('cadastra no gateway um produto por snapshot, com quantidade', async () => {
      const arranjo = await montar();

      await arranjo.servico.iniciar(
        pedido(arranjo, {
          ...CARTAO,
          itens: [
            { produtoId: arranjo.parecer },
            { produtoId: arranjo.parecer },
            { produtoId: arranjo.contrato },
          ],
        }),
        LEAD,
        AGORA,
      );

      const produtosNoGateway = [...arranjo.gateway.produtos.values()];
      expect(produtosNoGateway.map((p) => p.precoCentavos).sort()).toEqual([
        120_000, 250_000,
      ]);
      expect([...arranjo.gateway.cobrancas.values()][0]?.valorCentavos).toBe(
        620_000,
      );
    });

    /**
     * Editar o catalogo cria OUTRO produto no gateway. O antigo continua cobrando
     * o preco antigo — a regra inviolavel 5 valendo tambem do lado de la.
     */
    it('editar o preco gera outro produto no gateway, sem tocar o anterior', async () => {
      const arranjo = await montar();
      await arranjo.servico.iniciar(
        pedido(arranjo, { ...CARTAO, itens: [{ produtoId: arranjo.parecer }] }),
        LEAD,
        AGORA,
      );

      await arranjo.produtos.editar(
        arranjo.parecer,
        { ...PARECER, precoCentavos: 300_000 },
        ADMIN,
      );
      await arranjo.servico.iniciar(
        pedido(arranjo, {
          ...CARTAO,
          itens: [{ produtoId: arranjo.parecer }],
          chaveDoCarrinho: '22222222-2222-4222-8222-222222222222',
        }),
        LEAD,
        AGORA,
      );

      expect(
        [...arranjo.gateway.produtos.values()]
          .map((p) => p.precoCentavos)
          .sort(),
      ).toEqual([250_000, 300_000]);
    });

    /**
     * O CATALOGO E ESCRITO POR GENTE, e o gateway recusa parte do que gente
     * escreve: na rodada do sandbox de 16/09/2026, o travessao voltou como HTTP
     * 400. O nome e a descricao saem limpos (`texto-do-gateway.ts`), e o teste vale
     * porque o gateway falso agora recusa igual — sem a limpeza, ele estoura aqui.
     */
    it('manda nome e descricao do produto sem caractere que o gateway recusa', async () => {
      const arranjo = await montar();
      const { id } = await arranjo.produtos.criar(
        {
          ...PARECER,
          nome: 'Parecer — risco “alto”',
          descricao: 'Diagnóstico das rotinas atuais… com ressalvas',
        },
        ADMIN,
      );

      await arranjo.servico.iniciar(
        pedido(arranjo, { ...CARTAO, itens: [{ produtoId: id }] }),
        LEAD,
        AGORA,
      );

      const noGateway = [...arranjo.gateway.produtos.values()].find(
        (produto) => produto.precoCentavos === 250_000,
      );
      expect(noGateway?.nome).toBe('Parecer - risco "alto"');
      expect(noGateway?.descricao).toBe(
        'Diagnóstico das rotinas atuais... com ressalvas',
      );
    });

    it('guarda o mapeamento e nao consulta o gateway de novo', async () => {
      const arranjo = await montar();
      const chamadas: string[] = [];
      const original = arranjo.gateway.garantirProduto.bind(arranjo.gateway);
      arranjo.gateway.garantirProduto = (produto) => {
        chamadas.push(produto.externalId);
        return original(produto);
      };
      const itens = [{ produtoId: arranjo.parecer }];

      await arranjo.servico.iniciar(
        pedido(arranjo, { ...CARTAO, itens }),
        LEAD,
        AGORA,
      );
      await arranjo.servico.iniciar(
        pedido(arranjo, {
          ...CARTAO,
          itens,
          chaveDoCarrinho: '33333333-3333-4333-8333-333333333333',
        }),
        LEAD,
        AGORA,
      );

      expect(chamadas).toHaveLength(1);
      expect(
        arranjo.banco.documentos.has(
          `${COLECAO_PRODUTOS_GATEWAY}/${chamadas[0]}`,
        ),
      ).toBe(true);
    });

    it('a retentativa devolve a mesma pagina', async () => {
      const arranjo = await montar();

      const primeiro = await arranjo.servico.iniciar(
        pedido(arranjo, CARTAO),
        LEAD,
        AGORA,
      );
      const segundo = await arranjo.servico.iniciar(
        pedido(arranjo, CARTAO),
        LEAD,
        AGORA + 60_000,
      );

      expect(segundo).toEqual(primeiro);
    });

    /** Trocar de PIX para cartao e outra cobranca; o QR sai da tela. */
    it('trocar de PIX para cartao substitui o checkout do PIX', async () => {
      const arranjo = await montar();
      const pix = await arranjo.servico.iniciar(pedido(arranjo), LEAD, AGORA);

      const cartao = await arranjo.servico.iniciar(
        pedido(arranjo, CARTAO),
        LEAD,
        AGORA + 60_000,
      );

      expect(cartao.checkoutId).not.toBe(pix.checkoutId);
      expect(checkout(arranjo, pix.checkoutId).estado).toBe('substituido');
    });

    it('valor divergente no checkout hospedado nao chega a tela', async () => {
      const arranjo = await montar();
      arranjo.gateway.forcarValor(1);

      await expect(
        arranjo.servico.iniciar(pedido(arranjo, CARTAO), LEAD, AGORA),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('falha ao cadastrar o produto marca o checkout e responde 503', async () => {
      const arranjo = await montar();
      arranjo.gateway.falharProximas(1);

      await expect(
        arranjo.servico.iniciar(pedido(arranjo, CARTAO), LEAD, AGORA),
      ).rejects.toThrow(ServiceUnavailableException);

      const [caminho] = checkouts(arranjo);
      expect(arranjo.banco.documentos.get(caminho)?.['estado']).toBe(
        'falhou_cobranca',
      );
    });
  });

  describe('idDoProdutoNoGateway', () => {
    it('muda com preco, nome ou descricao, e nao com o resto', () => {
      const base = idDoProdutoNoGateway('produto-1', PARECER);

      expect(base).toMatch(/^lex_produto-1_[0-9a-f]{16}$/);
      expect(idDoProdutoNoGateway('produto-1', { ...PARECER })).toBe(base);
      expect(
        idDoProdutoNoGateway('produto-1', { ...PARECER, precoCentavos: 1 }),
      ).not.toBe(base);
      expect(
        idDoProdutoNoGateway('produto-1', { ...PARECER, nome: 'Outro' }),
      ).not.toBe(base);
      expect(
        idDoProdutoNoGateway('produto-1', {
          ...PARECER,
          descricao: 'Outra descricao',
        }),
      ).not.toBe(base);
      expect(
        idDoProdutoNoGateway('produto-1', {
          ...PARECER,
          quantidadeReunioes: 9,
        }),
      ).toBe(base);
    });
  });
});
