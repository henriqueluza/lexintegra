import { HttpErrorResponse } from '@angular/common/http';
import {
  effect,
  EnvironmentInjector,
  ErrorHandler,
  inject,
  Injectable,
  runInInjectionContext,
} from '@angular/core';
import type { ErroDoNavegador } from 'shared/esquemas/erro-do-navegador';
import { PreCadastroService } from '../publico/pre-cadastro.service';
import { ultimoRastreioComFalha } from './rastreio.interceptor';
import { versaoDoPacote } from './versao';

export const CAMINHO_RELATO = '/api/erros-do-navegador';

/**
 * Teto por SESSAO DE PAGINA, antes de qualquer rede.
 *
 * O limite da API contem o abuso vindo de fora; este contem o caso honesto e mais
 * provavel: um laco de renderizacao que lanca a cada quadro. Sem ele, o navegador
 * do proprio cliente dispararia centenas de requisicoes antes de o servidor ter
 * chance de recusar — e quem paga a conta e a conexao dele.
 */
const TETO_POR_SESSAO = 10;

/** Quantos relatos a home segura enquanto a regra 10 nao deixa falar com a API. */
const TETO_DA_ESPERA = 5;

/**
 * Captura de erro de frontend (ADR-08), no lugar do Sentry.
 *
 * O ADR-08 pesou cota, clausula 4.3 e LGPD e decidiu por isto: `ErrorHandler`
 * global mandando a excecao para endpoint proprio da API, que a registra como log
 * estruturado, com o source map em bucket privado.
 *
 * NAO REGISTRAMOS LISTENERS DE `error` E `unhandledrejection` A MAO. O Angular ja
 * o faz — `provideBrowserGlobalErrorListeners()` esta em `app.config.ts` — e
 * entrega os dois ao `ErrorHandler`. Acrescentar os nossos duplicaria cada relato,
 * e o teste em `app.config.spec.ts` existe para o provider nao sumir sem alguem
 * perceber.
 *
 * A REGRA INVIOLAVEL 10 GANHA DESTA CAPTURA. Na home, antes do pre-cadastro,
 * nenhuma chamada a API pode sair — e a mitigacao de cold start da pagina de
 * captacao. Entao o relato fica em memoria e sai quando a liberacao acontece; se
 * a visita terminar antes disso, ele se perde. E perda consciente: a alternativa
 * e uma requisicao na pagina que existe para converter.
 */
@Injectable()
export class RelatorDeErros implements ErrorHandler {
  /**
   * O INJETOR, E NAO O SERVICO. Injetar `PreCadastroService` aqui derruba a
   * aplicacao inteira com NG0200 — dependencia circular no `ErrorHandler`: o
   * servico puxa `ApiService`, que puxa `HttpClient`, e a maquinaria do
   * `HttpClient` precisa do proprio `ErrorHandler` que ainda esta sendo
   * construido. O sintoma nao e um erro de telemetria: e o login parando de
   * funcionar. Quem pegou isso foi a jornada autenticada da Etapa 12 — os
   * testes de unidade montam o handler com um dublê e nunca veem o ciclo.
   */
  private readonly injetor = inject(EnvironmentInjector);
  private readonly espera: ErroDoNavegador[] = [];
  private readonly jaRelatados = new Set<string>();
  private enviados = 0;
  private observando = false;

  handleError(erro: unknown): void {
    // O console continua sendo a ferramenta de quem esta com o dev tools aberto.
    console.error(erro);

    const relato = descrever(erro);
    const assinatura = `${relato.tipo}:${relato.mensagem}:${relato.rota ?? ''}`;

    if (this.jaRelatados.has(assinatura)) return;
    this.jaRelatados.add(assinatura);

    if (this.podeFalarComApi()) {
      this.esvaziar();
      this.enviar(relato);
      return;
    }

    if (this.espera.length < TETO_DA_ESPERA) this.espera.push(relato);
    this.observarLiberacao();
  }

  /**
   * O efeito que solta a espera assim que a vitrine e liberada.
   *
   * Criado SO NO PRIMEIRO relato retido, e nao no construtor: criar efeito no
   * construtor exigiria resolver `PreCadastroService` ali, que e exatamente o
   * ciclo descrito acima. Aqui a aplicacao ja subiu, e resolver e seguro.
   */
  private observarLiberacao(): void {
    if (this.observando) return;
    this.observando = true;

    runInInjectionContext(this.injetor, () => {
      effect(() => {
        if (this.preCadastro().liberado()) this.esvaziar();
      });
    });
  }

  private preCadastro(): PreCadastroService {
    return this.injetor.get(PreCadastroService);
  }

  /**
   * So a HOME antes do pre-cadastro fica calada, e nao toda rota publica.
   *
   * E o recorte exato da regra 10: a pagina de captacao. `/entrar` e `/checkout`
   * ja conversam com a API ou com o Firebase por natureza, e cala-las custaria
   * visibilidade sem poupar cold start nenhum.
   */
  private podeFalarComApi(): boolean {
    if (typeof location === 'undefined') return false;
    return location.pathname !== '/' || this.preCadastro().liberado();
  }

  private esvaziar(): void {
    while (this.espera.length > 0) {
      const relato = this.espera.shift();
      if (relato !== undefined) this.enviar(relato);
    }
  }

  private enviar(relato: ErroDoNavegador): void {
    if (this.enviados >= TETO_POR_SESSAO) return;
    this.enviados += 1;

    /*
     * `fetch` e nao `HttpClient`: o cliente HTTP passa pelos interceptors e por
     * toda a maquinaria do Angular, e um erro DENTRO do relato voltaria para este
     * mesmo handler — laco. `keepalive` para o relato sobreviver a navegacao que
     * costuma vir logo depois do erro.
     */
    void fetch(CAMINHO_RELATO, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(relato),
    }).catch(() => {
      // Falhou o relato do erro. Insistir so produziria um segundo erro.
    });
  }
}

function descrever(erro: unknown): ErroDoNavegador {
  const base = {
    tipo: 'angular' as const,
    rota: rotaSemQueryString(),
    versao: versaoDoPacote(),
    traceId: ultimoRastreioComFalha(),
  };

  if (erro instanceof HttpErrorResponse) {
    return {
      ...base,
      tipo: 'erro',
      mensagem: `HTTP ${String(erro.status)} em ${erro.url ?? 'desconhecido'}`,
    };
  }

  if (erro instanceof Error) {
    return { ...base, mensagem: erro.message, pilha: erro.stack };
  }

  return { ...base, tipo: 'rejeicao', mensagem: String(erro) };
}

/**
 * A query string NAO vai junto. `/definir-senha?oobCode=...` carrega a
 * credencial de definicao de senha, e um relato de erro que a levasse a gravaria
 * no Cloud Logging por trinta dias (regra inviolavel 9).
 */
function rotaSemQueryString(): string | undefined {
  return typeof location === 'undefined' ? undefined : location.pathname;
}
