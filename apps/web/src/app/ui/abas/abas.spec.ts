import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Aba } from './aba';
import { Abas } from './abas';

@Component({
  imports: [Abas, Aba],
  template: `
    <app-abas rotuloAcessivel="Situacao dos pedidos" [(selecionada)]="ativa">
      <app-aba rotulo="Em andamento"><p class="c1">um</p></app-aba>
      <app-aba rotulo="Concluidos" [desabilitada]="segundaInerte()">
        <p class="c2">dois</p>
      </app-aba>
      <app-aba rotulo="Todos"><p class="c3">tres</p></app-aba>
    </app-abas>
  `,
})
class Hospedeiro {
  readonly ativa = signal(0);
  readonly segundaInerte = signal(false);
}

function montar(): {
  fixture: ComponentFixture<Hospedeiro>;
  raiz: HTMLElement;
  hospedeiro: Hospedeiro;
  gatilhos: () => HTMLButtonElement[];
  paineis: () => HTMLElement[];
} {
  const fixture = TestBed.createComponent(Hospedeiro);
  fixture.detectChanges();
  const raiz = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    raiz,
    hospedeiro: fixture.componentInstance,
    gatilhos: () =>
      Array.from(raiz.querySelectorAll<HTMLButtonElement>('[role="tab"]')),
    paineis: () =>
      Array.from(raiz.querySelectorAll<HTMLElement>('[role="tabpanel"]')),
  };
}

function teclar(alvo: HTMLElement, key: string): void {
  alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('Abas', () => {
  it('desenha uma aba por painel, com o rotulo de cada um', () => {
    const { gatilhos } = montar();

    expect(gatilhos().map((g) => g.textContent?.trim())).toEqual([
      'Em andamento',
      'Concluidos',
      'Todos',
    ]);
  });

  it('a lista de abas se anuncia com nome proprio', () => {
    const lista = montar().raiz.querySelector('[role="tablist"]');

    expect(lista?.getAttribute('aria-label')).toBe('Situacao dos pedidos');
  });

  /**
   * `aria-controls` e `aria-labelledby` formam o par que liga aba e painel nos
   * dois sentidos. Sem ele, o leitor de tela chega ao painel sem saber de qual
   * aba ele veio.
   */
  it('liga cada aba ao seu painel nos dois sentidos', () => {
    const { gatilhos, paineis } = montar();

    gatilhos().forEach((gatilho, i) => {
      expect(gatilho.getAttribute('aria-controls')).toBe(paineis()[i].id);
      expect(paineis()[i].getAttribute('aria-labelledby')).toBe(gatilho.id);
    });
  });

  it('mostra so o painel da aba ativa', () => {
    const { paineis, gatilhos, fixture } = montar();
    expect(paineis().map((p) => p.hidden)).toEqual([false, true, true]);

    gatilhos()[2].click();
    fixture.detectChanges();

    expect(paineis().map((p) => p.hidden)).toEqual([true, true, false]);
  });

  /**
   * O painel fica no DOM escondido por `hidden`, e nao e destruido: um formulario
   * meio preenchido numa aba nao pode se apagar porque a pessoa foi conferir
   * outra aba e voltou.
   */
  it('mantem o conteudo das abas inativas no DOM', () => {
    const { raiz } = montar();

    expect(raiz.querySelector('.c2')).not.toBeNull();
    expect(raiz.querySelector('.c3')).not.toBeNull();
  });

  describe('teclado', () => {
    /**
     * A lista inteira ocupa UMA parada de tabulacao. Sem isso, um painel com seis
     * abas obriga a apertar Tab seis vezes so para chegar ao conteudo.
     */
    it('so a aba ativa entra na ordem de tabulacao', () => {
      const { gatilhos, fixture } = montar();
      expect(gatilhos().map((g) => g.tabIndex)).toEqual([0, -1, -1]);

      gatilhos()[1].click();
      fixture.detectChanges();

      expect(gatilhos().map((g) => g.tabIndex)).toEqual([-1, 0, -1]);
    });

    it('anda com as setas e leva o foco junto', () => {
      const { gatilhos, hospedeiro, fixture } = montar();

      teclar(gatilhos()[0], 'ArrowRight');
      fixture.detectChanges();
      expect(hospedeiro.ativa()).toBe(1);
      expect(document.activeElement).toBe(gatilhos()[1]);

      teclar(gatilhos()[1], 'ArrowLeft');
      fixture.detectChanges();
      expect(hospedeiro.ativa()).toBe(0);
    });

    it('percorre em circulo', () => {
      const { gatilhos, hospedeiro, fixture } = montar();

      teclar(gatilhos()[0], 'ArrowLeft');
      fixture.detectChanges();

      expect(hospedeiro.ativa()).toBe(2);
    });

    it('Home e End vao aos extremos', () => {
      const { gatilhos, hospedeiro, fixture } = montar();

      teclar(gatilhos()[0], 'End');
      fixture.detectChanges();
      expect(hospedeiro.ativa()).toBe(2);

      teclar(gatilhos()[2], 'Home');
      fixture.detectChanges();
      expect(hospedeiro.ativa()).toBe(0);
    });

    /**
     * Uma aba desabilitada que engole a seta e uma parede: a pessoa aperta, nada
     * acontece, e nao ha como descobrir que existem abas depois dela.
     */
    it('pula a aba desabilitada em vez de parar nela', () => {
      const { gatilhos, hospedeiro, fixture } = montar();
      hospedeiro.segundaInerte.set(true);
      fixture.detectChanges();

      teclar(gatilhos()[0], 'ArrowRight');
      fixture.detectChanges();

      expect(hospedeiro.ativa()).toBe(2);
    });

    it('nao seleciona aba desabilitada por clique', () => {
      const { gatilhos, hospedeiro, fixture } = montar();
      hospedeiro.segundaInerte.set(true);
      fixture.detectChanges();

      gatilhos()[1].click();
      fixture.detectChanges();

      expect(hospedeiro.ativa()).toBe(0);
    });

    it('ignora teclas que nao sao de navegacao', () => {
      const { gatilhos, hospedeiro, fixture } = montar();

      teclar(gatilhos()[0], 'a');
      fixture.detectChanges();

      expect(hospedeiro.ativa()).toBe(0);
    });

    /**
     * Grupo em que TODAS as abas estao desabilitadas: a seta nao tem para onde
     * ir. Sem o caso, a busca circular percorreria a lista inteira e cairia num
     * indice invalido em vez de simplesmente nao se mover.
     */
    it('nao se move quando nao ha nenhuma aba habilitada', () => {
      const fixture = TestBed.createComponent(TodasInertes);
      fixture.detectChanges();
      const raiz = fixture.nativeElement as HTMLElement;
      const gatilhos = Array.from(
        raiz.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      );

      teclar(gatilhos[0], 'ArrowRight');
      fixture.detectChanges();

      expect(gatilhos[0].getAttribute('aria-selected')).toBe('true');
    });
  });

  it('anuncia qual aba esta selecionada', () => {
    const { gatilhos } = montar();

    expect(gatilhos().map((g) => g.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
  });
});

@Component({
  imports: [Abas, Aba],
  template: `
    <app-abas rotuloAcessivel="Tudo indisponivel">
      <app-aba rotulo="Uma" [desabilitada]="true"><p>um</p></app-aba>
      <app-aba rotulo="Duas" [desabilitada]="true"><p>dois</p></app-aba>
    </app-abas>
  `,
})
class TodasInertes {}
