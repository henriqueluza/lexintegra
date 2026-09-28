import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CartaoPedido, EntregavelResumo } from 'shared/esquemas/pedido';
import type { ReuniaoResumo } from 'shared/esquemas/reuniao';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { ClientePedidos } from './cliente-pedidos';

/**
 * O topo da area do cliente (ADR-22): resumo em numeros, filtro e a coluna
 * "Agora e com voce". Tudo derivado da lista de pedidos — nenhuma chamada nova.
 */

function entregavel(
  estado: EntregavelResumo['estado'],
  arquivoServivel = false,
): EntregavelResumo {
  return {
    id: `e-${estado}`,
    nome: `Documento ${estado}`,
    ordem: 1,
    estado,
    revisoesUsadas: 0,
    temArquivo: arquivoServivel,
    arquivoServivel,
    versaoDoArquivo: arquivoServivel ? 1 : null,
  };
}

function reuniao(
  inicio: string,
  estado: ReuniaoResumo['estado'] = 'confirmada',
): ReuniaoResumo {
  return { id: `r-${inicio}`, inicio, fim: inicio, estado, link: null };
}

function pedido(
  id: string,
  entregaveis: EntregavelResumo[],
  extra: Partial<CartaoPedido> = {},
): CartaoPedido {
  return {
    id,
    distribuido: true,
    situacao: 'ativo',
    criadoEm: '2026-09-01T12:00:00.000Z',
    entregaveis,
    snapshot: {
      nome: `Servico ${id}`,
      descricao: 'Descricao.',
      precoCentavos: 100_000,
      entregaveis: entregaveis.map((e) => e.nome),
      textosOrientativos: [],
      quantidadeReunioes: 2,
      prazoValidadeReunioesDias: 365,
      intervaloMinimoReunioesDias: 7,
      numeroRevisoesPermitidas: 2,
    },
    reunioes: [],
    saldoDeReunioes: 2,
    reunioesValidasAte: '2099-01-01T00:00:00.000Z',
    agendamentoDisponivel: true,
    ...extra,
  };
}

async function montar(
  pedidos: CartaoPedido[],
): Promise<ComponentFixture<ClientePedidos>> {
  TestBed.configureTestingModule({
    imports: [ClientePedidos],
    providers: [
      {
        provide: ApiClienteService,
        useValue: {
          listarMeusPedidos: () => Promise.resolve(pedidos),
          listarObservacoes: () => Promise.resolve([]),
          listarAnexos: () => Promise.resolve([]),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ClientePedidos);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function valores(fixture: ComponentFixture<ClientePedidos>): string[] {
  return [...fixture.nativeElement.querySelectorAll('.resumo__valor')].map(
    (el: Element) => el.textContent?.trim() ?? '',
  );
}

function cartoes(fixture: ComponentFixture<ClientePedidos>): number {
  return fixture.nativeElement.querySelectorAll('app-cartao-pedido').length;
}

function filtrar(
  fixture: ComponentFixture<ClientePedidos>,
  rotulo: string,
): void {
  const botao = [
    ...fixture.nativeElement.querySelectorAll('.filtro__opcao'),
  ].find((b: Element) => b.textContent?.trim() === rotulo) as HTMLButtonElement;
  botao.click();
  fixture.detectChanges();
}

const EM_ANDAMENTO = pedido('a', [entregavel('em_elaboracao')]);
const PARA_REVISAR = pedido('b', [entregavel('em_revisao', true)]);
const CONCLUIDO = pedido('c', [entregavel('entregue')]);
const CANCELADO = pedido('d', [entregavel('solicitado')], {
  situacao: 'cancelado',
});

describe('ClientePedidos — resumo, filtro e pendencias', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('conta em andamento, documentos para revisar e concluidos', async () => {
    const fixture = await montar([
      EM_ANDAMENTO,
      PARA_REVISAR,
      CONCLUIDO,
      CANCELADO,
    ]);

    // Cancelado conta como encerrado, nao como em andamento.
    expect(valores(fixture)).toEqual(['2', '1', '2']);
  });

  it('mostra todos por padrao e filtra sem esconder nada sem pedido', async () => {
    const fixture = await montar([EM_ANDAMENTO, CONCLUIDO]);
    expect(cartoes(fixture)).toBe(2);

    filtrar(fixture, 'Em andamento');
    expect(cartoes(fixture)).toBe(1);

    filtrar(fixture, 'Concluídos');
    expect(cartoes(fixture)).toBe(1);

    filtrar(fixture, 'Todos');
    expect(cartoes(fixture)).toBe(2);
  });

  it('diz quando o filtro nao encontra nada', async () => {
    const fixture = await montar([EM_ANDAMENTO]);
    filtrar(fixture, 'Concluídos');

    expect(fixture.nativeElement.textContent).toContain(
      'Nenhum pedido neste filtro.',
    );
  });

  it('lista o documento que espera o cliente e aponta para o cartao', async () => {
    const fixture = await montar([EM_ANDAMENTO, PARA_REVISAR]);
    const pendencias = fixture.nativeElement.querySelectorAll('.pendencia');

    expect(pendencias).toHaveLength(1);
    expect(pendencias[0].getAttribute('href')).toBe('#pedido-b');
    expect(pendencias[0].textContent).toContain('Documento em_revisao');
  });

  it('nao cobra nada do cliente quando nao ha pendencia', async () => {
    const fixture = await montar([EM_ANDAMENTO]);

    expect(fixture.nativeElement.textContent).toContain(
      'Nada depende de você agora.',
    );
  });

  it('mostra as proximas reunioes em ordem e ignora passadas e canceladas', async () => {
    const fixture = await montar([
      pedido('a', [entregavel('em_elaboracao')], {
        reunioes: [
          reuniao('2099-03-10T17:00:00.000Z'),
          reuniao('2099-02-05T13:00:00.000Z', 'reservada_sem_link'),
          reuniao('2000-01-01T12:00:00.000Z'),
          reuniao('2099-01-01T12:00:00.000Z', 'cancelada_com_devolucao'),
        ],
      }),
    ]);
    const itens = [...fixture.nativeElement.querySelectorAll('.proxima')];

    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain('05');
    expect(itens[0].textContent).toContain('Link do Teams a caminho');
    expect(itens[1].textContent).toContain('10');
  });

  it('avisa quando nao ha reuniao marcada', async () => {
    const fixture = await montar([EM_ANDAMENTO]);

    expect(fixture.nativeElement.textContent).toContain(
      'Nenhuma reunião marcada.',
    );
  });
});
