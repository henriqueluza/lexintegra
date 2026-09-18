import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { esquemaErroDoNavegador, type ErroDoNavegador } from 'shared';
import { SemAppCheck } from '../app-check/decoradores.js';
import { Publico } from '../autenticacao/decoradores.js';
import { Limite } from '../limite/decoradores.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { ErrosDoNavegadorService } from './erros-do-navegador.service.js';

/**
 * Onde o erro de frontend vira log estruturado (ADR-08).
 *
 * O ADR-08 descartou o Sentry — cota, clausula 4.3 e LGPD — e escolheu este
 * caminho: `ErrorHandler` global do Angular manda a excecao para ca, e daqui ela
 * sai como entrada do Cloud Logging, com o source map guardado em bucket privado
 * para desmontar a pilha sob demanda.
 *
 * `@SemAppCheck()`, E ISSO E UMA EXCECAO CONSCIENTE. Ate a Etapa 12 so o webhook
 * e o health eram publicos sem App Check. Duas razoes, e as duas sao sobre o
 * proposito do endpoint:
 *
 * 1. Exigir token de App Check na home violaria a regra inviolavel 10 — obter o
 *    token e chamada de rede, e a home nao chama nada antes do pre-cadastro.
 * 2. O erro que mais interessa e justamente o da inicializacao do App Check. Um
 *    endpoint que exigisse App Check para relatar falha de App Check nao
 *    relataria nunca.
 *
 * O que substitui a defesa perdida: o corpo e um schema estreito com teto de
 * tamanho, o limite por endereco esta logo abaixo, e ha um teto por instancia no
 * servico. Nada aqui escreve no banco, e a resposta nao devolve informacao
 * nenhuma — nao ha o que extrair deste endpoint.
 */
@Controller('erros-do-navegador')
export class ErrosDoNavegadorController {
  constructor(private readonly erros: ErrosDoNavegadorService) {}

  /**
   * 204 sempre, inclusive quando o relato e descartado pelo teto.
   *
   * Quem relata erro nao tem o que fazer com a resposta, e devolver estado —
   * "aceito", "descartado" — so daria ao atacante um contador do proprio efeito.
   *
   * Dez por minuto, por endereco: uma pagina que quebra produz um punhado de
   * erros, nao dezenas. Um laco no navegador de um cliente so passa a ser
   * descartado aqui, e nao ao custo de todo mundo.
   */
  @Limite({ janelaMs: 60_000, maximo: 10 })
  @SemAppCheck()
  @Publico()
  @Post()
  @HttpCode(204)
  registrar(
    @Body(new ZodPipe(esquemaErroDoNavegador)) erro: ErroDoNavegador,
  ): void {
    this.erros.registrar(erro);
  }
}
