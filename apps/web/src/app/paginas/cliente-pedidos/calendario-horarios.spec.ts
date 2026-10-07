import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { deslocarMes, mesDe } from 'shared/semana';
import { ApiClienteService } from '../../autenticacao/api-cliente.service';
import { CalendarioHorarios } from './calendario-horarios';

/**
 * O calendario do mes do cliente (07/10/2026). O duble da API devolve um
 * horario no dia 15 do mes pedido e registra cada pedido, para o teste conferir
 * o mes e a reuniao que o calendario repassa ao servidor.
 */
const MES_ATUAL = mesDe(new Date());

interface Arranjo {
  readonly fixture: ComponentFixture<CalendarioHorarios>;
  readonly pedidos: string[];
  readonly escolhas: (string | null)[];
}

async function montar(
  entradas: { ate?: string | null; reuniaoId?: string | null } = {},
  vazio = false,
): Promise<Arranjo> {
  const pedidos: string[] = [];
  const escolhas: (string | null)[] = [];

  TestBed.configureTestingModule({
    imports: [CalendarioHorarios],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: ApiClienteService,
        useValue: {
          horariosDeReuniao: (id: string, reuniaoId?: string, mes?: string) => {
            pedidos.push(`${id} ${reuniaoId ?? '-'} ${mes ?? '?'}`);
            return Promise.resolve(
              vazio
                ? []
                : [
                    {
                      slotId: `slot-${mes ?? ''}`,
                      inicio: `${mes ?? ''}-15T17:00:00.000Z`,
                      fim: `${mes ?? ''}-15T18:00:00.000Z`,
                    },
                  ],
            );
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(CalendarioHorarios);
  fixture.componentRef.setInput('pedidoId', 'pedido-1');
  if (entradas.ate !== undefined)
    fixture.componentRef.setInput('ate', entradas.ate);
  if (entradas.reuniaoId !== undefined)
    fixture.componentRef.setInput('reuniaoId', entradas.reuniaoId);
  fixture.componentInstance.escolha.subscribe((valor) => escolhas.push(valor));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, pedidos, escolhas };
}

function botao(
  fixture: ComponentFixture<CalendarioHorarios>,
  rotulo: string,
): HTMLButtonElement {
  return fixture.nativeElement.querySelector(`button[aria-label="${rotulo}"]`);
}

async function clicar(
  fixture: ComponentFixture<CalendarioHorarios>,
  elemento: HTMLElement,
): Promise<void> {
  elemento.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('CalendarioHorarios', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('abre no mes corrente e pede so ele a API', async () => {
    const { pedidos } = await montar();

    expect(pedidos).toEqual([`pedido-1 - ${MES_ATUAL}`]);
  });

  /* Remarcar: sem o id, o servidor conta a reuniao movida contra ela mesma. */
  it('na remarcacao, repassa a reuniao movida', async () => {
    const { pedidos } = await montar({ reuniaoId: 'r001' });

    expect(pedidos).toEqual([`pedido-1 r001 ${MES_ATUAL}`]);
  });

  it('nao volta antes do mes corrente', async () => {
    const { fixture } = await montar();

    expect(botao(fixture, 'Mês anterior').disabled).toBe(true);
  });

  it('avanca mes a mes ate o mes em que as reunioes vencem', async () => {
    const vencimento = `${deslocarMes(MES_ATUAL, 2)}-20T12:00:00.000Z`;
    const { fixture, pedidos } = await montar({ ate: vencimento });

    await clicar(fixture, botao(fixture, 'Próximo mês'));
    await clicar(fixture, botao(fixture, 'Próximo mês'));

    expect(pedidos.map((p) => p.split(' ')[2])).toEqual([
      MES_ATUAL,
      deslocarMes(MES_ATUAL, 1),
      deslocarMes(MES_ATUAL, 2),
    ]);
    expect(botao(fixture, 'Próximo mês').disabled).toBe(true);
  });

  it('destaca o dia com horario, mostra a hora e emite o slot escolhido', async () => {
    const { fixture, escolhas } = await montar();
    const dia: HTMLButtonElement =
      fixture.nativeElement.querySelector('button.dia--livre');

    expect(dia.textContent?.trim()).toBe('15');
    expect(dia.getAttribute('aria-label')).toContain('1 horário livre');

    await clicar(fixture, dia);
    expect(dia.getAttribute('aria-pressed')).toBe('true');

    const hora: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[type="radio"]',
    );
    expect(hora.closest('label')?.textContent).toContain('14:00 – 15:00');
    await clicar(fixture, hora);

    expect(escolhas.at(-1)).toBe(`slot-${MES_ATUAL}`);
  });

  it('dia sem horario fica desabilitado', async () => {
    const { fixture } = await montar();
    const desabilitados = fixture.nativeElement.querySelectorAll(
      'button.dia:disabled',
    );

    expect(desabilitados.length).toBeGreaterThan(20);
  });

  it('mes sem horario diz para olhar os proximos', async () => {
    const { fixture } = await montar({}, true);

    expect(fixture.nativeElement.textContent).toContain(
      'Nenhum horário livre neste mês',
    );
  });

  /* 12/10 e feriado nacional: o rotulo diz, mesmo com o dia desabilitado. */
  it('o rotulo do feriado diz o nome', async () => {
    const { fixture } = await montar();
    const doze = [
      ...fixture.nativeElement.querySelectorAll('button.dia--feriado'),
    ] as HTMLButtonElement[];

    expect(
      doze.every((b) => b.getAttribute('aria-label')?.includes('feriado:')),
    ).toBe(true);
  });
});
