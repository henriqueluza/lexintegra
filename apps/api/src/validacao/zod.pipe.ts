import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida o corpo da requisicao com um schema de `packages/shared`.
 *
 * Zod, e nao `class-validator`: o schema precisa ser o MESMO nos dois lados, e
 * `class-validator` valida decorando uma classe, que so existe no backend. Com um
 * schema compartilhado, a interface e o servidor recusam pelas mesmas razoes, e
 * `z.infer` da o tipo de graca em vez de uma classe DTO duplicada.
 *
 * O pipe devolve o valor ANALISADO, nao o original: e o que faz as normalizacoes
 * do schema (`trim`, `toLowerCase`) valerem de verdade. Um pipe que so verifica e
 * repassa o objeto cru deixa o e-mail chegar ao Auth com a caixa que o cliente
 * mandou.
 */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}

  transform(valor: unknown): T {
    const resultado = this.esquema.safeParse(valor);
    if (resultado.success) return resultado.data;

    /*
     * Mensagem por campo, e nao um texto unico: a tela do administrador precisa
     * mostrar o erro embaixo do campo certo. O `path` vem do proprio Zod, entao
     * nao ha lista de campos duplicada aqui para envelhecer.
     *
     * O VALOR RECUSADO NAO ENTRA NA RESPOSTA. O Zod nao o inclui por padrao, e e
     * bom que nao: o corpo pode conter dado pessoal, e ecoa-lo numa mensagem de
     * erro o coloca em log de cliente e em rastreamento de erro (LGPD).
     */
    const erros: Record<string, string> = {};
    for (const problema of resultado.error.issues) {
      const campo = problema.path.join('.') || '(corpo)';
      erros[campo] ??= problema.message;
    }

    throw new BadRequestException({
      mensagem: 'Dados invalidos.',
      erros,
    });
  }
}
