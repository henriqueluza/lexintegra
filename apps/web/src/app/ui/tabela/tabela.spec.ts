import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
  type LinhaTabela,
} from './tabela';

const COLUNAS: readonly ColunaTabela[] = [
  { chave: 'nome', rotulo: 'Entregavel' },
  { chave: 'estado', rotulo: 'Estado' },
  { chave: 'prazo', rotulo: 'Prazo', alinhamento: 'fim' },
];

const LINHAS: readonly LinhaTabela[] = [
  { nome: 'Relatorio de exposicao', estado: 'em_revisao', prazo: '12/09' },
  { nome: 'Plano de correcao', estado: 'solicitado', prazo: '20/09' },
];

@Component({
  imports: [Tabela],
  template: `
    <app-tabela
      [colunas]="COLUNAS"
      [linhas]="linhas()"
      legenda="Entregaveis do pedido"
      [carregando]="carregando()"
      [mensagemVazia]="mensagemVazia()"
    >
      <button appTabelaAcaoVazio type="button" class="acao">Contratar</button>
    </app-tabela>
  `,
})
class Simples {
  readonly linhas = input<readonly LinhaTabela[]>(LINHAS);
  readonly carregando = input(false);
  readonly mensagemVazia = input('Nada por aqui ainda.');
  protected readonly COLUNAS = COLUNAS;
}

@Component({
  imports: [Tabela, CelulaTabela],
  template: `
    <app-tabela [colunas]="COLUNAS" [linhas]="LINHAS" legenda="Entregaveis">
      <ng-template appCelulaTabela let-linha let-coluna="coluna">
        <span class="celula">{{ coluna.chave }}={{ linha[coluna.chave] }}</span>
      </ng-template>
    </app-tabela>
  `,
})
class ComTemplate {
  protected readonly COLUNAS = COLUNAS;
  protected readonly LINHAS = LINHAS;
}

function montar(entradas: Record<string, unknown> = {}): HTMLElement {
  const fixture = TestBed.createComponent(Simples);
  for (const [chave, valor] of Object.entries(entradas)) {
    fixture.componentRef.setInput(chave, valor);
  }
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Tabela', () => {
  describe('com dados', () => {
    it('desenha cabecalho e linhas', () => {
      const el = montar();

      expect(
        Array.from(el.querySelectorAll('th')).map((t) => t.textContent?.trim()),
      ).toEqual(['Entregavel', 'Estado', 'Prazo']);
      expect(el.querySelectorAll('tbody tr').length).toBe(2);
    });

    it('cai no texto da chave quando nao ha template de celula', () => {
      const celulas = montar().querySelectorAll('tbody tr:first-child td');

      expect(celulas[0].textContent?.trim()).toBe('Relatorio de exposicao');
      expect(celulas[2].textContent?.trim()).toBe('12/09');
    });

    it('usa o template de celula quando ha um', () => {
      const fixture = TestBed.createComponent(ComTemplate);
      fixture.detectChanges();
      const celulas = (fixture.nativeElement as HTMLElement).querySelectorAll(
        'tbody tr:first-child .celula',
      );

      expect(celulas.length).toBe(3);
      expect(celulas[1].textContent).toBe('estado=em_revisao');
    });

    /**
     * Celula sem valor precisa virar celula vazia, nao a string "undefined" — que
     * e o que `String(undefined)` produziria, e que ja apareceu em producao em
     * mais de um sistema.
     */
    it('desenha celula vazia quando o dado nao existe', () => {
      const el = montar({ linhas: [{ nome: 'Sem estado', estado: null }] });
      const celulas = el.querySelectorAll('tbody tr:first-child td');

      expect(celulas[1].textContent?.trim()).toBe('');
      expect(celulas[2].textContent?.trim()).toBe('');
    });

    /**
     * Uma tabela sem nome acessivel chega ao leitor de tela como "tabela, 3
     * colunas, 2 linhas" e nada mais. A legenda fica oculta na tela para nao
     * mudar o desenho, mas existe no DOM.
     */
    it('tem nome acessivel pela legenda, invisivel na tela', () => {
      const legenda = montar().querySelector('caption');

      expect(legenda?.textContent?.trim()).toBe('Entregaveis do pedido');
      expect(legenda?.classList).toContain('visualmente-oculto');
    });

    /**
     * `scope="col"` e o que permite ao leitor anunciar o cabecalho junto de cada
     * celula. Sem ele a pessoa ouve "Em revisao" sem saber que aquilo e a coluna
     * de estado.
     */
    it('declara o escopo de cada cabecalho', () => {
      const escopos = Array.from(montar().querySelectorAll('th')).map((t) =>
        t.getAttribute('scope'),
      );

      expect(escopos).toEqual(['col', 'col', 'col']);
    });

    /**
     * Em tela estreita o cabecalho some e o rotulo passa a acompanhar cada
     * celula. O atributo e escrito pelo componente, nao pelo consumidor, para nao
     * existir tabela que esquece de ser responsiva.
     */
    it('carrega o rotulo da coluna em cada celula, para o empilhamento', () => {
      const celulas = montar().querySelectorAll('tbody tr:first-child td');

      expect(celulas[1].getAttribute('data-rotulo')).toBe('Estado');
    });
  });

  describe('carregando', () => {
    it('mostra o esqueleto no lugar da grade', () => {
      const el = montar({ carregando: true });

      expect(el.querySelector('table')).toBeNull();
      expect(el.querySelector('[role="status"]')).not.toBeNull();
    });

    it('o anuncio de carregamento diz o que esta carregando', () => {
      expect(montar({ carregando: true }).textContent).toContain(
        'Carregando Entregaveis do pedido',
      );
    });
  });

  describe('vazia', () => {
    it('mostra o estado vazio no lugar da grade', () => {
      const el = montar({ linhas: [] });

      expect(el.querySelector('table')).toBeNull();
      expect(el.textContent).toContain('Nada por aqui ainda.');
    });

    it('usa a mensagem que o consumidor deu', () => {
      expect(
        montar({ linhas: [], mensagemVazia: 'Nenhum entregavel ainda.' })
          .textContent,
      ).toContain('Nenhum entregavel ainda.');
    });

    it('projeta a acao que tira a pessoa do vazio', () => {
      expect(montar({ linhas: [] }).querySelector('.acao')).not.toBeNull();
    });
  });

  it('carregando vence vazia: lista vazia durante a busca nao e ausencia', () => {
    const el = montar({ linhas: [], carregando: true });

    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Nada por aqui ainda.');
  });
});
