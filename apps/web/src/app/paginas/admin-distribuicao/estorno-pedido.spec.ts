import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  EstornoResumo,
  PedidoParaDistribuir,
} from 'shared/esquemas/pedido';
import { ApiEstornosService } from '../../autenticacao/api-estornos.service';
import { EstornoPedido } from './estorno-pedido';

const PEDIDO: PedidoParaDistribuir = {
  id: 'pedido-1',
  produto: 'Parecer',
  cliente: { uid: 'uid-clara', nome: 'Clara Nunes' },
  advogadoId: null,
  distribuido: false,
  situacao: 'ativo',
  criadoEm: null,
};

function montar(resposta: Promise<unknown>): {
  fixture: ComponentFixture<EstornoPedido>;
  concluidos: EstornoResumo[];
} {
  TestBed.configureTestingModule({
    imports: [EstornoPedido],
    providers: [
      { provide: ApiEstornosService, useValue: { estornar: () => resposta } },
    ],
  });
  const fixture = TestBed.createComponent(EstornoPedido);
  fixture.componentRef.setInput('pedido', PEDIDO);
  const concluidos: EstornoResumo[] = [];
  fixture.componentInstance.concluido.subscribe((e) => concluidos.push(e));
  fixture.detectChanges();
  return { fixture, concluidos };
}

interface Interno {
  motivo: { setValue: (v: string) => void };
  confirmar: () => Promise<void>;
}

function interno(fixture: ComponentFixture<EstornoPedido>): Interno {
  return fixture.componentInstance as unknown as Interno;
}

describe('EstornoPedido', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('exige o motivo', async () => {
    const { fixture, concluidos } = montar(Promise.resolve({}));

    await interno(fixture).confirmar();
    fixture.detectChanges();

    expect(concluidos).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain(
      'Informe o motivo do estorno.',
    );
  });

  /** O 409 traz a regra do ADR-12 escrita pelo servidor, e ela aparece inteira. */
  it('mostra a recusa do servidor fora de solicitado', async () => {
    const { fixture, concluidos } = montar(
      Promise.reject(
        new HttpErrorResponse({
          status: 409,
          error: {
            message:
              'Estorno so e permitido com o pedido em solicitado (ADR-12).',
          },
        }),
      ),
    );
    interno(fixture).motivo.setValue('Desistiu');

    await interno(fixture).confirmar();
    fixture.detectChanges();

    expect(concluidos).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('(ADR-12)');
  });

  it('409 sem mensagem usa o texto da tela', async () => {
    const { fixture } = montar(
      Promise.reject(new HttpErrorResponse({ status: 409, error: null })),
    );
    interno(fixture).motivo.setValue('Desistiu');

    await interno(fixture).confirmar();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Este pedido nao pode ser estornado.',
    );
  });

  it('emite o estorno registrado', async () => {
    const { fixture, concluidos } = montar(
      Promise.resolve({ pedidoId: 'pedido-1', execucao: 'manual_pendente' }),
    );
    interno(fixture).motivo.setValue('Desistiu');

    await interno(fixture).confirmar();

    expect(concluidos).toEqual([
      { pedidoId: 'pedido-1', execucao: 'manual_pendente' },
    ]);
  });
});
