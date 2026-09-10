import { Global, Logger, Module } from '@nestjs/common';
import { CloudTasksFila } from './cloud-tasks.fila.js';
import { FILA_DE_VARREDURA, FilaFalsa, type FilaDeVarredura } from './fila.js';
import { HttpScanner } from './http.scanner.js';
import { SCANNER, ScannerFalso, type Scanner } from './scanner.js';
import { TarefaGuard } from './tarefa.guard.js';
import { VarreduraController } from './varredura.controller.js';
import { VarreduraService } from './varredura.service.js';
import { APP_GUARD } from '@nestjs/core';

/**
 * Fila e scanner de verdade em producao; falsos fora dela.
 *
 * A MESMA REGRA DO E-MAIL E DO ARMAZENAMENTO: em producao, configuracao ausente e
 * erro de inicializacao. Um servico que sobe com fila falsa aceita uploads,
 * responde 202 e nunca varre nada — e os arquivos ficam para sempre em
 * `pendente_scan`, que o portao recusa servir. O cliente veria "processando" sem
 * fim, e nada no log diria por que.
 */
export function criarFila(
  ambiente: NodeJS.ProcessEnv = process.env,
): FilaDeVarredura {
  const projeto = ambiente['GCP_PROJECT_ID'];
  const regiao = ambiente['GCP_REGION'];
  const fila = ambiente['FILA_VARREDURA'];
  const url = ambiente['URL_APLICACAO'];
  const conta = ambiente['SERVICE_ACCOUNT_TAREFAS'];
  const producao = ambiente['NODE_ENV'] === 'production';

  const valores = [projeto, regiao, fila, url, conta];
  if (valores.some((valor) => valor === undefined || valor === '')) {
    if (producao) {
      throw new Error(
        'GCP_REGION, FILA_VARREDURA, URL_APLICACAO e SERVICE_ACCOUNT_TAREFAS ' +
          'sao obrigatorios em producao. Recusando subir com uma fila que nao varre.',
      );
    }
    new Logger('Varredura').warn(
      'Sem configuracao de Cloud Tasks: usando a fila falsa. Nada e varrido.',
    );
    return new FilaFalsa();
  }

  return new CloudTasksFila({
    projeto: projeto as string,
    regiao: regiao as string,
    fila: fila as string,
    urlDoAlvo: url as string,
    contaDeServico: conta as string,
  });
}

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

@Global()
@Module({
  controllers: [VarreduraController],
  providers: [
    VarreduraService,
    { provide: FILA_DE_VARREDURA, useFactory: () => criarFila() },
    { provide: SCANNER, useFactory: () => criarScanner() },
    /*
     * Guard GLOBAL, como os de autenticacao e limite. Ele so age nas rotas
     * anotadas com `@TarefaInterna()` — mas registrado globalmente, uma rota
     * interna nova que esqueca o `@UseGuards` continua protegida assim que
     * receber a anotacao.
     */
    { provide: APP_GUARD, useClass: TarefaGuard },
  ],
  exports: [FILA_DE_VARREDURA, SCANNER, VarreduraService],
})
export class VarreduraModule {}
