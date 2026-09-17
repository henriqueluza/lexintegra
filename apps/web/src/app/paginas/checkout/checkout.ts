import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  CobrancaPixExibida,
  MetodoPagamento,
} from 'shared/esquemas/checkout';
import { VERSAO_TERMOS_CHECKOUT } from 'shared/termos-checkout';
import { ApiCheckoutService } from '../../autenticacao/api-checkout.service';
import { AppCheckService } from '../../autenticacao/app-check';
import { paraReais } from '../../comum/moeda';
import { CarrinhoService } from '../../publico/carrinho.service';
import { PreCadastroService } from '../../publico/pre-cadastro.service';
import { AvisoPrivacidade } from '../../ui/aviso-privacidade/aviso-privacidade';
import { Botao } from '../../ui/botao/botao';
import { Campo } from '../../ui/campo/campo';
import { Carregando } from '../../ui/carregando/carregando';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { traduzirFalha } from './falhas';
import { TEXTOS_CHECKOUT } from './textos';

/**
 * Para onde o cartao leva. Um token para o teste trocar: `window.location.assign`
 * no jsdom tentaria navegar de verdade.
 */
export const NAVEGAR_PARA_FORA = new InjectionToken<(url: string) => void>(
  'NAVEGAR_PARA_FORA',
  { factory: () => (url: string) => window.location.assign(url) },
);

/** O intervalo do polling comeca curto e cresce ate o teto. */
export const INTERVALO_INICIAL_MS = 4_000;
export const INTERVALO_MAXIMO_MS = 30_000;

type Fase =
  'inicio' | 'pix' | 'redirecionando' | 'aguardando' | 'pago' | 'vencido';

/**
 * A tela de checkout (Etapa 8, arquitetura 7.1).
 *
 * ROTA PUBLICA SEM CHAMADA A API NO CARREGAMENTO (regra inviolavel 10). A primeira
 * requisicao e o clique em "Pagar" — ou o polling de quem VOLTA do gateway com
 * `?id=`, que so existe depois de um checkout iniciado. Sem pre-cadastro, nada sai.
 *
 * QUEM CONFIRMA O PAGAMENTO E O WEBHOOK, nunca esta tela. Voltar da pagina do
 * cartao, ou ficar olhando o QR, so acompanha o estado que o servidor grava.
 *
 * O ESTADO LOCAL E LIDO DEPOIS DA HIDRATACAO: a pagina e pre-renderizada, e o
 * carrinho e a liberacao moram no `localStorage`.
 */
