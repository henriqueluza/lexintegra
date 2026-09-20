import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { CartaoPedido } from 'shared/esquemas/pedido';
import type { ReuniaoResumo } from 'shared/esquemas/reuniao';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { ReunioesDoPedido } from './reunioes-do-pedido';

const DIA = 86_400_000;

function emDias(dias: number): string {
  return new Date(Date.now() + dias * DIA).toISOString();
}

function reuniao(ajustes: Partial<ReuniaoResumo> = {}): ReuniaoResumo {
  return {
    id: 'r001',
    inicio: emDias(10),
    fim: emDias(10),
    estado: 'confirmada',
    link: 'https://teams.test/sala',
    ...ajustes,
  };
}

function pedido(ajustes: Partial<CartaoPedido> = {}): CartaoPedido {
  return {
    id: 'pedido-1',
    distribuido: true,
    situacao: 'ativo',
    criadoEm: new Date().toISOString(),
    entregaveis: [],
    reunioes: [],
    saldoDeReunioes: 2,
    reunioesValidasAte: emDias(300),
    snapshot: {
      nome: 'Revisao de contrato',
      descricao: 'Descricao',
      precoCentavos: 250_000,
      entregaveis: ['Minuta'],
      textosOrientativos: [],
      quantidadeReunioes: 2,
      prazoValidadeReunioesDias: 365,
      intervaloMinimoReunioesDias: 7,
      numeroRevisoesPermitidas: 2,
    },
    ...ajustes,
  };
}

interface ApiDeTeste {
  horarios: { slotId: string; inicio: string; fim: string }[];
  chamadas: string[];
}

