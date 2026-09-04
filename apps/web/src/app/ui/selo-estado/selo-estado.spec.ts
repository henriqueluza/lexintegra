import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ESTADOS_ENTREGAVEL, type EstadoEntregavel } from 'shared';
import { SeloEstado } from './selo-estado';

@Component({
  imports: [SeloEstado],
  template: `<app-selo-estado
    [estado]="estado()"
    [comMedidor]="comMedidor()"
  />`,
})
class Hospedeiro {
  readonly estado = input<EstadoEntregavel>('solicitado');
  readonly comMedidor = input(true);
}

function montar(entradas: Record<string, unknown> = {}): HTMLElement {
  const fixture = TestBed.createComponent(Hospedeiro);
  for (const [chave, valor] of Object.entries(entradas)) {
    fixture.componentRef.setInput(chave, valor);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const ROTULOS: Record<EstadoEntregavel, string> = {
  solicitado: 'Solicitado',
  em_elaboracao: 'Em elaboração',
  em_revisao: 'Em revisão',
  entregue: 'Entregue',
};

describe('SeloEstado', () => {
  /**
   * A lista de estados vem de `packages/shared`, nao de uma copia local. Este
   * teste percorre a lista de la: se alguem acrescentar um quinto estado sem
   * tratar aqui, o TypeScript ja recusa compilar, e este teste cobre o outro
   * lado — o rotulo existir e estar certo para cada um dos quatro.
   */
  it.each(ESTADOS_ENTREGAVEL)('nomeia o estado %s', (estado) => {
    const selo = montar({ estado }).querySelector('.selo');

    expect(selo?.textContent?.trim()).toBe(ROTULOS[estado]);
  });

  it.each([
    ['solicitado', 'selo--sol'],
    ['em_elaboracao', 'selo--ela'],
    ['em_revisao', 'selo--rev'],
    ['entregue', 'selo--ent'],
  ] as const)('usa a cor fixa de %s', (estado, classe) => {
    expect(montar({ estado }).querySelector('.selo')?.classList).toContain(
      classe,
    );
  });

  /**
   * A REGRA DURA DO COMPONENTE.
   *
   * O fundo do chip contrasta ~1,1:1 com o papel, e isso esta correto: chip nao e
   * controle interativo e a WCAG 1.4.11 nao se aplica. O que se aplica e a 1.4.1
   * — o estado nao pode ser comunicado apenas pela cor — e quem cumpre isso e o
   * rotulo textual. Um modo "so cor", tentador para ganhar espaco numa tabela
   * densa, quebraria a conformidade sem quebrar nada visivel.
   */
  it('sempre carrega o rotulo, mesmo sem o medidor', () => {
    const el = montar({ estado: 'em_revisao', comMedidor: false });

    expect(el.querySelector('.medidor')).toBeNull();
    expect(el.querySelector('.selo')?.textContent?.trim()).toBe('Em revisão');
  });

  describe('medidor', () => {
    it('tem um segmento por estado da maquina', () => {
      expect(montar().querySelectorAll('.medidor__parte').length).toBe(
        ESTADOS_ENTREGAVEL.length,
      );
    });

    it.each([
      ['solicitado', 1],
      ['em_elaboracao', 2],
      ['em_revisao', 3],
      ['entregue', 4],
    ] as const)('acende %s segmentos ate %s', (estado, acesos) => {
      const el = montar({ estado });

      expect(el.querySelectorAll('.medidor__parte--aceso').length).toBe(acesos);
    });

    /**
     * O medidor duplica visualmente o que o chip ja diz. Lido em voz alta viraria
     * "Em revisão, imagem, três de quatro" em cada linha de uma tabela.
     */
    it('e invisivel ao leitor de tela', () => {
      expect(
        montar().querySelector('.medidor')?.getAttribute('aria-hidden'),
      ).toBe('true');
    });
  });
});
