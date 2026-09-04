import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Botao, type VarianteBotao } from './botao';

@Component({
  imports: [Botao],
  template: `
    <app-botao
      [variante]="variante"
      [tamanho]="tamanho"
      [tipo]="tipo"
      [desabilitado]="desabilitado"
      [carregando]="carregando"
      [icone]="icone"
      (click)="cliques.set(cliques() + 1)"
    >
      Contratar
    </app-botao>
  `,
})
class Hospedeiro {
  variante: VarianteBotao = 'secundario';
  tamanho: 'md' | 'p' = 'md';
  tipo: 'button' | 'submit' | 'reset' = 'button';
  desabilitado = false;
  carregando = false;
  icone: 'confere' | null = null;
  readonly cliques = signal(0);
}

function montar(ajuste: Partial<Hospedeiro> = {}): {
  raiz: HTMLElement;
  botao: HTMLButtonElement;
  hospedeiro: Hospedeiro;
} {
  const fixture = TestBed.createComponent(Hospedeiro);
  Object.assign(fixture.componentInstance, ajuste);
  fixture.detectChanges();
  const raiz = fixture.nativeElement as HTMLElement;
  return {
    raiz,
    botao: raiz.querySelector('button') as HTMLButtonElement,
    hospedeiro: fixture.componentInstance,
  };
}

describe('Botao', () => {
  it('projeta o rotulo', () => {
    expect(montar().botao.textContent?.trim()).toBe('Contratar');
  });

  /**
   * Sem `type` explicito, um `<button>` dentro de `<form>` e `type="submit"` por
   * padrao — e o botao "Cancelar" de um formulario passa a envia-lo.
   */
  it('nasce como button, nao como submit', () => {
    expect(montar().botao.getAttribute('type')).toBe('button');
    expect(montar({ tipo: 'submit' }).botao.getAttribute('type')).toBe(
      'submit',
    );
  });

  it('aplica a variante e o tamanho pedidos', () => {
    expect(montar({ variante: 'primario' }).botao.classList).toContain(
      'botao--primario',
    );
    expect(montar({ tamanho: 'p' }).botao.classList).toContain('botao--p');
  });

  it('mostra o icone quando ha um, e nada quando nao ha', () => {
    expect(
      montar({ icone: 'confere' }).raiz.querySelector('svg'),
    ).not.toBeNull();
    expect(montar().raiz.querySelector('svg')).toBeNull();
  });

  describe('desabilitado', () => {
    it('fica inerte pelo atributo nativo', () => {
      const { botao } = montar({ desabilitado: true });

      expect(botao.disabled).toBe(true);
      expect(botao.getAttribute('aria-busy')).toBeNull();
    });
  });

  describe('carregando', () => {
    /**
     * O ponto do estado. Se `carregando` usasse `disabled`, o navegador tiraria o
     * foco do botao que a pessoa acabou de acionar e ele cairia no `<body>` —
     * quem usa teclado ou leitor de tela perde a posicao no meio do envio.
     */
    it('continua focavel, para nao perder o foco no meio do envio', () => {
      const { botao } = montar({ carregando: true });

      expect(botao.disabled).toBe(false);
      botao.focus();
      expect(document.activeElement).toBe(botao);
    });

    it('anuncia ocupado e indisponivel ao leitor de tela', () => {
      const { botao } = montar({ carregando: true });

      expect(botao.getAttribute('aria-busy')).toBe('true');
      expect(botao.getAttribute('aria-disabled')).toBe('true');
    });

    it('troca o icone pelo indicador de giro', () => {
      const { raiz } = montar({ carregando: true, icone: 'confere' });

      expect(raiz.querySelector('.botao__giro')).not.toBeNull();
      expect(raiz.querySelector('svg')).toBeNull();
    });

    /**
     * Como o botao continua clicavel pelo navegador, a barreira precisa estar no
     * manipulador — e precisa parar a propagacao, ou o clique sobe ate o
     * `(click)` que o consumidor pos no proprio `<app-botao>`.
     */
    it('engole o clique em vez de deixar a acao disparar duas vezes', () => {
      const { botao, hospedeiro } = montar({ carregando: true });

      botao.click();

      expect(hospedeiro.cliques()).toBe(0);
    });

    it('deixa o clique passar quando nao esta carregando', () => {
      const { botao, hospedeiro } = montar();

      botao.click();

      expect(hospedeiro.cliques()).toBe(1);
    });
  });

  it('aceita nome acessivel para o botao que so tem icone', () => {
    const fixture = TestBed.createComponent(BotaoSoIcone);
    fixture.detectChanges();
    const botao = (fixture.nativeElement as HTMLElement).querySelector(
      'button',
    );

    expect(botao?.getAttribute('aria-label')).toBe('Fechar');
  });
});

@Component({
  imports: [Botao],
  template: `<app-botao icone="fecha" rotuloAcessivel="Fechar" />`,
})
class BotaoSoIcone {}
