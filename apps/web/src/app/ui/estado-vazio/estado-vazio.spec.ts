import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EstadoVazio } from './estado-vazio';

@Component({
  imports: [EstadoVazio],
  template: `
    <app-estado-vazio [mensagem]="mensagem" [titulo]="titulo" [icone]="icone">
      @if (comAcao) {
        <button type="button" class="acao">Anexar arquivo</button>
      }
    </app-estado-vazio>
  `,
})
class Hospedeiro {
  mensagem = 'Nenhum arquivo ainda.';
  titulo: string | null = null;
  icone: 'documento' | null = null;
  comAcao = false;
}

function montar(ajuste: Partial<Hospedeiro> = {}): HTMLElement {
  const fixture = TestBed.createComponent(Hospedeiro);
  Object.assign(fixture.componentInstance, ajuste);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EstadoVazio', () => {
  it('explica por que esta vazio', () => {
    expect(montar().querySelector('.vazio__mensagem')?.textContent).toBe(
      'Nenhum arquivo ainda.',
    );
  });

  it('mostra titulo e icone so quando recebe cada um', () => {
    expect(montar().querySelector('.vazio__titulo')).toBeNull();
    expect(montar().querySelector('svg')).toBeNull();

    const completo = montar({ titulo: 'Sem arquivos', icone: 'documento' });
    expect(completo.querySelector('.vazio__titulo')?.textContent).toBe(
      'Sem arquivos',
    );
    expect(completo.querySelector('svg')).not.toBeNull();
  });

  /**
   * Estado vazio sem saida e beco: a acao projetada e o que transforma "nao ha
   * nada" em "faca isto".
   */
  it('projeta a acao que tira a pessoa do vazio', () => {
    expect(montar({ comAcao: true }).querySelector('.acao')).not.toBeNull();
  });
});
