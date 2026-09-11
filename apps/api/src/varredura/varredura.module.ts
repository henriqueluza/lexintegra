import { Global, Logger, Module } from '@nestjs/common';
import { criarFila } from '../tarefas/criar-fila.js';
import {
  CAMINHO_DA_VARREDURA,
  FILA_DE_VARREDURA,
  type TarefaDeVarredura,
} from './fila.js';
import { HttpScanner } from './http.scanner.js';
import { SCANNER, ScannerFalso, type Scanner } from './scanner.js';
import { VarreduraController } from './varredura.controller.js';
import { VarreduraService } from './varredura.service.js';

/**
 * A fila da varredura. O mecanismo e de `tarefas/`; o que fica aqui e a decisao
 * de qual variavel de ambiente carrega o nome dela e o que quebra sem ela.
 */
export const PEDIDO_DA_FILA = {
  variavelDaFila: 'FILA_VARREDURA',
  caminho: CAMINHO_DA_VARREDURA,
  rotulo: 'Varredura',
  consequencia:
    'a API aceitaria uploads, responderia 202 e nunca varreria nada — os ' +
    'arquivos ficariam para sempre em `pendente_scan`, que o portao recusa servir.',
} as const;

export function criarScanner(
  ambiente: NodeJS.ProcessEnv = process.env,
): Scanner {
  const url = ambiente['URL_SCANNER'];
  const producao = ambiente['NODE_ENV'] === 'production';

  if (url === undefined || url === '') {
    if (producao) {
      throw new Error(
        'URL_SCANNER e obrigatoria em producao. Recusando subir com um scanner ' +
          'que aprova tudo.',
      );
    }
    new Logger('Varredura').warn(
      'Sem URL_SCANNER: usando o scanner falso, que responde `limpo`.',
    );
    return new ScannerFalso();
  }

  return new HttpScanner(url);
}

/*
 * Continua `@Global()`: a fila e usada por `anexos` e por `entregaveis`, e
 * importa-la em cada um seria fiacao repetida sem fronteira a mais. O que saiu
 * daqui na Etapa 7 foi o `TarefaGuard`, que virou `TarefasModule` quando o outbox
 * passou a precisar dele tambem.
 */
@Global()
@Module({
  controllers: [VarreduraController],
  providers: [
    VarreduraService,
    {
      provide: FILA_DE_VARREDURA,
      useFactory: () => criarFila<TarefaDeVarredura>(PEDIDO_DA_FILA),
    },
    { provide: SCANNER, useFactory: () => criarScanner() },
  ],
  exports: [FILA_DE_VARREDURA, SCANNER, VarreduraService],
})
export class VarreduraModule {}
