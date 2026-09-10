import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { SlotResumo } from 'shared/esquemas/disponibilidade';
import { ApiAdvogadoService } from '../../autenticacao/api-advogado.service';
import { AdvogadoDisponibilidade } from './advogado-disponibilidade';
import { instanteDaCelula } from './grade';

const SEMANA = '2026-09-07';
const SEGUINTE = '2026-09-14';

interface ApiDeTeste {
  semanas: string[];
  slots: SlotResumo[];
  publicados: { semana: string; slots: { inicio: string }[] }[];
  chamadas: string[];
  erroAoPublicar: unknown;
}

async function montar(opcoes: Partial<ApiDeTeste> = {}): Promise<{
  fixture: ComponentFixture<AdvogadoDisponibilidade>;
  api: ApiDeTeste;
}> {
  const api: ApiDeTeste = {
    semanas: opcoes.semanas ?? [SEMANA, SEGUINTE],
    slots: opcoes.slots ?? [],
    publicados: [],
    chamadas: [],
    erroAoPublicar: opcoes.erroAoPublicar ?? null,
  };

  TestBed.configureTestingModule({
    imports: [AdvogadoDisponibilidade],
    providers: [
      {
        provide: ApiAdvogadoService,
        useValue: {
          obterDisponibilidade: (semana?: string) => {
            api.chamadas.push(`obter ${String(semana)}`);
            return Promise.resolve({ semanas: api.semanas, slots: api.slots });
          },
          publicarDisponibilidade: (corpo: {
            semana: string;
            slots: { inicio: string }[];
          }) => {
            api.publicados.push(corpo);
            return api.erroAoPublicar === null
              ? Promise.resolve([])
              : Promise.reject(api.erroAoPublicar);
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdvogadoDisponibilidade);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

function celulas(
  fixture: ComponentFixture<AdvogadoDisponibilidade>,
): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll('.grade__alternar')];
}

function botaoCom(
  fixture: ComponentFixture<AdvogadoDisponibilidade>,
  texto: string,
): HTMLButtonElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('button')].find(
    (b: HTMLButtonElement) => b.textContent?.includes(texto),
  );
}

describe('AdvogadoDisponibilidade', () => {
  /**
   * A SEMANA VEM DO SERVIDOR. A tela nao calcula que semana e hoje: duas
   * implementacoes desse calculo — uma no Cloud Run em UTC, outra no navegador —
   * discordam na noite de domingo, e o advogado editaria a semana errada sem
   * ver erro nenhum.
   */
  it('pede a grade sem semana e adota a que o servidor devolve', async () => {
    const { fixture, api } = await montar();

    expect(api.chamadas).toEqual(['obter undefined']);
    expect(fixture.nativeElement.textContent).toContain(SEMANA);
  });

  it('oferece as duas semanas editaveis que o servidor informou', async () => {
    const { fixture } = await montar();

    expect(botaoCom(fixture, SEMANA)).toBeDefined();
    expect(botaoCom(fixture, SEGUINTE)).toBeDefined();
  });

  it('troca de semana recarregando a grade', async () => {
    const { fixture, api } = await montar();

    botaoCom(fixture, SEGUINTE)?.click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual(['obter undefined', `obter ${SEGUINTE}`]);
  });

  it('desenha a grade de dias uteis por horas', async () => {
    const { fixture } = await montar();

    // 5 dias uteis x 11 horas.
    expect(celulas(fixture)).toHaveLength(55);
  });

  /** A grade carregada reflete os slots ja publicados. */
  it('marca as celulas dos slots que ja existem', async () => {
    const alvo = instanteDaCelula(SEMANA, 1, 14);
    const { fixture } = await montar({
      slots: [{ id: 'x', semana: SEMANA, ...alvo }],
    });

    const marcadas = celulas(fixture).filter(
      (celula) => celula.getAttribute('aria-pressed') === 'true',
    );
    expect(marcadas).toHaveLength(1);
  });

  it('alterna a celula ao clicar, nos dois sentidos', async () => {
    const { fixture } = await montar();
    const primeira = celulas(fixture)[0];

    primeira.click();
    fixture.detectChanges();
    expect(primeira.getAttribute('aria-pressed')).toBe('true');

    primeira.click();
    fixture.detectChanges();
    expect(primeira.getAttribute('aria-pressed')).toBe('false');
  });

  /**
   * PUBLICAR E SUBSTITUIR: a tela manda o conjunto INTEIRO de celulas marcadas,
   * nunca uma diferenca calculada aqui. Diferenca calculada no navegador erra na
   * primeira falha de rede e deixa o advogado disponivel num horario que ele
   * acabou de tirar.
   */
  it('publica a semana inteira, e nao a diferenca', async () => {
    const alvo = instanteDaCelula(SEMANA, 1, 14);
    const { fixture, api } = await montar({
      slots: [{ id: 'x', semana: SEMANA, ...alvo }],
    });

    // Marca mais uma: o corpo tem que sair com AS DUAS.
    const outra = celulas(fixture).find(
      (celula) => celula.getAttribute('aria-pressed') === 'false',
    );
    outra?.click();
    fixture.detectChanges();

    botaoCom(fixture, 'Publicar semana')?.click();
    await fixture.whenStable();

    expect(api.publicados).toHaveLength(1);
    expect(api.publicados[0].semana).toBe(SEMANA);
    expect(api.publicados[0].slots).toHaveLength(2);
  });

  it('desmarcar tudo publica uma semana vazia', async () => {
    const alvo = instanteDaCelula(SEMANA, 1, 14);
    const { fixture, api } = await montar({
      slots: [{ id: 'x', semana: SEMANA, ...alvo }],
    });

    celulas(fixture)
      .find((celula) => celula.getAttribute('aria-pressed') === 'true')
      ?.click();
    fixture.detectChanges();

    botaoCom(fixture, 'Publicar semana')?.click();
    await fixture.whenStable();

    expect(api.publicados[0].slots).toEqual([]);
  });

  it('confirma a publicacao', async () => {
    const { fixture } = await montar();

    botaoCom(fixture, 'Publicar semana')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Grade publicada.');
  });

  it('mostra erro quando a publicacao falha', async () => {
    const { fixture } = await montar({ erroAoPublicar: new Error('conflito') });

    botaoCom(fixture, 'Publicar semana')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('app-mensagem-erro'),
    ).toBeTruthy();
  });
});
