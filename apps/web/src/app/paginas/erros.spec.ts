import { HttpErrorResponse } from '@angular/common/http';
import { mensagemDoErro } from './erros';

describe('mensagemDoErro', () => {
  it('sem resposta HTTP, e a generica', () => {
    expect(mensagemDoErro(new Error('x'))).toBe(
      'Não foi possível concluir a operação.',
    );
  });

  it('a especifica da tela vence a generica do status', () => {
    const erro = new HttpErrorResponse({ status: 409 });
    expect(mensagemDoErro(erro)).toBe('Já existe um registro equivalente.');
    expect(mensagemDoErro(erro, { 409: 'Ja comecou.' })).toBe('Ja comecou.');
  });

  /** B2: o motivo do servidor vence o texto da tela, que so conhece um caso. */
  it('o motivo do pedido vence a especifica', () => {
    const erro = new HttpErrorResponse({
      status: 409,
      error: { motivo: 'contestacao-aberta' },
    });
    expect(mensagemDoErro(erro, { 409: 'Ja comecou.' })).toMatch(/contestação/);
  });

  it('motivo desconhecido e ignorado', () => {
    const erro = new HttpErrorResponse({
      status: 409,
      error: { motivo: 'inventado' },
    });
    expect(mensagemDoErro(erro)).toBe('Já existe um registro equivalente.');
  });

  it('400 do schema mostra a primeira mensagem', () => {
    const erro = new HttpErrorResponse({
      status: 400,
      error: { erros: { nome: 'Informe o nome.' } },
    });
    expect(mensagemDoErro(erro)).toBe('Informe o nome.');
  });
});
