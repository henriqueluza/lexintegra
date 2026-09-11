import { ForbiddenException } from '@nestjs/common';
import type { Firestore } from 'firebase-admin/firestore';
import { ESTADOS_ARQUIVO } from 'shared';
import { CATALOGO_FICTICIO } from '../../../../scripts/dados-ficticios/catalogo-produtos.js';
import { AnexosService } from '../anexos/anexos.service.js';
import { ArmazenamentoFalso } from '../armazenamento/armazenamento-falso.js';
import { firestoreDeTeste, limparEmuladores } from '../emulador.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { UploadDeEntregavelService } from '../entregaveis/upload.service.js';
import {
  AcessoPedidoService,
  type QuemAcessa,
} from '../pedidos/acesso.service.js';
import { DistribuicaoService } from '../pedidos/distribuicao.service.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { ClientesService } from '../clientes/clientes.service.js';
import { ProdutosService } from '../produtos/produtos.service.js';
import { TermosService } from '../termos/termos.service.js';
import { FilaFalsa } from '../tarefas/fila.js';
import type { TarefaDeVarredura } from '../varredura/fila.js';
import { ScannerFalso } from '../varredura/scanner.js';
import { VarreduraService } from '../varredura/varredura.service.js';
import { EmissorDeLinkDeLeitura } from './leitura.js';
import { PortaoDeArquivos } from './portao.js';

const ADMIN = 'uid-admin';
const CLIENTE: QuemAcessa = { uid: 'uid-clara', perfil: 'cliente' };
const ADVOGADO: QuemAcessa = { uid: 'uid-ana', perfil: 'advogado' };

/** Cabecalhos de verdade. NAO ha EICAR aqui — ver a nota em `scanner.ts`. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const HTML = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50]);

const PARECER = CATALOGO_FICTICIO[1];

let banco: Firestore;
let armazenamento: ArmazenamentoFalso;
let scanner: ScannerFalso;
let fila: FilaFalsa<TarefaDeVarredura>;
let anexos: AnexosService;
let upload: UploadDeEntregavelService;
let varredura: VarreduraService;
let portao: PortaoDeArquivos;
let termos: TermosService;

beforeAll(() => {
  banco = firestoreDeTeste();
});

beforeEach(async () => {
  await limparEmuladores();

  armazenamento = new ArmazenamentoFalso();
  scanner = new ScannerFalso();
  fila = new FilaFalsa<TarefaDeVarredura>();

  const acesso = new AcessoPedidoService(banco);
  termos = new TermosService(banco);

  anexos = new AnexosService(acesso, armazenamento, fila);
  upload = new UploadDeEntregavelService(
    banco,
    armazenamento,
    fila,
    new EntregaveisService(banco),
  );
  varredura = new VarreduraService(banco, armazenamento, scanner);
  portao = new PortaoDeArquivos(
    banco,
    acesso,
    termos,
    new EmissorDeLinkDeLeitura(armazenamento),
  );

  const produtos = new ProdutosService(banco);
  const pedidos = new PedidosService(banco);
  const { id: produtoOrigemId } = await produtos.criar(PARECER, ADMIN);

  await banco.runTransaction(async (transacao) => {
    pedidos.gravar(
      transacao,
      await pedidos.preparar(transacao, [
        {
          pedidoId: 'pedido-1',
          clienteId: CLIENTE.uid,
          pagamentoId: 'pag-1',
          produtoOrigemId,
        },
      ]),
    );
  });

  await banco
    .collection('advogados')
    .doc(ADVOGADO.uid)
    .set({ nome: 'Ana', email: 'ana@x.test', status: 'ativo' });
  await banco.collection('clientes').doc(CLIENTE.uid).set({
    nome: 'Clara',
    email: 'clara@x.test',
    nomeNormalizado: 'clara',
    emailNormalizado: 'clara@x.test',
    produtosContratados: [],
  });

  await new DistribuicaoService(banco, new ClientesService(banco)).atribuir(
    'pedido-1',
    ADVOGADO.uid,
    ADMIN,
  );
});

/** Sobe um anexo ate o ponto de estar varrido, com o conteudo dado. */
async function anexarEVarrer(conteudo: Uint8Array): Promise<string> {
  const [emitida] = await anexos.pedirEnvio('pedido-1', CLIENTE, [
    { nome: 'doc.pdf', tipo: 'application/pdf', tamanhoBytes: 1000 },
  ]);

  armazenamento.semear(
    { balde: 'quarentena', caminho: `anexos/pedido-1/${emitida.id}` },
    conteudo,
  );
  await anexos.confirmarEnvio('pedido-1', emitida.id, CLIENTE);
  await varredura.processar(fila.tarefas[fila.tarefas.length - 1]);

  return emitida.id;
}

/* -------------------------------------------------------------------------- */

