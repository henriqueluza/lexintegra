import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { NovoPreCadastro } from 'shared';
import { AppCheckService } from '../../../autenticacao/app-check';
import { PreCadastroService } from '../../../publico/pre-cadastro.service';
import { TEXTOS } from '../textos';
import { Cadastro } from './cadastro';

const liberado = signal(false);
let enviados: NovoPreCadastro[] = [];
let preparacoes = 0;
let recusa: unknown = null;

function montar(): ComponentFixture<Cadastro> {
  liberado.set(false);
  enviados = [];
  preparacoes = 0;
  recusa = null;

  TestBed.configureTestingModule({
    imports: [Cadastro],
    providers: [
      {
        provide: PreCadastroService,
        useValue: {
          liberado,
          enviar: (dados: NovoPreCadastro) => {
            if (recusa !== null) return Promise.reject(recusa);
            enviados.push(dados);
            liberado.set(true);
            return Promise.resolve();
          },
        },
      },
      {
        provide: AppCheckService,
        useValue: {
          preparar: () => {
            preparacoes += 1;
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(Cadastro);
  fixture.detectChanges();
  return fixture;
}

function campo(
  fixture: ComponentFixture<Cadastro>,
  indice: number,
): HTMLInputElement {
  return (fixture.nativeElement as HTMLElement).querySelectorAll('input')[
    indice
  ] as HTMLInputElement;
}

function digitar(
  fixture: ComponentFixture<Cadastro>,
  valores: [string, string, string],
): void {
  valores.forEach((valor, indice) => {
    const entrada = campo(fixture, indice);
    entrada.value = valor;
    entrada.dispatchEvent(new Event('input'));
  });
  fixture.detectChanges();
}

async function enviar(fixture: ComponentFixture<Cadastro>): Promise<void> {
  const formulario = (fixture.nativeElement as HTMLElement).querySelector(
    'form',
  ) as HTMLFormElement;
  formulario.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
}

function texto(fixture: ComponentFixture<Cadastro>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const VALIDOS: [string, string, string] = [
  'Ana Ribeiro Salgado',
  'ana@empresa.com.br',
  '(61) 99000-0000',
];

describe('Cadastro', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('mostra os tres campos e mais nenhum', () => {
    const fixture = montar();

    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('input'),
    ).toHaveLength(3);
  });

  /**
   * REGRA INVIOLAVEL 10. Montar o formulario nao pode disparar chamada nenhuma —
   * nem para verificar disponibilidade, nem para pre-carregar coisa alguma. Aqui
   * a garantia e que o servico so e tocado no envio.
   */
  it('nao envia nada ao ser montado', () => {
    montar();

    expect(enviados).toEqual([]);
  });

  it('envia os tres campos', async () => {
    const fixture = montar();
    digitar(fixture, VALIDOS);

    await enviar(fixture);

    expect(enviados).toEqual([
      {
        nome: 'Ana Ribeiro Salgado',
        email: 'ana@empresa.com.br',
        telefone: '(61) 99000-0000',
      },
    ]);
  });

  it('nao envia formulario invalido', async () => {
    const fixture = montar();
    digitar(fixture, ['An', 'nao-e-email', '123']);

    await enviar(fixture);

    expect(enviados).toEqual([]);
  });

  it.each([
    [
      'nome curto',
      ['An', ...VALIDOS.slice(1)] as [string, string, string],
      'Informe o nome completo.',
    ],
    [
      'e-mail torto',
      [VALIDOS[0], 'nao-e-email', VALIDOS[2]] as [string, string, string],
      'Informe um e-mail válido.',
    ],
    [
      'telefone curto',
      [VALIDOS[0], VALIDOS[1], '61990'] as [string, string, string],
      'Informe um telefone com DDD.',
    ],
  ])('acusa %s', async (_nome, valores, mensagem) => {
    const fixture = montar();
    digitar(fixture, valores);

    await enviar(fixture);

    expect(texto(fixture)).toContain(mensagem);
  });

  /**
   * O DDD e conferido no navegador com a MESMA funcao que o schema do servidor
   * usa (`shared/telefone`). Um numero com DDD inexistente e recusado antes de
   * gastar uma requisicao.
   */
  it('recusa DDD que nao existe', async () => {
    const fixture = montar();
    digitar(fixture, [VALIDOS[0], VALIDOS[1], '(20) 99000-0000']);

    await enviar(fixture);

    expect(enviados).toEqual([]);
  });

  /**
   * O App Check so comeca a carregar quando alguem toca no formulario — nao ao
   * abrir a pagina. Quem so le a home nao tem o IP enviado ao Google, pelo mesmo
   * raciocinio que o ADR-14 usou contra o Analytics.
   */
  it('prepara a verificacao no primeiro foco, e nao antes', () => {
    const fixture = montar();
    expect(preparacoes).toBe(0);

    campo(fixture, 0).dispatchEvent(new Event('focusin', { bubbles: true }));

    expect(preparacoes).toBe(1);
  });

  it('mostra a confirmacao depois de liberar', async () => {
    const fixture = montar();
    digitar(fixture, VALIDOS);

    await enviar(fixture);

    expect(texto(fixture)).toContain(TEXTOS.cadastro.concluido.titulo);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('form'),
    ).toBeNull();
  });

  describe('recusa do servidor', () => {
    /**
     * O servidor valida de novo e pode recusar o que o formulario aceitou. Levar
     * o erro para o CAMPO evita a tela dizer "algo deu errado" sobre um telefone
     * com um digito trocado.
     */
    it('leva o erro de campo para o campo', async () => {
      const fixture = montar();
      recusa = new HttpErrorResponse({
        status: 400,
        error: { erros: { telefone: 'Informe um telefone com DDD.' } },
      });
      digitar(fixture, VALIDOS);

      await enviar(fixture);

      expect(texto(fixture)).toContain('Informe um telefone com DDD.');
      expect(texto(fixture)).not.toContain(TEXTOS.cadastro.falhaGenerica);
    });

    it('explica o excesso de tentativas', async () => {
      const fixture = montar();
      recusa = new HttpErrorResponse({ status: 429 });
      digitar(fixture, VALIDOS);

      await enviar(fixture);

      expect(texto(fixture)).toContain(TEXTOS.cadastro.falhaExcesso);
    });

    it.each([
      ['erro de rede', new HttpErrorResponse({ status: 0 })],
      ['erro do servidor', new HttpErrorResponse({ status: 500 })],
      ['excecao qualquer', new Error('boom')],
    ])('cai na mensagem generica com %s', async (_nome, erro) => {
      const fixture = montar();
      recusa = erro;
      digitar(fixture, VALIDOS);

      await enviar(fixture);

      expect(texto(fixture)).toContain(TEXTOS.cadastro.falhaGenerica);
    });

    it('continua mostrando o formulario para a pessoa tentar de novo', async () => {
      const fixture = montar();
      recusa = new HttpErrorResponse({ status: 500 });
      digitar(fixture, VALIDOS);

      await enviar(fixture);

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('form'),
      ).not.toBeNull();
    });
  });

  /**
   * O aviso de privacidade fica NA TELA DE COLETA, nao atras de um link para
   * outra pagina (arquitetura, secao 6, fronteira 1).
   */
  it('mostra o aviso de privacidade junto do formulario', () => {
    const fixture = montar();

    expect(texto(fixture)).toContain(TEXTOS.privacidade.resumo);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'app-aviso-privacidade',
      ),
    ).not.toBeNull();
  });
});
