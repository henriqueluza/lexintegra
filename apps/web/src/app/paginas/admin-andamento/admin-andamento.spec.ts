import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  Andamento,
  DetalheDoAndamento,
  PedidoEmAndamento,
} from 'shared/andamento';
import { ApiAndamentoService } from '../../autenticacao/api-andamento.service';
import { AdminAndamento } from './admin-andamento';

const GERADO_EM = '2026-11-20T12:00:00.000Z';

function pedido(parcial: Partial<PedidoEmAndamento>): PedidoEmAndamento {
  return {
    id: 'cob_aaa111_001',
    produto: 'Parecer Jurídico',
    cliente: 'Clara Nunes',
    advogadoId: 'uid-ana',
    atribuidoEm: '2026-11-01T12:00:00.000Z',
    situacao: 'ativo',
    contestacaoAberta: false,
    criadoEm: '2026-11-01T12:00:00.000Z',
    entregaveis: [
      {
        id: 'e1',
        nome: 'Parecer',
        ordem: 1,
        estado: 'em_elaboracao',
        estadoDesde: '2026-11-10T12:00:00.000Z',
        temArquivo: false,
        arquivoEnviadoEm: null,
        revisoesUsadas: 0,
      },
    ],
    ...parcial,
  };
}

/** 10 dias com a Ana, 4 dias com o Carlos (suspenso), um sem advogado, um entregue. */
const RESPOSTA: Andamento = {
  geradoEm: GERADO_EM,
  reunioesSemSala: 2,
  cortado: false,
  advogados: [
    { uid: 'uid-ana', nome: 'Ana Souza', suspenso: false },
    { uid: 'uid-carlos', nome: 'Carlos Lima', suspenso: true },
  ],
  pedidos: [
    pedido({}),
    pedido({
      id: 'cob_bbb222_001',
      cliente: 'Bruno Alves',
      advogadoId: 'uid-carlos',
      entregaveis: [
        {
          ...pedido({}).entregaveis[0]!,
          id: 'e2',
          estadoDesde: '2026-11-16T12:00:00.000Z',
        },
      ],
    }),
    pedido({
      id: 'cob_ccc333_001',
      cliente: 'Álvaro Dias',
      produto: 'Contrato',
      advogadoId: null,
      atribuidoEm: null,
      entregaveis: [
        {
          ...pedido({}).entregaveis[0]!,
          id: 'e3',
          estado: 'solicitado',
          estadoDesde: '2026-11-19T12:00:00.000Z',
        },
      ],
    }),
    pedido({
      id: 'cob_ddd444_001',
      cliente: 'Dora Reis',
      entregaveis: [
        {
          ...pedido({}).entregaveis[0]!,
          id: 'e4',
          estado: 'entregue',
        },
      ],
    }),
  ],
};

const DETALHE: DetalheDoAndamento = {
  ...pedido({}),
  entregaveis: [
    {
      ...pedido({}).entregaveis[0]!,
      trilha: [
        {
          de: null,
          para: 'solicitado',
          evento: 'criar-pedido',
          em: '2026-11-01T12:00:00.000Z',
        },
        {
          de: 'solicitado',
          para: 'em_elaboracao',
          evento: 'iniciar-trabalho',
          em: '2026-11-10T12:00:00.000Z',
        },
      ],
    },
  ],
  reunioes: [
    {
      id: 'r1',
      inicio: '2026-11-25T14:00:00.000Z',
      fim: '2026-11-25T15:00:00.000Z',
      estado: 'confirmada',
    },
  ],
};

type Chamadas = { listar: (string | undefined)[]; detalhar: string[] };

