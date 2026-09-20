import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ReuniaoDaAgenda } from 'shared/esquemas/reuniao';
import { ApiReunioesService } from '../../autenticacao/api-reunioes.service';
import { AdvogadoAgenda } from './advogado-agenda';

function reuniao(ajustes: Partial<ReuniaoDaAgenda> = {}): ReuniaoDaAgenda {
  return {
    id: 'r001',
    pedidoId: 'pedido-1',
    produto: 'Revisao de contrato',
    cliente: 'Clara Dias',
    inicio: '2026-09-24T17:00:00.000Z',
    fim: '2026-09-24T18:00:00.000Z',
    estado: 'confirmada',
    link: 'https://teams.test/sala',
    ...ajustes,
  };
}

async function montar(
  resposta: ReuniaoDaAgenda[] | Error = [reuniao()],
): Promise<ComponentFixture<AdvogadoAgenda>> {
  TestBed.configureTestingModule({
    imports: [AdvogadoAgenda],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: ApiReunioesService,
        useValue: {
          minhaAgenda: () =>
            resposta instanceof Error
              ? Promise.reject(resposta)
              : Promise.resolve(resposta),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdvogadoAgenda);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
}

function texto(fixture: ComponentFixture<AdvogadoAgenda>): string {
  return String(fixture.nativeElement.textContent);
}

describe('AdvogadoAgenda', () => {
  it('mostra a reuniao com cliente e produto', async () => {
    const fixture = await montar();

    expect(texto(fixture)).toContain('Clara Dias');
    expect(texto(fixture)).toContain('Revisao de contrato');
  });

  /** O horario sai no fuso do escritorio: 17h UTC e 14h em Sao Paulo. */
  it('mostra o horario no fuso do escritorio', async () => {
    const fixture = await montar();

    expect(texto(fixture)).toContain('14:00');
  });

  it('oferece o link da sala quando existe', async () => {
    const fixture = await montar();

    expect(fixture.nativeElement.querySelector('.agenda__link')).toBeTruthy();
  });

  /** Regra inviolavel 13: a ausencia do link e dita, nunca disfarcada. */
  it('reuniao sem sala diz que o link esta a caminho', async () => {
    const fixture = await montar([
      reuniao({ estado: 'reservada_sem_link', link: null }),
    ]);

    expect(texto(fixture)).toContain('Link a caminho');
    expect(fixture.nativeElement.querySelector('.agenda__link')).toBeNull();
  });

  it('mostra estado vazio sem reuniao nenhuma', async () => {
    const fixture = await montar([]);

    expect(fixture.nativeElement.querySelector('app-estado-vazio')).toBeTruthy();
  });

  it('mostra erro quando a agenda falha', async () => {
    const fixture = await montar(new Error('rede'));

    expect(fixture.nativeElement.querySelector('app-mensagem-erro')).toBeTruthy();
  });
});
