import { BadRequestException } from '@nestjs/common';
import { esquemaNovoAdvogado } from 'shared';
import { z } from 'zod';
import { ZodPipe } from './zod.pipe.js';

describe('ZodPipe', () => {
  const pipe = new ZodPipe(esquemaNovoAdvogado);

  it('devolve o valor ANALISADO, com as normalizacoes aplicadas', () => {
    expect(
      pipe.transform({ nome: '  Ana Souza ', email: 'ANA@X.TEST' }),
    ).toEqual({ nome: 'Ana Souza', email: 'ana@x.test' });
  });

  it('recusa entrada invalida com 400', () => {
    expect(() => pipe.transform({ nome: 'An', email: 'x' })).toThrow(
      BadRequestException,
    );
  });

  it('aponta o erro no campo, para a tela mostrar embaixo dele', () => {
    try {
      pipe.transform({ nome: 'An', email: 'nao-e-email' });
      throw new Error('deveria ter recusado');
    } catch (erro) {
      const corpo = (erro as BadRequestException).getResponse() as {
        erros: Record<string, string>;
      };
      expect(Object.keys(corpo.erros).sort()).toEqual(['email', 'nome']);
      expect(corpo.erros['email']).toBe('Informe um e-mail valido.');
    }
  });

  /**
   * O corpo da requisicao pode conter dado pessoal. Ecoar o valor recusado numa
   * mensagem de erro o coloca em log de cliente e em rastreamento de erro (LGPD).
   */
  it('nao devolve o valor recusado', () => {
    try {
      pipe.transform({ nome: 'An', email: 'fulano.secreto@dominio.test' });
      throw new Error('deveria ter recusado');
    } catch (erro) {
      const corpo = JSON.stringify((erro as BadRequestException).getResponse());
      expect(corpo).not.toMatch(/fulano\.secreto/);
    }
  });

  it('nomeia o erro de corpo inteiro quando nao ha campo', () => {
    const pipeDeTexto = new ZodPipe(z.string());
    try {
      pipeDeTexto.transform(42);
      throw new Error('deveria ter recusado');
    } catch (erro) {
      const corpo = (erro as BadRequestException).getResponse() as {
        erros: Record<string, string>;
      };
      expect(Object.keys(corpo.erros)).toEqual(['(corpo)']);
    }
  });

  /**
   * Caminho aninhado vira `a.b`, que e o nome que o formulario usa para achar o
   * campo. Sem o `join`, um erro em objeto aninhado chegaria a tela como
   * `["a","b"]` e nao casaria com controle nenhum.
   */
  it('junta caminho aninhado com ponto', () => {
    const pipeAninhado = new ZodPipe(
      z.object({ endereco: z.object({ cep: z.string().min(8) }) }),
    );
    try {
      pipeAninhado.transform({ endereco: { cep: '123' } });
      throw new Error('deveria ter recusado');
    } catch (erro) {
      const corpo = (erro as BadRequestException).getResponse() as {
        erros: Record<string, string>;
      };
      expect(Object.keys(corpo.erros)).toEqual(['endereco.cep']);
    }
  });
});
