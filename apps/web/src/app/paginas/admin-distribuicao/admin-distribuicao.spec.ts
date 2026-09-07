import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { AdvogadoResumo } from 'shared/esquemas/advogado';
import type { PedidoParaDistribuir } from 'shared/esquemas/pedido';
import { ApiDistribuicaoService } from '../../autenticacao/api-distribuicao.service';
import { ApiService } from '../../autenticacao/api.service';
import { AdminDistribuicao } from './admin-distribuicao';

const ANA: AdvogadoResumo = {
  uid: 'uid-ana',
  nome: 'Ana Souza',
  email: 'ana@escritorio.test',
  status: 'ativo',
  criadoEm: null,
};

/** Suspensa: a API recusa distribuir para ela, entao a tela nao a oferece. */
const BIA: AdvogadoResumo = {
  uid: 'uid-bia',
  nome: 'Bia Lima',
  email: 'bia@escritorio.test',
  status: 'suspenso',
  criadoEm: null,
};

const NA_FILA: PedidoParaDistribuir = {
  id: 'pedido-1',
  produto: 'Parecer Juridico Trabalhista',
  cliente: { uid: 'uid-clara', nome: 'Clara Nunes' },
  advogadoId: null,
  distribuido: false,
  criadoEm: null,
};

const DISTRIBUIDO: PedidoParaDistribuir = {
  ...NA_FILA,
  id: 'pedido-2',
  advogadoId: ANA.uid,
  distribuido: true,
};

interface ApiDeTeste {
  pedidos: PedidoParaDistribuir[];
  advogados: AdvogadoResumo[];
  chamadas: string[];
  erroAoAtribuir: unknown;
}

async function montar(opcoes: Partial<ApiDeTeste> = {}): Promise<{
  fixture: ComponentFixture<AdminDistribuicao>;
  api: ApiDeTeste;
}> {
  const api: ApiDeTeste = {
    pedidos: opcoes.pedidos ?? [],
    advogados: opcoes.advogados ?? [ANA, BIA],
    chamadas: [],
    erroAoAtribuir: opcoes.erroAoAtribuir ?? null,
  };

  TestBed.configureTestingModule({
    imports: [AdminDistribuicao],
    providers: [
      {
        provide: ApiDistribuicaoService,
        useValue: {
          listarPedidosParaDistribuir: (situacao: string) => {
            api.chamadas.push(`listar ${situacao}`);
            return Promise.resolve(api.pedidos);
          },
          atribuirPedido: (pedidoId: string, advogadoId: string) => {
            api.chamadas.push(`atribuir ${pedidoId} a ${advogadoId}`);
            return api.erroAoAtribuir === null
              ? Promise.resolve(DISTRIBUIDO)
              : Promise.reject(api.erroAoAtribuir);
          },
          removerAtribuicao: (pedidoId: string) => {
            api.chamadas.push(`devolver ${pedidoId}`);
            return Promise.resolve(NA_FILA);
          },
        },
      },
      // A lista de advogados vem do catalogo administrativo, nao da distribuicao.
      {
        provide: ApiService,
        useValue: { listarAdvogados: () => Promise.resolve(api.advogados) },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminDistribuicao);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

/**
 * O `<select>` DA LINHA, e nao o filtro de situacao no topo da pagina. Um
 * `querySelector('select')` sem escopo pega o filtro — que e o primeiro do
 * documento — e o teste passaria a afirmar coisas sobre a tela errada.
 */
function selectDaLinha(
  fixture: ComponentFixture<AdminDistribuicao>,
): HTMLSelectElement | null {
  return fixture.nativeElement.querySelector('.distribuicao__select');
}

function botaoCom(
  fixture: ComponentFixture<AdminDistribuicao>,
  texto: string,
): HTMLButtonElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('button')].find(
    (b: HTMLButtonElement) => b.textContent?.includes(texto),
  );
}

describe('AdminDistribuicao', () => {
  /** A caixa de entrada existe para mostrar o que precisa de acao. */
  it('abre no filtro do que ainda nao foi distribuido', async () => {
    const { api } = await montar({ pedidos: [NA_FILA] });
    expect(api.chamadas).toEqual(['listar nao_distribuidos']);
  });

  it('mostra produto e cliente de cada pedido', async () => {
    const { fixture } = await montar({ pedidos: [NA_FILA] });

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Parecer Juridico Trabalhista');
    expect(texto).toContain('Clara Nunes');
  });

  /**
   * A API recusa atribuir a um suspenso — `DistribuicaoService` confere o status
   * dentro da transacao. Filtrar aqui e para nao OFERECER o que sera recusado;
   * nao substitui a conferencia.
   */
  it('nao oferece advogado suspenso', async () => {
    const { fixture } = await montar({ pedidos: [NA_FILA] });

    const opcoes = [
      ...(selectDaLinha(fixture)?.querySelectorAll('option') ?? []),
    ] as HTMLOptionElement[];

    expect(opcoes.map((o) => o.textContent?.trim())).toEqual([
      'Escolha um advogado',
      'Ana Souza',
    ]);
  });

  it('recusa distribuir sem escolher advogado', async () => {
    const { fixture, api } = await montar({ pedidos: [NA_FILA] });

    botaoCom(fixture, 'Distribuir')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.chamadas).toEqual(['listar nao_distribuidos']);
    expect(fixture.nativeElement.textContent).toContain('Escolha um advogado');
  });

  it('distribui e recarrega a fila', async () => {
    const { fixture, api } = await montar({ pedidos: [NA_FILA] });

    const select = selectDaLinha(fixture) as HTMLSelectElement;
    select.value = ANA.uid;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    botaoCom(fixture, 'Distribuir')?.click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual([
      'listar nao_distribuidos',
      `atribuir pedido-1 a ${ANA.uid}`,
      'listar nao_distribuidos',
    ]);
  });

  it('devolve o pedido a fila', async () => {
    const { fixture, api } = await montar({ pedidos: [DISTRIBUIDO] });

    botaoCom(fixture, 'Devolver a fila')?.click();
    await fixture.whenStable();

    expect(api.chamadas).toContain('devolver pedido-2');
  });

  /** Pedido distribuido mostra de quem e, e nao um formulario de escolha. */
  it('mostra o advogado do pedido ja distribuido', async () => {
    const { fixture } = await montar({ pedidos: [DISTRIBUIDO] });

    expect(fixture.nativeElement.textContent).toContain('Ana Souza');
    expect(selectDaLinha(fixture)).toBeNull();
  });

  it('mostra a mensagem de erro quando a atribuicao falha', async () => {
    const { fixture } = await montar({
      pedidos: [NA_FILA],
      erroAoAtribuir: new Error('conflito'),
    });

    const select = selectDaLinha(fixture) as HTMLSelectElement;
    select.value = ANA.uid;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    botaoCom(fixture, 'Distribuir')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('app-mensagem-erro'),
    ).toBeTruthy();
  });
});
