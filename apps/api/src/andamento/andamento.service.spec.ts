import { NotFoundException } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ClientesService } from '../clientes/clientes.service.js';
import { FirestoreFalso, type Dados } from '../firestore-falso.js';
import { ConsultaReunioesService } from '../reunioes/consulta.service.js';
import { AndamentoService, TETO_DE_PEDIDOS } from './andamento.service.js';

const ADMIN = 'uid-admin';
const CLARA = 'uid-clara';
const ANA = 'uid-ana';
const BIA = 'uid-bia';

/** Instantes fixos: o dublê nao imita carimbo de servidor, entao sao semeados. */
function em(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

const CRIADO = '2026-11-01T10:00:00.000Z';
const INICIADO = '2026-11-03T10:00:00.000Z';
const ENVIADO = '2026-11-05T10:00:00.000Z';

function montar(): { banco: FirestoreFalso; andamento: AndamentoService } {
  const banco = new FirestoreFalso();
  const db = banco as unknown as Firestore;
  const clientes = new ClientesService(db);

  banco.documentos.set(`clientes/${CLARA}`, { nome: 'Clara Nunes' });
  banco.documentos.set(`advogados/${ANA}`, {
    nome: 'Ana Souza',
    email: 'ana@escritorio.test',
    status: 'ativo',
  });
  banco.documentos.set(`advogados/${BIA}`, {
    nome: 'Bia Lima',
    email: 'bia@escritorio.test',
    status: 'suspenso',
  });

  return {
    banco,
    andamento: new AndamentoService(
      db,
      clientes,
      new ConsultaReunioesService(db, clientes),
    ),
  };
}

function pedido(banco: FirestoreFalso, id: string, parcial: Dados = {}): void {
  banco.documentos.set(`pedidos/${id}`, {
    clienteId: CLARA,
    pagamentoId: 'cob-1',
    produtoOrigemId: 'produto-1',
    snapshot: { nome: 'Parecer juridico' },
    criadoEm: em(CRIADO),
    advogadoId: ANA,
    distribuido: true,
    atribuidoEm: em('2026-11-02T10:00:00.000Z'),
    situacao: 'ativo',
    ...parcial,
  });
}

function entregavel(
  banco: FirestoreFalso,
  pedidoId: string,
  id: string,
  parcial: Dados = {},
): void {
  banco.documentos.set(`pedidos/${pedidoId}/entregaveis/${id}`, {
    nome: 'Parecer',
    ordem: Number(id),
    estado: 'em_elaboracao',
    revisoesUsadas: 0,
    arquivoAtual: null,
    transicoes: 2,
    estadoDesde: em(INICIADO),
    atualizadoEm: em(ENVIADO),
    ...parcial,
  });
}

function transicao(
  banco: FirestoreFalso,
  caminho: string,
  id: string,
  dados: Dados,
): void {
  banco.documentos.set(`${caminho}/transicoes/${id}`, {
    por: 'sistema',
    atorUid: ANA,
    ...dados,
  });
}

function auditoria(banco: FirestoreFalso): Dados[] {
  return [...banco.documentos.entries()]
    .filter(([caminho]) => caminho.startsWith('auditoria/'))
    .map(([, dados]) => dados);
}

describe('AndamentoService', () => {
  describe('lista', () => {
    it('devolve o pedido com o que a tela mostra, e nada alem', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      entregavel(banco, 'p1', '001');

      const { pedidos } = await andamento.listar(null, ADMIN);

      expect(pedidos).toEqual([
        {
          id: 'p1',
          produto: 'Parecer juridico',
          cliente: 'Clara Nunes',
          advogadoId: ANA,
          atribuidoEm: '2026-11-02T10:00:00.000Z',
          situacao: 'ativo',
          contestacaoAberta: false,
          criadoEm: CRIADO,
          entregaveis: [
            {
              id: '001',
              nome: 'Parecer',
              ordem: 1,
              estado: 'em_elaboracao',
              estadoDesde: INICIADO,
              temArquivo: false,
              arquivoEnviadoEm: null,
              revisoesUsadas: 0,
            },
          ],
        },
      ]);
    });

    it('o mais recente primeiro', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'antigo', { criadoEm: em('2026-10-01T10:00:00.000Z') });
      pedido(banco, 'novo', { criadoEm: em('2026-11-10T10:00:00.000Z') });

      const { pedidos } = await andamento.listar(null, ADMIN);

      expect(pedidos.map((p) => p.id)).toEqual(['novo', 'antigo']);
    });

    it('os entregaveis vem na ordem do snapshot', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      entregavel(banco, 'p1', '002', { nome: 'Minuta' });
      entregavel(banco, 'p1', '001', { nome: 'Parecer' });

      const { pedidos } = await andamento.listar(null, ADMIN);

      expect(pedidos[0].entregaveis.map((e) => e.nome)).toEqual([
        'Parecer',
        'Minuta',
      ]);
    });

    /**
     * O campo que o upload e a varredura reescrevem NAO e a resposta: aqui
     * `atualizadoEm` e dois dias mais novo que a entrada no estado.
     */
    it('"desde quando" e a entrada no estado, e nao a ultima atualizacao', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      entregavel(banco, 'p1', '001');

      const { pedidos } = await andamento.listar(null, ADMIN);

      expect(pedidos[0].entregaveis[0].estadoDesde).toBe(INICIADO);
      expect(pedidos[0].entregaveis[0].estadoDesde).not.toBe(ENVIADO);
    });

    it('com o campo presente, a trilha nao e lida', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      entregavel(banco, 'p1', '001');

      await andamento.listar(null, ADMIN);

      expect(
        banco.ordemDeEscrita.filter((linha) => linha.includes('/transicoes')),
      ).toEqual([]);
    });

    describe('entregavel anterior ao campo', () => {
      function legado(banco: FirestoreFalso): void {
        pedido(banco, 'p1');
        entregavel(banco, 'p1', '001', { estadoDesde: undefined });
        /* O campo AUSENTE, e nao `undefined` gravado. */
        const caminho = 'pedidos/p1/entregaveis/001';
        const { estadoDesde: _ausente, ...resto } = banco.documentos.get(
          caminho,
        ) as Dados;
        banco.documentos.set(caminho, resto);
      }

      it('le o instante da ULTIMA transicao da trilha', async () => {
        const { banco, andamento } = montar();
        legado(banco);
        const caminho = 'pedidos/p1/entregaveis/001';
        transicao(banco, caminho, '0001', {
          de: null,
          para: 'solicitado',
          evento: 'criar-pedido',
          em: em(CRIADO),
        });
        transicao(banco, caminho, '0002', {
          de: 'solicitado',
          para: 'em_elaboracao',
          evento: 'iniciar-trabalho',
          em: em(INICIADO),
        });

        const { pedidos } = await andamento.listar(null, ADMIN);

        expect(pedidos[0].entregaveis[0].estadoDesde).toBe(INICIADO);
      });

      it('sem a transicao na trilha, o instante e desconhecido', async () => {
        const { banco, andamento } = montar();
        legado(banco);

        const { pedidos } = await andamento.listar(null, ADMIN);

        expect(pedidos[0].entregaveis[0].estadoDesde).toBeNull();
      });

      it('nada e reescrito: o documento continua sem o campo', async () => {
        const { banco, andamento } = montar();
        legado(banco);

        await andamento.listar(null, ADMIN);

        expect(
          banco.documentos.get('pedidos/p1/entregaveis/001'),
        ).not.toHaveProperty('estadoDesde');
      });
    });

    it('diz que ha arquivo e quando chegou, sem dizer o nome dele', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      entregavel(banco, 'p1', '001', {
        arquivoAtual: {
          nome: 'parecer-da-clara.pdf',
          tipo: 'application/pdf',
          tamanhoBytes: 1024,
          versao: 1,
          estado: 'limpo',
          caminho: 'entregaveis/p1/001/v1',
          enviadoPor: ANA,
          enviadoEm: em(ENVIADO),
        },
      });

      const resposta = await andamento.listar(null, ADMIN);

      expect(resposta.pedidos[0].entregaveis[0]).toMatchObject({
        temArquivo: true,
        arquivoEnviadoEm: ENVIADO,
      });
      const texto = JSON.stringify(resposta);
      expect(texto).not.toContain('parecer-da-clara.pdf');
      expect(texto).not.toContain('entregaveis/p1/001/v1');
    });

    it('pedido antigo, sem os campos novos, e ativo e sem advogado', async () => {
      const { banco, andamento } = montar();
      banco.documentos.set('pedidos/velho', {
        clienteId: CLARA,
        pagamentoId: 'cob-0',
        produtoOrigemId: 'produto-1',
        snapshot: { nome: 'Contrato' },
        criadoEm: em(CRIADO),
      });

      const { pedidos } = await andamento.listar(null, ADMIN);

      expect(pedidos[0]).toMatchObject({
        advogadoId: null,
        atribuidoEm: null,
        situacao: 'ativo',
        contestacaoAberta: false,
      });
    });

    it('leva a situacao e a contestacao do pedido', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1', {
        situacao: 'cancelado',
        contestacao: { cobrancaId: 'cob-1', abertaEm: em(ENVIADO) },
      });

      const { pedidos } = await andamento.listar(null, ADMIN);

      expect(pedidos[0]).toMatchObject({
        situacao: 'cancelado',
        contestacaoAberta: true,
      });
    });

    it('filtra pelo advogado', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'da-ana');
      pedido(banco, 'da-bia', { advogadoId: BIA });
      pedido(banco, 'na-fila', { advogadoId: null, distribuido: false });

      expect(
        (await andamento.listar(BIA, ADMIN)).pedidos.map((p) => p.id),
      ).toEqual(['da-bia']);
      expect((await andamento.listar(null, ADMIN)).pedidos).toHaveLength(3);
    });

    it('advogado que nao existe devolve lista vazia', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');

      expect((await andamento.listar('uid-ninguem', ADMIN)).pedidos).toEqual(
        [],
      );
    });

    it('lista os advogados com nome e suspensao, sem e-mail', async () => {
      const { andamento } = montar();

      const resposta = await andamento.listar(null, ADMIN);

      expect(resposta.advogados).toEqual([
        { uid: ANA, nome: 'Ana Souza', suspenso: false },
        { uid: BIA, nome: 'Bia Lima', suspenso: true },
      ]);
      expect(JSON.stringify(resposta)).not.toContain('@escritorio.test');
    });

    it('conta as reunioes sem sala', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      const reuniao = {
        pedidoId: 'p1',
        clienteId: CLARA,
        advogadoId: ANA,
        inicio: '2026-12-01T13:00:00.000Z',
        fim: '2026-12-01T14:00:00.000Z',
        sequence: 0,
      };
      banco.documentos.set('pedidos/p1/reunioes/r001', {
        ...reuniao,
        estado: 'reservada_sem_link',
      });
      banco.documentos.set('pedidos/p1/reunioes/r002', {
        ...reuniao,
        estado: 'confirmada',
      });

      expect((await andamento.listar(null, ADMIN)).reunioesSemSala).toBe(1);
    });

    it('carimba a resposta com o relogio do servidor', async () => {
      const { andamento } = montar();
      const antes = Date.now();

      const { geradoEm } = await andamento.listar(null, ADMIN);

      expect(Date.parse(geradoEm)).toBeGreaterThanOrEqual(antes);
      expect(Date.parse(geradoEm)).toBeLessThanOrEqual(Date.now());
    });

    describe('teto', () => {
      function semear(banco: FirestoreFalso, quantidade: number): void {
        for (let i = 0; i < quantidade; i += 1) {
          pedido(banco, `p${String(i).padStart(4, '0')}`, {
            criadoEm: Timestamp.fromMillis(Date.parse(CRIADO) + i * 1000),
          });
        }
      }

      it('exatamente no teto, nada foi cortado', async () => {
        const { banco, andamento } = montar();
        semear(banco, TETO_DE_PEDIDOS);

        const resposta = await andamento.listar(null, ADMIN);

        expect(resposta.pedidos).toHaveLength(TETO_DE_PEDIDOS);
        expect(resposta.cortado).toBe(false);
      });

      it('um a mais: devolve o teto, os mais recentes, e avisa', async () => {
        const { banco, andamento } = montar();
        semear(banco, TETO_DE_PEDIDOS + 1);

        const resposta = await andamento.listar(null, ADMIN);

        expect(resposta.pedidos).toHaveLength(TETO_DE_PEDIDOS);
        expect(resposta.cortado).toBe(true);
        expect(resposta.pedidos.map((p) => p.id)).not.toContain('p0000');
      });

      it('o teto e 200', () => {
        expect(TETO_DE_PEDIDOS).toBe(200);
      });
    });
  });

  describe('detalhe', () => {
    function semearDetalhe(banco: FirestoreFalso): void {
      pedido(banco, 'p1');
      entregavel(banco, 'p1', '001');
      const caminho = 'pedidos/p1/entregaveis/001';
      /* Fora de ordem de proposito: quem ordena e o servico. */
      transicao(banco, caminho, '0002', {
        de: 'solicitado',
        para: 'em_elaboracao',
        evento: 'iniciar-trabalho',
        em: em(INICIADO),
      });
      transicao(banco, caminho, '0001', {
        de: null,
        para: 'solicitado',
        evento: 'criar-pedido',
        atorUid: CLARA,
        em: em(CRIADO),
      });
    }

    it('devolve a trilha de cada entregavel, em ordem, sem quem disparou', async () => {
      const { banco, andamento } = montar();
      semearDetalhe(banco);

      const detalhe = await andamento.detalhar('p1', ADMIN);

      expect(detalhe.entregaveis[0].trilha).toEqual([
        { de: null, para: 'solicitado', evento: 'criar-pedido', em: CRIADO },
        {
          de: 'solicitado',
          para: 'em_elaboracao',
          evento: 'iniciar-trabalho',
          em: INICIADO,
        },
      ]);
      expect(JSON.stringify(detalhe)).not.toContain(CLARA);
    });

    it('leva o pedido como a lista leva', async () => {
      const { banco, andamento } = montar();
      semearDetalhe(banco);

      expect(await andamento.detalhar('p1', ADMIN)).toMatchObject({
        id: 'p1',
        produto: 'Parecer juridico',
        cliente: 'Clara Nunes',
        advogadoId: ANA,
        situacao: 'ativo',
      });
    });

    it('entregavel anterior ao campo: o instante sai da trilha ja lida', async () => {
      const { banco, andamento } = montar();
      semearDetalhe(banco);
      const caminho = 'pedidos/p1/entregaveis/001';
      const { estadoDesde: _ausente, ...resto } = banco.documentos.get(
        caminho,
      ) as Dados;
      banco.documentos.set(caminho, resto);

      const detalhe = await andamento.detalhar('p1', ADMIN);

      expect(detalhe.entregaveis[0].estadoDesde).toBe(INICIADO);
    });

    it('entregavel anterior ao campo e sem trilha: instante desconhecido', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      banco.documentos.set('pedidos/p1/entregaveis/001', {
        nome: 'Parecer',
        ordem: 1,
        estado: 'solicitado',
        revisoesUsadas: 0,
        arquivoAtual: null,
        transicoes: 1,
      });

      const detalhe = await andamento.detalhar('p1', ADMIN);

      expect(detalhe.entregaveis[0]).toMatchObject({
        estadoDesde: null,
        trilha: [],
      });
    });

    it('devolve as reunioes em ordem de emissao, SEM o link da sala', async () => {
      const { banco, andamento } = montar();
      semearDetalhe(banco);
      const reuniao = {
        pedidoId: 'p1',
        clienteId: CLARA,
        advogadoId: ANA,
        fim: '2026-12-01T14:00:00.000Z',
        sequence: 0,
        link: 'https://teams.example/sala-secreta',
      };
      banco.documentos.set('pedidos/p1/reunioes/r002', {
        ...reuniao,
        inicio: '2026-12-01T13:00:00.000Z',
        estado: 'confirmada',
      });
      banco.documentos.set('pedidos/p1/reunioes/r001', {
        ...reuniao,
        inicio: '2026-12-08T13:00:00.000Z',
        estado: 'cancelada',
      });

      const detalhe = await andamento.detalhar('p1', ADMIN);

      expect(detalhe.reunioes).toEqual([
        {
          id: 'r001',
          inicio: '2026-12-08T13:00:00.000Z',
          fim: '2026-12-01T14:00:00.000Z',
          estado: 'cancelada',
        },
        {
          id: 'r002',
          inicio: '2026-12-01T13:00:00.000Z',
          fim: '2026-12-01T14:00:00.000Z',
          estado: 'confirmada',
        },
      ]);
      expect(JSON.stringify(detalhe)).not.toContain('sala-secreta');
    });

    it('pedido inexistente e 404, e nao deixa linha de auditoria', async () => {
      const { banco, andamento } = montar();

      await expect(andamento.detalhar('nao-existe', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      expect(auditoria(banco)).toEqual([]);
    });
  });

  describe('auditoria da leitura', () => {
    it('a lista grava UMA linha por carga, com o filtro e a quantidade', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      pedido(banco, 'p2');

      await andamento.listar(null, ADMIN);

      expect(auditoria(banco)).toEqual([
        expect.objectContaining({
          acao: 'andamento.consultado',
          atorUid: ADMIN,
          alvo: 'todos',
          antes: null,
          depois: { advogadoId: null, pedidos: 2 },
        }),
      ]);
    });

    it('com filtro, o alvo e o advogado consultado', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');

      await andamento.listar(ANA, ADMIN);

      expect(auditoria(banco)).toEqual([
        expect.objectContaining({
          acao: 'andamento.consultado',
          alvo: ANA,
          depois: { advogadoId: ANA, pedidos: 1 },
        }),
      ]);
    });

    /** E o que faz a consulta aparecer na exportacao LGPD do titular. */
    it('o detalhe grava uma linha com o CLIENTE do pedido como alvo', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');

      await andamento.detalhar('p1', ADMIN);

      expect(auditoria(banco)).toEqual([
        expect.objectContaining({
          acao: 'pedido.consultado',
          atorUid: ADMIN,
          alvo: CLARA,
          antes: null,
          depois: { pedidoId: 'p1' },
        }),
      ]);
    });

    it.each([
      ['a lista', (a: AndamentoService) => a.listar(null, ADMIN)],
      ['o detalhe', (a: AndamentoService) => a.detalhar('p1', ADMIN)],
    ])('se a gravacao falha, %s nao devolve nada', async (_nome, consultar) => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      banco.runTransaction = () =>
        Promise.reject(new Error('auditoria indisponivel'));

      await expect(consultar(andamento)).rejects.toThrow(
        'auditoria indisponivel',
      );
    });

    it('a unica escrita das duas rotas e a linha de auditoria', async () => {
      const { banco, andamento } = montar();
      pedido(banco, 'p1');
      entregavel(banco, 'p1', '001');

      await andamento.listar(null, ADMIN);
      await andamento.detalhar('p1', ADMIN);

      expect(banco.escritas).toHaveLength(2);
      for (const escrita of banco.escritas) {
        expect(escrita).toMatch(/^create auditoria\//);
      }
    });
  });
});