function montar(
  opcoes: { resposta?: Andamento; erro?: boolean; erroDetalhe?: boolean } = {},
): { fixture: ComponentFixture<AdminAndamento>; chamadas: Chamadas } {
  const chamadas: Chamadas = { listar: [], detalhar: [] };
  TestBed.configureTestingModule({
    imports: [AdminAndamento],
    providers: [
      provideRouter([]),
      {
        provide: ApiAndamentoService,
        useValue: {
          listar: (uid?: string) => {
            chamadas.listar.push(uid);
            return opcoes.erro === true
              ? Promise.reject(new Error('rede'))
              : Promise.resolve(opcoes.resposta ?? RESPOSTA);
          },
          detalhar: (id: string) => {
            chamadas.detalhar.push(id);
            return opcoes.erroDetalhe === true
              ? Promise.reject(new Error('rede'))
              : Promise.resolve(DETALHE);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AdminAndamento);
  fixture.detectChanges();
  return { fixture, chamadas };
}

type Controles = Record<string, { setValue: (v: string) => void }>;

function definir(
  fixture: ComponentFixture<AdminAndamento>,
  controle: string,
  valor: string,
): void {
  (fixture.componentInstance as unknown as Controles)[controle]!.setValue(
    valor,
  );
}

async function assentar(
  fixture: ComponentFixture<AdminAndamento>,
): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function texto(fixture: ComponentFixture<AdminAndamento>): string {
  return fixture.nativeElement.textContent as string;
}

function linhas(fixture: ComponentFixture<AdminAndamento>): HTMLElement[] {
  return [...fixture.nativeElement.querySelectorAll('tbody tr')];
}

describe('AdminAndamento', () => {
  it('carrega ao abrir, uma vez, sem filtro de advogado', async () => {
    const { fixture, chamadas } = montar();
    await assentar(fixture);

    expect(chamadas.listar).toEqual([undefined]);
    expect(chamadas.detalhar).toEqual([]);
  });

  it('abre em andamento: tres linhas, a entregue some, parado primeiro', async () => {
    const { fixture } = montar();
    await assentar(fixture);

    const rows = linhas(fixture);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Clara Nunes');
    expect(rows[0]?.textContent).toContain('Parado');
    expect(rows[0]?.textContent).toContain('10 dias');
    expect(rows[0]?.textContent).toContain('Com o advogado');
    expect(rows[0]?.textContent).toContain('Ana Souza');
    expect(texto(fixture)).toContain('3 entregáveis em 3 pedidos');
  });

  it('mostra o suspenso e o "Sem advogado" em texto', async () => {
    const { fixture } = montar();
    await assentar(fixture);

    expect(texto(fixture)).toContain('Suspenso');
    expect(texto(fixture)).toContain('Sem advogado');
    expect(texto(fixture)).toContain('Carlos Lima (suspenso)');
  });

  it('filtra por cliente sem acento e sem nova requisicao', async () => {
    const { fixture, chamadas } = montar();
    await assentar(fixture);

    definir(fixture, 'cliente', 'alvaro');
    await assentar(fixture);

    expect(linhas(fixture)).toHaveLength(1);
    expect(linhas(fixture)[0]?.textContent).toContain('Álvaro Dias');
    expect(chamadas.listar).toHaveLength(1);
  });

  it('filtra por situacao, estado e produto sem nova requisicao', async () => {
    const { fixture, chamadas } = montar();
    await assentar(fixture);

    definir(fixture, 'situacao', 'todos');
    await assentar(fixture);
    expect(linhas(fixture)).toHaveLength(4);

    definir(fixture, 'estado', 'entregue');
    await assentar(fixture);
    expect(linhas(fixture)).toHaveLength(1);

    definir(fixture, 'estado', '');
    definir(fixture, 'produto', 'Contrato');
    await assentar(fixture);
    expect(linhas(fixture)).toHaveLength(1);
    expect(chamadas.listar).toHaveLength(1);
  });

  it('trocar o advogado refaz a consulta com o uid', async () => {
    const { fixture, chamadas } = montar();
    await assentar(fixture);

    definir(fixture, 'advogado', 'uid-ana');
    await assentar(fixture);

    expect(chamadas.listar).toEqual([undefined, 'uid-ana']);
  });

  it('o limite de dias muda o que e parado, sem requisicao', async () => {
    const { fixture, chamadas } = montar();
    await assentar(fixture);
    const parados = (): number =>
      fixture.nativeElement.querySelectorAll('.andamento__parado').length;
    expect(parados()).toBe(1);

    definir(fixture, 'limite', '3');
    await assentar(fixture);
    expect(parados()).toBe(2);
    expect(texto(fixture)).toContain('Parados há 3 dias ou mais');

    definir(fixture, 'limite', '15');
    await assentar(fixture);
    expect(parados()).toBe(0);
    expect(chamadas.listar).toHaveLength(1);
  });

  it('conta os dias pelo relogio do servidor, nao pelo do navegador', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2031-01-01T00:00:00Z'));
    const { fixture } = montar();
    await assentar(fixture);

    expect(linhas(fixture)[0]?.textContent).toContain('10 dias');
    jest.restoreAllMocks();
  });

  it('avisa quando a consulta foi cortada', async () => {
    const { fixture } = montar({ resposta: { ...RESPOSTA, cortado: true } });
    await assentar(fixture);

    expect(texto(fixture)).toContain(
      'Mostrando os 200 pedidos mais recentes. Filtre por advogado para ver os mais antigos.',
    );
  });

  it('sem corte, sem aviso', async () => {
    const { fixture } = montar();
    await assentar(fixture);

    expect(texto(fixture)).not.toContain('Mostrando os 200');
  });

  it('sem pedido nenhum, diz isso; com filtro sem resultado, diz outra coisa', async () => {
    const vazio = montar({ resposta: { ...RESPOSTA, pedidos: [] } });
    await assentar(vazio.fixture);
    expect(texto(vazio.fixture)).toContain(
      'Nenhum pedido com entregável ainda.',
    );

    TestBed.resetTestingModule();
    const { fixture } = montar();
    await assentar(fixture);
    definir(fixture, 'cliente', 'ninguem com esse nome');
    await assentar(fixture);
    expect(texto(fixture)).toContain('Nenhum resultado com estes filtros.');
  });

  it('mostra o erro quando a consulta falha', async () => {
    const { fixture } = montar({ erro: true });
    await assentar(fixture);

    expect(
      fixture.nativeElement.querySelector('app-mensagem-erro'),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  describe('trilha', () => {
    function botao(
      fixture: ComponentFixture<AdminAndamento>,
      pedidoId: string,
    ): HTMLButtonElement {
      return fixture.nativeElement.querySelector(
        `[data-trilha-do-pedido="${pedidoId}"]`,
      );
    }

    it('abre com UMA requisicao e liga o botao ao painel que existe', async () => {
      const { fixture, chamadas } = montar();
      await assentar(fixture);
      const alvo = botao(fixture, 'cob_aaa111_001');

      expect(alvo.getAttribute('aria-expanded')).toBe('false');
      const painel = fixture.nativeElement.querySelector(
        `[id="${alvo.getAttribute('aria-controls')}"]`,
      ) as HTMLElement;
      expect(painel).toBeTruthy();
      expect(painel.hidden).toBe(true);

      alvo.click();
      await assentar(fixture);

      expect(chamadas.detalhar).toEqual(['cob_aaa111_001']);
      expect(alvo.getAttribute('aria-expanded')).toBe('true');
      expect(painel.hidden).toBe(false);
      expect(painel.textContent).toContain('Advogado iniciou');
      expect(painel.textContent).toContain('Pedido criado');
      expect(painel.textContent).toContain('Confirmada');
    });

    it('ocultar e reabrir nao repete a requisicao', async () => {
      const { fixture, chamadas } = montar();
      await assentar(fixture);
      const alvo = botao(fixture, 'cob_aaa111_001');

      alvo.click();
      await assentar(fixture);
      alvo.click();
      await assentar(fixture);
      expect(alvo.getAttribute('aria-expanded')).toBe('false');

      alvo.click();
      await assentar(fixture);
      expect(chamadas.detalhar).toHaveLength(1);
    });

    it('mostra erro no painel e tenta de novo na proxima abertura', async () => {
      const { fixture, chamadas } = montar({ erroDetalhe: true });
      await assentar(fixture);
      const alvo = botao(fixture, 'cob_aaa111_001');

      alvo.click();
      await assentar(fixture);
      expect(texto(fixture)).toContain('Não foi possível carregar a trilha');

      alvo.click();
      await assentar(fixture);
      alvo.click();
      await assentar(fixture);
      expect(chamadas.detalhar).toHaveLength(2);
    });

    it('nao oferece nenhuma acao sobre o entregavel', async () => {
      const { fixture } = montar();
      await assentar(fixture);

      const rotulos = [...fixture.nativeElement.querySelectorAll('button')].map(
        (b) => (b as HTMLElement).textContent?.trim(),
      );
      expect(new Set(rotulos)).toEqual(
        new Set(['Ver trilha', 'Fechar trilha']),
      );
    });
  });
});