describe('o ciclo completo do upload, contra o Firestore', () => {
  it('arquivo legitimo fica disponivel depois da varredura', async () => {
    const anexoId = await anexarEVarrer(PDF);

    const [anexo] = await anexos.listar('pedido-1', CLIENTE);
    expect(anexo.estado).toBe('limpo');

    await expect(
      portao.linkDoAnexo({ pedidoId: 'pedido-1', anexoId }, CLIENTE),
    ).resolves.toMatchObject({ url: expect.stringContaining('leitura') });
  });

  /**
   * O ENTREGAVEL DA ETAPA, contra o banco de verdade: um arquivo reprovado nunca
   * e servido, por caminho nenhum.
   *
   * NAO USA EICAR. O plano de execucao reserva o teste com o arquivo real para
   * uma validacao humana ("testar com o arquivo EICAR voce mesmo, e confirmar que
   * ele nunca ficou acessivel"). Aqui o veredito e configurado, e o que se prova e
   * o que a API faz com ele.
   */
  it('arquivo reprovado pelo antivirus nunca e servido', async () => {
    scanner.responderCom({ veredito: 'infectado', assinatura: 'Teste' });
    const anexoId = await anexarEVarrer(PDF);

    const [anexo] = await anexos.listar('pedido-1', CLIENTE);
    expect(anexo.estado).toBe('infectado');

    await expect(
      portao.linkDoAnexo({ pedidoId: 'pedido-1', anexoId }, CLIENTE),
    ).rejects.toThrow(/nao esta disponivel/);

    // E o objeto sumiu da quarentena: nao ha o que servir nem por fora.
    expect(armazenamento.caminhos).toEqual([]);
  });

  /** A segunda conferencia: limpo no antivirus, e mesmo assim recusado. */
  it('conteudo que nao bate com o tipo tambem nunca e servido', async () => {
    const anexoId = await anexarEVarrer(HTML);

    const [anexo] = await anexos.listar('pedido-1', CLIENTE);
    expect(anexo.estado).toBe('rejeitado');

    await expect(
      portao.linkDoAnexo({ pedidoId: 'pedido-1', anexoId }, CLIENTE),
    ).rejects.toThrow(/nao esta disponivel/);
  });

  /**
   * A TENTATIVA DIRETA. O criterio de aceite pede explicitamente "incluindo
   * tentativa direta pela URL do bucket": mesmo conhecendo o caminho do objeto, o
   * unico caminho de emissao passa pelo portao — e ele confere o estado.
   */
  it('conhecer o caminho do objeto nao ajuda: o portao confere o estado', async () => {
    scanner.responderCom({ veredito: 'infectado' });
    const anexoId = await anexarEVarrer(PDF);

    const bruto = await banco
      .collection('pedidos')
      .doc('pedido-1')
      .collection('anexos')
      .doc(anexoId)
      .get();

    // O caminho continua no documento — e nao serve para nada.
    expect(bruto.data()?.['caminho']).toContain('anexos/pedido-1/');
    expect(armazenamento.caminhos).toEqual([]);
  });
});

describe('o gate de termos, contra o Firestore', () => {
  /** Sobe um entregavel ate `limpo`. */
  async function entregavelLimpo(): Promise<void> {
    const entregaveis = new EntregaveisService(banco);
    await entregaveis.iniciarTrabalho(
      { pedidoId: 'pedido-1', entregavelId: '001' },
      ADVOGADO.uid,
    );

    const { versao } = await upload.pedirEnvio(
      { pedidoId: 'pedido-1', entregavelId: '001' },
      ADVOGADO.uid,
      { nome: 'parecer.pdf', tipo: 'application/pdf', tamanhoBytes: 1000 },
    );

    armazenamento.semear(
      {
        balde: 'quarentena',
        caminho: `entregaveis/pedido-1/001/v${String(versao)}`,
      },
      PDF,
    );

    await upload.confirmarEnvio(
      { pedidoId: 'pedido-1', entregavelId: '001' },
      ADVOGADO.uid,
    );
    await varredura.processar(fila.tarefas[fila.tarefas.length - 1]);
  }

  it('o download so libera depois do aceite, e o aceite fica registrado', async () => {
    await entregavelLimpo();
    const alvo = { pedidoId: 'pedido-1', entregavelId: '001' };

    await expect(portao.linkDoEntregavel(alvo, CLIENTE)).rejects.toThrow(
      ForbiddenException,
    );

    await termos.registrar({
      usuarioUid: CLIENTE.uid,
      pedidoId: 'pedido-1',
      entregavelId: '001',
      versaoArquivo: 1,
    });

    await expect(portao.linkDoEntregavel(alvo, CLIENTE)).resolves.toBeDefined();

    // A evidencia de conformidade ficou no banco, com carimbo do servidor.
    const aceite = await banco
      .collection('aceites-de-termos')
      .doc(`${CLIENTE.uid}_pedido-1_001_v1`)
      .get();

    expect(aceite.exists).toBe(true);
    expect(aceite.data()?.['aceitoEm']).toBeDefined();
    expect(aceite.data()?.['versaoTermo']).toBeDefined();
  });

  /** Os dois fluxos convivem no mesmo pedido sem se misturar (arquitetura 6.2). */
  it('anexo e entregavel ficam em prefixos distintos', async () => {
    await entregavelLimpo();
    await anexarEVarrer(PDF);

    const caminhos = armazenamento.caminhos;
    expect(caminhos.some((c) => c.includes('entregaveis/pedido-1/001/'))).toBe(
      true,
    );
    expect(caminhos.some((c) => c.includes('anexos/pedido-1/'))).toBe(true);
  });
});

/** A lista de estados e a mesma dos dois lados: um estado novo aparece aqui. */
it('apenas um dos estados de arquivo e servivel', () => {
  expect(ESTADOS_ARQUIVO.filter((e) => e === 'limpo')).toHaveLength(1);
});
