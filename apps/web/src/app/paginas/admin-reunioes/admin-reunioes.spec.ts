import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ReuniaoSemSala } from 'shared/esquemas/reuniao';
import { ApiOutboxService } from '../../autenticacao/api-outbox.service';
import { ApiReunioesService } from '../../autenticacao/api-reunioes.service';
import { AdminReunioes } from './admin-reunioes';

function semSala(ajustes: Partial<ReuniaoSemSala> = {}): ReuniaoSemSala {
  return {
    id: 'r001',
    pedidoId: 'pedido-1',
    advogadoId: 'uid-ana',
    inicio: '2026-09-24T17:00:00.000Z',
    fim: '2026-09-24T18:00:00.000Z',
    estado: 'reservada_sem_link',
    eventoOutboxId: 'criar-sala-reuniao_pedido-1_r001',
    ...ajustes,
  };
}

interface ApiDeTeste {
  chamadas: string[];
}

async function montar(
  linhas: ReuniaoSemSala[] = [semSala()],
): Promise<{ fixture: ComponentFixture<AdminReunioes>; api: ApiDeTeste }> {
  const api: ApiDeTeste = { chamadas: [] };

  TestBed.configureTestingModule({
    imports: [AdminReunioes],
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: ApiReunioesService,
        useValue: {
          listarSemSala: () => Promise.resolve(linhas),
          cancelar: (pedidoId: string, reuniaoId: string) => {
            api.chamadas.push(`cancelar ${pedidoId} ${reuniaoId}`);
            return Promise.resolve({});
          },
        },
      },
      {
        provide: ApiOutboxService,
        useValue: {
          reenviar: (id: string) => {
            api.chamadas.push(`reenviar ${id}`);
            return Promise.resolve({ reenviado: true });
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminReunioes);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, api };
}

function botoes(
  fixture: ComponentFixture<AdminReunioes>,
): HTMLButtonElement[] {
  return [...fixture.nativeElement.querySelectorAll('button')];
}

async function clicar(
  fixture: ComponentFixture<AdminReunioes>,
  rotulo: RegExp,
): Promise<void> {
  botoes(fixture)
    .find((b) => rotulo.test(b.textContent ?? ''))
    ?.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminReunioes', () => {
  it('lista a reuniao sem sala', async () => {
    const { fixture } = await montar();

    expect(String(fixture.nativeElement.textContent)).toContain('pedido-1');
  });

  /**
   * O BOTAO DE TENTAR DE NOVO REENVIA O REGISTRO DO OUTBOX, e nao chama um
   * endpoint de "recriar sala". Um caminho proprio seria o QUARTO caminho de
   * entrega, e a regra inviolavel 3 admite tres — todos por `reivindicar`.
   */
  it('tentar de novo reenvia o evento do outbox, pelo id da linha', async () => {
    const { fixture, api } = await montar();

    await clicar(fixture, /Tentar de novo/u);

    expect(api.chamadas).toEqual(['reenviar criar-sala-reuniao_pedido-1_r001']);
  });

  it('confirma o reenvio na tela', async () => {
    const { fixture } = await montar();

    await clicar(fixture, /Tentar de novo/u);

    expect(String(fixture.nativeElement.textContent)).toContain('Reenviado');
  });

  /** ADR-21, decisao H: o escritorio cancela, e o credito volta ao cliente. */
  it('cancela a reuniao pelo caminho administrativo', async () => {
    const { fixture, api } = await montar();

    await clicar(fixture, /Cancelar reuni/u);

    expect(api.chamadas).toContain('cancelar pedido-1 r001');
  });

  it('mostra a mensagem de vazio quando a fila esta limpa', async () => {
    const { fixture } = await montar([]);

    expect(String(fixture.nativeElement.textContent)).toContain(
      'Nenhuma reunião esperando sala',
    );
  });
});