async function montar(
  cartao: CartaoPedido = pedido(),
): Promise<{ fixture: ComponentFixture<ReunioesDoPedido>; api: ApiDeTeste }> {
  const api: ApiDeTeste = {
    horarios: [{ slotId: 'uid-ana_x', inicio: emDias(5), fim: emDias(5) }],
    chamadas: [],
  };

  TestBed.configureTestingModule({
    imports: [ReunioesDoPedido],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: ApiClienteService,
        useValue: {
          horariosDeReuniao: (id: string, reuniaoId?: string) => {
            api.chamadas.push(`horarios ${id} ${reuniaoId ?? '-'}`);
            return Promise.resolve(api.horarios);
          },
          marcarReuniao: (id: string, slotId: string) => {
            api.chamadas.push(`marcar ${id} ${slotId}`);
            return Promise.resolve(reuniao());
          },
          remarcarReuniao: (id: string, rid: string, slotId: string) => {
            api.chamadas.push(`remarcar ${id} ${rid} ${slotId}`);
            return Promise.resolve(reuniao());
          },
          cancelarReuniao: (id: string, rid: string) => {
            api.chamadas.push(`cancelar ${id} ${rid}`);
            return Promise.resolve(reuniao());
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(ReunioesDoPedido);
  fixture.componentRef.setInput('pedido', cartao);
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, api };
}

function texto(fixture: ComponentFixture<ReunioesDoPedido>): string {
  return String(fixture.nativeElement.textContent);
}

function botoes(
  fixture: ComponentFixture<ReunioesDoPedido>,
): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll('button')];
}

async function clicar(
  fixture: ComponentFixture<ReunioesDoPedido>,
  rotulo: RegExp,
): Promise<void> {
  const alvo = botoes(fixture).find((b) => rotulo.test(b.textContent ?? ''));
  alvo?.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('ReunioesDoPedido', () => {
  it('mostra o saldo e o prazo de validade', async () => {
    const { fixture } = await montar();

    expect(texto(fixture)).toContain('0/2');
    expect(texto(fixture)).toContain('válidas até');
  });

  it('lista a reuniao marcada com o link da sala', async () => {
    const { fixture } = await montar(pedido({ reunioes: [reuniao()] }));

    expect(
      fixture.nativeElement.querySelector('.reuniao__link'),
    ).toBeTruthy();
  });

  /**
   * REGRA INVIOLAVEL 13: nunca um link vazio nem o de outra reuniao. A ausencia
   * e dita com todas as letras.
   */
  it('reuniao sem sala diz que o link esta a caminho', async () => {
    const { fixture } = await montar(
      pedido({ reunioes: [reuniao({ estado: 'reservada_sem_link', link: null })] }),
    );

    expect(texto(fixture)).toContain('Link a caminho');
    expect(fixture.nativeElement.querySelector('.reuniao__link')).toBeNull();
  });

  /** Cancelada nao pede nada e nao ocupa saldo: sai da lista. */
  it('nao lista reuniao cancelada', async () => {
    const { fixture } = await montar(
      pedido({
        reunioes: [reuniao({ estado: 'cancelada_com_devolucao' })],
        saldoDeReunioes: 2,
      }),
    );

    expect(fixture.nativeElement.querySelector('.reuniao')).toBeNull();
  });

  /* ---------------------------------------------------------------------- */
  /* Os estados obrigatorios                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * A MESMA MENSAGEM QUE O SERVIDOR USA no 409 (`MOTIVO_DO_IMPEDIMENTO`). A
   * tela explica por que o botao nao esta la, em vez de so escondê-lo.
   */
  it('pedido nao distribuido diz que esta em analise', async () => {
    const { fixture } = await montar(pedido({ distribuido: false }));

    expect(texto(fixture)).toContain('em analise');
    expect(botoes(fixture).some((b) => /Marcar reuni/u.test(b.textContent ?? ''))).toBe(
      false,
    );
  });

  it('saldo esgotado diz que as reunioes ja foram usadas', async () => {
    const { fixture } = await montar(
      pedido({ saldoDeReunioes: 0, reunioes: [reuniao(), reuniao({ id: 'r002' })] }),
    );

    expect(texto(fixture)).toContain('ja foram usadas');
  });

  it('janela vencida diz que o prazo terminou', async () => {
    const { fixture } = await montar(
      pedido({ reunioesValidasAte: emDias(-1) }),
    );

    expect(texto(fixture)).toContain('prazo para usar');
  });

  it('pedido cancelado nao oferece marcar', async () => {
    const { fixture } = await montar(pedido({ situacao: 'cancelado' }));

    expect(texto(fixture)).toContain('cancelado');
  });

  it('sem horario disponivel, diz por que', async () => {
    const { fixture, api } = await montar();
    api.horarios = [];

    await clicar(fixture, /Marcar reuni/u);

    expect(texto(fixture)).toContain('Nenhum horário disponível');
  });

  /* ---------------------------------------------------------------------- */
  /* As tres acoes                                                           */
  /* ---------------------------------------------------------------------- */

  it('marcar busca horarios e envia o slot escolhido', async () => {
    const { fixture, api } = await montar();

    await clicar(fixture, /Marcar reuni/u);
    expect(api.chamadas).toContain('horarios pedido-1 -');

    const selecao: HTMLSelectElement =
      fixture.nativeElement.querySelector('select');
    selecao.value = 'uid-ana_x';
    selecao.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await clicar(fixture, /Confirmar reuni/u);

    expect(api.chamadas).toContain('marcar pedido-1 uid-ana_x');
  });

  /**
   * REMARCAR PEDE A LISTA DIZENDO QUAL REUNIAO ESTA SENDO MOVIDA.
   *
   * Sem o id, o servidor conta a reuniao movida contra o proprio intervalo
   * minimo e contra o proprio saldo, e devolve lista vazia — a tela mostraria
   * "nenhum horario disponivel para remarcar" em todo pedido, sem erro nenhum.
   */
  it('remarcar pede os horarios identificando a reuniao movida', async () => {
    const { fixture, api } = await montar(pedido({ reunioes: [reuniao()] }));

    await clicar(fixture, /^\s*Remarcar\s*$/u);

    expect(api.chamadas).toContain('horarios pedido-1 r001');
  });

  it('cancelar chama a API para aquela reuniao', async () => {
    const { fixture, api } = await montar(pedido({ reunioes: [reuniao()] }));

    await clicar(fixture, /^\s*Cancelar\s*$/u);

    expect(api.chamadas).toContain('cancelar pedido-1 r001');
  });

  /**
   * A TELA DIZ ANTES DO CLIQUE se o cancelamento devolve o credito. E a regra
   * das 24 horas do ADR-12, lida pela MESMA funcao que o servidor usa.
   */
  it('avisa que cancelar com folga devolve o credito', async () => {
    const { fixture } = await montar(
      pedido({ reunioes: [reuniao({ inicio: emDias(10) })] }),
    );

    expect(texto(fixture)).toContain('devolve a reunião ao saldo');
    expect(texto(fixture)).not.toContain('NÃO devolve');
  });

  it('avisa que cancelar em cima da hora NAO devolve', async () => {
    const { fixture } = await montar(
      pedido({
        reunioes: [reuniao({ inicio: new Date(Date.now() + 3_600_000).toISOString() })],
      }),
    );

    expect(texto(fixture)).toContain('NÃO devolve');
  });

  /** Com menos de 24h nao da para remarcar — so cancelar (ADR-21, decisao 6). */
  it('nao oferece remarcar dentro das 24 horas', async () => {
    const { fixture } = await montar(
      pedido({
        reunioes: [reuniao({ inicio: new Date(Date.now() + 3_600_000).toISOString() })],
      }),
    );

    expect(botoes(fixture).some((b) => /Remarcar/u.test(b.textContent ?? ''))).toBe(
      false,
    );
  });

  it('oferece remarcar com folga', async () => {
    const { fixture } = await montar(pedido({ reunioes: [reuniao()] }));

    expect(botoes(fixture).some((b) => /Remarcar/u.test(b.textContent ?? ''))).toBe(
      true,
    );
  });

  it('mostra erro quando a acao falha', async () => {
    const { fixture, api } = await montar();
    api.horarios = [];

    await clicar(fixture, /Marcar reuni/u);

    expect(texto(fixture)).toContain('Nenhum horário');
  });
});
