import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  esquemaNovoPreCadastro,
  type NovoPreCadastro,
  type PreCadastroLiberado,
} from 'shared';
import { Publico } from '../autenticacao/decoradores.js';
import { Limite } from '../limite/decoradores.js';
import { ZodPipe } from '../validacao/zod.pipe.js';
import { PreCadastrosService } from './pre-cadastros.service.js';

/**
 * A unica rota do sistema que aceita dado pessoal de quem nao tem identidade
 * nenhuma (arquitetura, secao 6, fronteira 1).
 *
 * `@Publico()` e obrigatorio: o guard de autenticacao e global e rota nasce
 * fechada. E `@Perfis` NAO pode aparecer aqui — `PerfisGuard` exige
 * `requisicao.usuario`, que rota publica nao tem, e a combinacao vira 403 fixo.
 *
 * As tres defesas desta fronteira nao estao neste arquivo, e e de proposito:
 * validacao de entrada e o `ZodPipe` abaixo, limite de requisicao e o guard
 * global de `limite/`, e App Check e o guard global de `app-check/`. Um
 * controlador que precisasse lembrar de aplicar as tres seria um controlador que
 * o proximo esquece.
 */
@Controller('pre-cadastros')
export class PreCadastrosController {
  constructor(private readonly preCadastros: PreCadastrosService) {}

  /**
   * 201 porque cria (ou renova) um recurso, e devolve o token no corpo.
   *
   * O token vai no CORPO e nunca em cabecalho de redirecionamento ou em query
   * string: e credencial viva (regra inviolavel 9), e query string entra em log
   * de servidor, em historico de navegador e em referenciador.
   */
  /*
   * Cinco envios por dez minutos, por endereco. Uma pessoa preenche este
   * formulario uma vez, talvez duas se errar o e-mail; quem precisa de cinco em
   * dez minutos nao esta preenchendo, esta testando. O numero e generoso o
   * bastante para nao punir um escritorio inteiro atras do mesmo IP de saida.
   */
  @Limite({ janelaMs: 10 * 60_000, maximo: 5 })
  @Publico()
  @Post()
  @HttpCode(201)
  registrar(
    @Body(new ZodPipe(esquemaNovoPreCadastro)) dados: NovoPreCadastro,
  ): Promise<PreCadastroLiberado> {
    return this.preCadastros.registrar(dados);
  }
}
