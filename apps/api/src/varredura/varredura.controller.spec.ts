import { jest } from '@jest/globals';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import type { TarefaDeVarredura } from './fila.js';
import { VarreduraController } from './varredura.controller.js';
import type { VarreduraService } from './varredura.service.js';

const TAREFA: TarefaDeVarredura = {
  fluxo: 'anexo-cliente',
  pedidoId: 'pedido-1',
  alvoId: 'anexo-1',
  caminho: 'anexos/pedido-1/anexo-1',
};

function montar(): {
  controlador: VarreduraController;
  processar: jest.Mock<VarreduraService['processar']>;
} {
  const processar = jest
    .fn<VarreduraService['processar']>()
    .mockResolvedValue('limpo');

  return {
    controlador: new VarreduraController({
      processar,
    } as unknown as VarreduraService),
    processar,
  };
}

/**
 * A tentativa do Cloud Tasks chega por cabecalho e so alimenta a medicao (lote
 * de novembro, ajuste 13). As anotacoes de seguranca da rota estao em
 * `controladores.spec.ts`; aqui e so o repasse.
 */
describe('VarreduraController', () => {
  it('devolve o estado que o servico decidiu', async () => {
    const { controlador } = montar();

    await expect(controlador.processar(TAREFA)).resolves.toEqual({
      estado: 'limpo',
    });
  });

  it('repassa a tentativa lida do cabecalho, como numero', async () => {
    const { controlador, processar } = montar();

    await controlador.processar(TAREFA, '2');

    expect(processar).toHaveBeenCalledWith(TAREFA, 2);
  });

  it('sem o cabecalho, a tentativa e desconhecida', async () => {
    const { controlador, processar } = montar();

    await controlador.processar(TAREFA);

    expect(processar).toHaveBeenCalledWith(TAREFA, null);
  });

  it.each([['-1'], ['dois'], ['1; DROP'], ['99999']])(
    'cabecalho estranho (%s) nao vira numero',
    async (valor) => {
      const { controlador, processar } = montar();

      await controlador.processar(TAREFA, valor);

      expect(processar).toHaveBeenCalledWith(TAREFA, null);
    },
  );

  /** O nome do cabecalho e do Cloud Tasks; um erro de digitacao aqui nao quebra nada, so cega a medicao. */
  it('le o cabecalho `x-cloudtasks-taskretrycount`', () => {
    const argumentos = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      VarreduraController,
      'processar',
    ) as Record<string, { data?: unknown }>;

    const cabecalhos = Object.entries(argumentos)
      .filter(([chave]) =>
        chave.startsWith(`${String(RouteParamtypes.HEADERS)}:`),
      )
      .map(([, valor]) => valor.data);

    expect(cabecalhos).toEqual(['x-cloudtasks-taskretrycount']);
  });
});
