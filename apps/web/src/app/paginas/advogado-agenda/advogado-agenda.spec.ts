import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { SlotResumo } from 'shared/esquemas/disponibilidade';
import type { ReuniaoDaAgenda } from 'shared/esquemas/reuniao';
import { mesDe, semanasEditaveis } from 'shared/semana';
import { ApiAdvogadoService } from '../../autenticacao/api-advogado.service';
import { ApiReunioesService } from '../../autenticacao/api-reunioes.service';
import { diaDoInstante } from '../../comum/calendario';
import { inicioDaHora, semanaDaData } from './agenda';
import { AdvogadoAgenda } from './advogado-agenda';

/**
 * A agenda do mes do advogado (07/10/2026). As datas saem de HOJE para o teste
 * valer em qualquer dia: o que interessa e o primeiro dia util depois de hoje,
 * que sempre cai na janela de publicacao.
 */
function proximoDiaUtil(): string {
  for (let dias = 1; dias < 10; dias += 1) {
    const data = diaDoInstante(
      new Date(Date.now() + dias * 86_400_000).toISOString(),
    );
    const [ano, mes, dia] = data.split('-').map(Number);
    if (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() % 6 !== 0) {
      return data;
    }
  }
  throw new Error('sem dia util');
}

const DIA = proximoDiaUtil();

function slot(data: string, hora: number): SlotResumo {
  const inicio = inicioDaHora(data, hora);
  return {
    id: `uid-ana_${inicio}`,
    inicio,
    fim: new Date(Date.parse(inicio) + 3_600_000).toISOString(),
    semana: semanaDaData(data),
  };
}

function reuniao(): ReuniaoDaAgenda {
  const inicio = inicioDaHora(DIA, 10);
  return {
    id: 'r001',
    pedidoId: 'pedido-1',
    produto: 'Revisao de contrato',
    cliente: 'Clara Dias',
    inicio,
    fim: new Date(Date.parse(inicio) + 3_600_000).toISOString(),
    estado: 'reservada_sem_link',
    link: null,
  };
}

interface Arranjo {
  readonly fixture: ComponentFixture<AdvogadoAgenda>;
  readonly publicadas: { semana: string; slots: unknown[] }[];
  readonly meses: string[];
}

async function montar(): Promise<Arranjo> {
  const publicadas: { semana: string; slots: unknown[] }[] = [];
  const meses: string[] = [];

  TestBed.configureTestingModule({
    imports: [AdvogadoAgenda],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: ApiAdvogadoService,
        useValue: {
          obterDisponibilidadeDoMes: (mes: string) => {
            meses.push(mes);
            return Promise.resolve({
              semanas: semanasEditaveis(new Date()),
              slots: [slot(DIA, 9), slot(DIA, 10)],
            });
          },
          publicarDisponibilidade: (corpo: {
            semana: string;
            slots: unknown[];
          }) => {
            publicadas.push(corpo);
            return Promise.resolve([]);
          },
        },
      },
      {
        provide: ApiReunioesService,
        useValue: { minhaAgenda: () => Promise.resolve([reuniao()]) },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdvogadoAgenda);
  fixture.detectChanges();
  /* A carga e uma promessa comum: `whenStable` sozinho nao a espera. */
  await new Promise((resolver) => setTimeout(resolver, 0));
  fixture.detectChanges();
  return { fixture, publicadas, meses };
}

async function clicar(
  fixture: ComponentFixture<AdvogadoAgenda>,
  elemento: HTMLElement | null | undefined,
): Promise<void> {
  elemento?.click();
  fixture.detectChanges();
  await new Promise((resolver) => setTimeout(resolver, 0));
  fixture.detectChanges();
}

function celulaDe(
  fixture: ComponentFixture<AdvogadoAgenda>,
  data: string,
): HTMLButtonElement | undefined {
  const numero = String(Number(data.slice(8, 10)));
  const celulas = [
    ...fixture.nativeElement.querySelectorAll('button.celula'),
  ] as HTMLButtonElement[];
  return celulas.find(
    (b) => b.querySelector('.celula__numero')?.textContent?.trim() === numero,
  );
}

/* O dia util seguinte pode cair no mes que vem (fim de mes). */
async function abrirDia(
  fixture: ComponentFixture<AdvogadoAgenda>,
): Promise<void> {
  if (mesDe(new Date(`${DIA}T15:00:00Z`)) !== mesDe(new Date())) {
    await clicar(
      fixture,
      fixture.nativeElement.querySelector('button[aria-label="Próximo mês"]'),
    );
  }
  await clicar(fixture, celulaDe(fixture, DIA));
}

function hora(
  fixture: ComponentFixture<AdvogadoAgenda>,
  texto: string,
): HTMLButtonElement {
  const horas = [
    ...fixture.nativeElement.querySelectorAll('button.hora'),
  ] as HTMLButtonElement[];
  return horas.find(
    (b) => b.textContent?.trim() === texto,
  ) as HTMLButtonElement;
}

describe('AdvogadoAgenda', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('abre no mes corrente', async () => {
    const { meses } = await montar();

    expect(meses).toEqual([mesDe(new Date())]);
  });

  it('o dia mostra a reuniao, sem link inventado', async () => {
    const { fixture } = await montar();
    await abrirDia(fixture);

    const texto = String(fixture.nativeElement.textContent);
    expect(texto).toContain('Clara Dias');
    expect(texto).toContain('Revisao de contrato');
    expect(texto).toContain('Link a caminho');
  });

  it('a celula conta reunioes e horarios livres', async () => {
    const { fixture } = await montar();
    await abrirDia(fixture);

    expect(celulaDe(fixture, DIA)?.getAttribute('aria-label')).toContain(
      '1 reunião(ões), 1 horário(s) livre(s)',
    );
  });

  /* Hora com reuniao marcada nao sai da grade: a tela trava, o PUT recusaria. */
  it('a hora com reuniao fica travada', async () => {
    const { fixture } = await montar();
    await abrirDia(fixture);

    expect(hora(fixture, '10h').disabled).toBe(true);
    expect(hora(fixture, '9h').getAttribute('aria-pressed')).toBe('true');
    expect(hora(fixture, '11h').getAttribute('aria-pressed')).toBe('false');
  });

  it('publica a semana inteira tocada, com a hora nova e a reservada', async () => {
    const { fixture, publicadas } = await montar();
    await abrirDia(fixture);

    await clicar(fixture, hora(fixture, '11h'));
    const publicar = [
      ...fixture.nativeElement.querySelectorAll('button'),
    ] as HTMLButtonElement[];
    await clicar(
      fixture,
      publicar.find((b) => /Publicar altera/u.test(b.textContent ?? '')),
    );

    expect(publicadas).toHaveLength(1);
    expect(publicadas[0].semana).toBe(semanaDaData(DIA));
    expect(publicadas[0].slots).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('Agenda publicada.');
  });

  it('nao troca de mes com alteracao sem publicar', async () => {
    const { fixture, meses } = await montar();
    await abrirDia(fixture);
    const antes = meses.length;

    await clicar(fixture, hora(fixture, '11h'));
    await clicar(
      fixture,
      fixture.nativeElement.querySelector('button[aria-label="Próximo mês"]'),
    );

    expect(meses).toHaveLength(antes);
    expect(fixture.nativeElement.textContent).toContain(
      'Publique as alterações',
    );
  });
});
