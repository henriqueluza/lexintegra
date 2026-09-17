import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { EstornoResumo } from 'shared/esquemas/pedido';
import { ApiEstornosService } from '../../autenticacao/api-estornos.service';
import { AdminEstornos } from './admin-estornos';

const PENDENTE: EstornoResumo = {
  pedidoId: 'pedido-1',
  pagamentoId: 'pix_1',
  produto: 'Parecer de risco trabalhista',
  valorCentavos: 250_000,
  motivo: 'Desistiu antes do inicio',
  execucao: 'manual_pendente',
  solicitadoEm: null,
};

async function montar(opcoes: {
  pendentes?: EstornoResumo[] | Error;
  falhaAoRegistrar?: boolean;
}): Promise<{ fixture: ComponentFixture<AdminEstornos>; chamadas: string[] }> {
  const chamadas: string[] = [];
  TestBed.configureTestingModule({
    imports: [AdminEstornos],
    providers: [
      {
        provide: ApiEstornosService,
        useValue: {
          listarPendentes: () => {
            chamadas.push('listar');
            const pendentes = opcoes.pendentes ?? [PENDENTE];
            return pendentes instanceof Error
              ? Promise.reject(pendentes)
              : Promise.resolve(pendentes);
          },
          registrarDevolucao: (pedidoId: string) => {
            chamadas.push(`devolucao ${pedidoId}`);
            return opcoes.falhaAoRegistrar === true
              ? Promise.reject(new Error('x'))
              : Promise.resolve({ ...PENDENTE, execucao: 'manual_executado' });
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AdminEstornos);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, chamadas };
}

function texto(fixture: ComponentFixture<AdminEstornos>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function botao(fixture: ComponentFixture<AdminEstornos>): HTMLButtonElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    'table button',
  ) as HTMLButtonElement;
}

describe('AdminEstornos', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lista o pedido, o valor e o motivo', async () => {
    const { fixture } = await montar({});

    const conteudo = texto(fixture).replace(/\s/g, ' ');
    expect(conteudo).toContain('Parecer de risco trabalhista');
    expect(conteudo).toContain('R$ 2.500,00');
    expect(conteudo).toContain('Desistiu antes do inicio');
  });

  it('registra a devolucao e recarrega', async () => {
    const { fixture, chamadas } = await montar({});

    botao(fixture).click();
    await fixture.whenStable();

    expect(chamadas).toEqual(['listar', 'devolucao pedido-1', 'listar']);
  });

  it('mostra a falha ao registrar', async () => {
    const { fixture } = await montar({ falhaAoRegistrar: true });

    botao(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Nao foi possivel concluir a operacao.');
  });

  it('mostra a falha ao carregar', async () => {
    const { fixture } = await montar({ pendentes: new Error('rede') });

    expect(texto(fixture)).toContain('Nao foi possivel carregar os estornos.');
  });

  it('diz quando nao ha devolucao pendente', async () => {
    const { fixture } = await montar({ pendentes: [] });

    expect(texto(fixture)).toContain('Nenhuma devolucao pendente.');
  });
});
