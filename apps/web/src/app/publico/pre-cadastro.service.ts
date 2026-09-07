import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import type { NovoPreCadastro, ProdutoVitrine } from 'shared';
import { ApiService } from '../autenticacao/api.service';

/** Uma chave, com prefixo do produto: o dominio pode hospedar outra coisa um dia. */
export const CHAVE_LIBERACAO = 'lexintegra:pre-cadastro';

interface Liberacao {
  readonly token: string;
  readonly expiraEm: string;
}

/**
 * O estado "ja fez o pre-cadastro", do lado do navegador.
 *
 * `localStorage` E NAO `sessionStorage`. O servidor promete sete dias de validade
 * para o token; com `sessionStorage` a liberacao acabaria ao fechar a aba, e os
 * sete dias nunca seriam usados. Guardar `expiraEm` junto e o que faz as duas
 * validades coincidirem — o navegador esquece na mesma hora que o servidor deixa
 * de aceitar, em vez de mostrar a vitrine destravada e tomar 401 na primeira
 * chamada.
 *
 * ISTO NAO E A AUTORIZACAO, e sim a lembranca dela. Armazenamento de navegador e
 * editavel por quem quiser; quem decide se a vitrine abre e o `PreCadastroGuard`
 * na API, a cada requisicao.
 *
 * A LEITURA ACONTECE DEPOIS DA HIDRATACAO, nao no construtor. A pagina e
 * pre-renderizada em Node, onde `localStorage` nao existe e o estado servido e
 * sempre "travado". Ler antes da hidratacao faria o primeiro render do cliente
 * divergir do HTML servido, que e erro de hidratacao do Angular.
 */
@Injectable({ providedIn: 'root' })
export class PreCadastroService {
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly api = inject(ApiService);
  private readonly guardada = signal<Liberacao | null>(null);

  readonly liberado = computed(() => this.guardada() !== null);

  constructor() {
    afterNextRender(() => this.guardada.set(this.ler()));
  }

  async enviar(dados: NovoPreCadastro): Promise<void> {
    const liberacao = await this.api.criarPreCadastro(dados);

    this.gravar(liberacao);
    this.guardada.set(liberacao);
  }

  listarVitrine(): Promise<ProdutoVitrine[]> {
    const liberacao = this.guardada();
    if (liberacao === null) {
      return Promise.reject(new Error('Sem pre-cadastro concluido.'));
    }

    return this.api.listarVitrine(liberacao.token);
  }

  /**
   * Le e valida. Token vencido e apagado e tratado como ausente, SEM MENSAGEM
   * NENHUMA: a pessoa nao fez nada errado, e um aviso de "sua liberacao expirou"
   * so criaria um problema onde havia um formulario de tres campos.
   */
  private ler(): Liberacao | null {
    if (!this.navegador) return null;

    let bruto: string | null;
    try {
      bruto = localStorage.getItem(CHAVE_LIBERACAO);
    } catch {
      /* Navegacao privada com armazenamento bloqueado. A vitrine fica travada. */
      return null;
    }
    if (bruto === null) return null;

    const liberacao = analisar(bruto);
    if (liberacao === null || Date.parse(liberacao.expiraEm) <= Date.now()) {
      this.apagar();
      return null;
    }

    return liberacao;
  }

  private gravar(liberacao: Liberacao): void {
    if (!this.navegador) return;
    try {
      localStorage.setItem(CHAVE_LIBERACAO, JSON.stringify(liberacao));
    } catch {
      /*
       * Cota estourada ou armazenamento bloqueado. A liberacao vale para esta
       * navegacao — o sinal ja foi atualizado — e some no recarregamento. Melhor
       * que derrubar o envio que acabou de dar certo.
       */
    }
  }

  private apagar(): void {
    try {
      localStorage.removeItem(CHAVE_LIBERACAO);
    } catch {
      /* Mesmo caso do gravar. */
    }
  }
}

function analisar(bruto: string): Liberacao | null {
  try {
    const objeto = JSON.parse(bruto) as Partial<Liberacao>;
    return typeof objeto.token === 'string' &&
      objeto.token !== '' &&
      typeof objeto.expiraEm === 'string'
      ? { token: objeto.token, expiraEm: objeto.expiraEm }
      : null;
  } catch {
    /* Alguem editou a chave a mao, ou uma versao anterior gravou outro formato. */
    return null;
  }
}