@Component({
  selector: 'app-checkout',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AvisoPrivacidade,
    Botao,
    Campo,
    Carregando,
    MensagemErro,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout {
  private readonly api = inject(ApiCheckoutService);
  private readonly appCheck = inject(AppCheckService);
  private readonly preCadastro = inject(PreCadastroService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navegarParaFora = inject(NAVEGAR_PARA_FORA);
  protected readonly carrinho = inject(CarrinhoService);

  protected readonly textos = TEXTOS_CHECKOUT;
  protected readonly hidratado = signal(false);
  protected readonly fase = signal<Fase>('inicio');
  protected readonly enviando = signal(false);
  protected readonly falha = signal<string | null>(null);
  protected readonly pix = signal<CobrancaPixExibida | null>(null);
  protected readonly copiado = signal(false);
  private readonly errosDoServidor = signal<
    Partial<Record<'nome' | 'email', string>>
  >({});

  /** O codigo copia-e-cola, num campo somente leitura para selecionar a mao. */
  protected readonly codigoPix = new FormControl('', { nonNullable: true });

  /** O que a tela mostra, derivado dos sinais — sem estado duplicado. */
  protected readonly etapa = computed(() => {
    if (!this.hidratado()) return 'preparando' as const;
    if (this.fase() !== 'inicio') return this.fase();
    if (!this.preCadastro.liberado()) return 'sem-liberacao' as const;
    if (this.carrinho.quantidade() === 0) return 'vazio' as const;
    return 'formulario' as const;
  });

  protected readonly formulario = inject(FormBuilder).nonNullable.group({
    nome: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    metodo: ['pix' as MetodoPagamento, [Validators.required]],
    aceite: [false, [Validators.requiredTrue]],
  });

  private checkoutId: string | null = null;
  private intervalo = INTERVALO_INICIAL_MS;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pararPolling());

    afterNextRender(() => {
      this.hidratado.set(true);
      const retorno = this.rota.snapshot.queryParamMap.get('id');
      if (retorno !== null && retorno !== '' && this.preCadastro.liberado()) {
        this.checkoutId = retorno;
        this.fase.set('aguardando');
        this.agendar();
      }
    });
  }

  protected preco(centavos: number): string {
    return paraReais(centavos);
  }

  /** Hora local de vencimento do QR; vazio se o gateway mandou data ilegivel. */
  protected horario(iso: string | undefined): string {
    const data = iso === undefined ? Number.NaN : Date.parse(iso);
    return Number.isFinite(data)
      ? new Date(data).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }

  protected prepararVerificacao(): void {
    this.appCheck.preparar();
  }

  protected erro(campo: 'nome' | 'email' | 'aceite'): string | null {
    if (campo !== 'aceite') {
      const doServidor = this.errosDoServidor()[campo];
      if (doServidor !== undefined && doServidor !== '') return doServidor;
    }
    const controle = this.formulario.controls[campo];
    if (!controle.touched || controle.valid) return null;
    return MENSAGENS[campo];
  }

  protected async pagar(): Promise<void> {
    this.formulario.markAllAsTouched();
    this.errosDoServidor.set({});
    const token = this.preCadastro.token();
    const chave = this.carrinho.chave();
    if (
      this.formulario.invalid ||
      this.enviando() ||
      token === null ||
      chave === null
    ) {
      return;
    }

    this.enviando.set(true);
    this.falha.set(null);
    const { nome, email, metodo } = this.formulario.getRawValue();

    try {
      const iniciado = await this.api.iniciar(
        {
          itens: this.carrinho
            .itens()
            .map((item) => ({ produtoId: item.produtoId })),
          metodo,
          comprador: { nome, email },
          termosVersao: VERSAO_TERMOS_CHECKOUT,
          chaveDoCarrinho: chave,
        },
        token,
      );
      this.checkoutId = iniciado.checkoutId;

      if (iniciado.metodo === 'cartao') {
        this.fase.set('redirecionando');
        this.navegarParaFora(iniciado.url);
        return;
      }
      this.pix.set(iniciado.pix);
      this.codigoPix.setValue(iniciado.pix.brCode);
      this.fase.set('pix');
      this.intervalo = INTERVALO_INICIAL_MS;
      this.agendar();
    } catch (erro) {
      this.tratar(erro);
    } finally {
      this.enviando.set(false);
    }
  }

  protected async copiar(): Promise<void> {
    const codigo = this.pix()?.brCode;
    if (codigo === undefined) return;
    try {
      await navigator.clipboard.writeText(codigo);
      this.copiado.set(true);
    } catch {
      /* Sem permissao de area de transferencia: o codigo continua visivel para copiar a mao. */
    }
  }

  /** Volta ao formulario com o carrinho que ainda esta la. */
  protected gerarNovo(): void {
    this.pararPolling();
    this.pix.set(null);
    this.copiado.set(false);
    this.fase.set('inicio');
    void this.router.navigate([], { queryParams: {} });
  }

  private tratar(erro: unknown): void {
    const traduzida = traduzirFalha(erro);
    this.falha.set(traduzida.mensagem);
    if (traduzida.campos !== null) this.errosDoServidor.set(traduzida.campos);
  }

  private agendar(): void {
    this.pararPolling();
    this.temporizador = setTimeout(() => void this.consultar(), this.intervalo);
  }

  /**
   * UMA consulta por vez, com intervalo crescente. Falha de rede nao encerra o
   * acompanhamento — a pessoa pode ter pago, e a proxima consulta ve isso.
   */
  private async consultar(): Promise<void> {
    const token = this.preCadastro.token();
    if (this.checkoutId === null || token === null) return;

    try {
      const { estado } = await this.api.situacao(this.checkoutId, token);
      if (estado === 'pago') {
        this.fase.set('pago');
        this.carrinho.esvaziar();
        return;
      }
      if (
        estado === 'expirado' ||
        estado === 'substituido' ||
        estado === 'falhou_cobranca'
      ) {
        this.fase.set('vencido');
        return;
      }
    } catch {
      /* Tenta de novo no proximo intervalo. */
    }

    this.intervalo = Math.min(this.intervalo * 1.5, INTERVALO_MAXIMO_MS);
    this.agendar();
  }

  private pararPolling(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
}

const MENSAGENS = {
  nome: 'Informe o nome completo.',
  email: 'Informe um e-mail válido.',
  aceite: TEXTOS_CHECKOUT.formulario.aceiteObrigatorio,
} as const;
