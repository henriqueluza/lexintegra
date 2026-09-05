import { computed, inject, Injectable, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { perfilDoToken, type Perfil } from 'shared/perfil';
import { AUTH_FIREBASE, type ContextoAuth } from './firebase';

export interface UsuarioSessao {
  readonly uid: string;
  readonly email: string | null;
  readonly nome: string | null;
  /** `null` para conta autenticada sem claim reconhecida. */
  readonly perfil: Perfil | null;
}

export type FalhaEntrada =
  | 'credencial-invalida'
  | 'conta-desabilitada'
  | 'excesso-de-tentativas'
  | 'indisponivel';

export class ErroDeEntrada extends Error {
  constructor(readonly motivo: FalhaEntrada) {
    super(motivo);
    this.name = 'ErroDeEntrada';
  }
}

/**
 * Sessao do usuario. O SDK do Firebase no navegador serve SO para isto — regra
 * inviolavel 7 e arquitetura, secao 6.1.
 *
 * Todo uso do SDK passa pelo `ContextoAuth`, que chega por promessa. Nao ha
 * `import { signInWithEmailAndPassword } from 'firebase/auth'` neste arquivo, e
 * nao pode haver: um import estatico traria o SDK inteiro de volta ao pacote
 * inicial da aplicacao — inclusive para a landing, que nao autentica ninguem.
 * Ver `firebase.ts`.
 *
 * `onIdTokenChanged`, e nao `onAuthStateChanged`: o primeiro dispara tambem
 * quando o token e RENOVADO, e e a renovacao que traz a claim recem-atribuida. Um
 * advogado provisionado enquanto tinha a tela aberta so enxergaria o proprio
 * perfil no proximo login com `onAuthStateChanged`.
 */
@Injectable({ providedIn: 'root' })
export class SessaoService {
  private readonly contexto = inject(AUTH_FIREBASE);

  private readonly _usuario = signal<UsuarioSessao | null>(null);
  private readonly _carregando = signal(true);

  /**
   * Resolve na PRIMEIRA resposta do Firebase, e so nela.
   *
   * Os guards de rota precisam esperar a restauracao da sessao antes de decidir,
   * e a alternativa — sondar o sinal `carregando` num `setInterval` — acorda o
   * navegador dezenas de vezes para descobrir algo que este servico ja sabe no
   * instante exato.
   */
  readonly pronta: Promise<void>;
  private resolverPronta: () => void = () => {};

  readonly usuario = this._usuario.asReadonly();
  /**
   * `true` ate a primeira resposta. Sem este estado, a tela decidiria entre
   * "logado" e "deslogado" antes de saber, e o efeito visivel seria um piscar da
   * tela de login em toda navegacao de quem ja esta autenticado.
   */
  readonly carregando = this._carregando.asReadonly();
  readonly perfil = computed(() => this._usuario()?.perfil ?? null);
  readonly autenticado = computed(() => this._usuario() !== null);

  constructor() {
    this.pronta = new Promise<void>((resolver) => {
      this.resolverPronta = resolver;
    });
    void this.iniciar();
  }

  private async iniciar(): Promise<void> {
    const contexto = await this.contexto;
    // No servidor nao ha sessao para restaurar, e nao pode haver.
    if (contexto === null) {
      this.concluir();
      return;
    }

    contexto.sdk.onIdTokenChanged(contexto.auth, (usuario) => {
      void this.absorver(usuario);
    });
  }

  private async absorver(usuario: User | null): Promise<void> {
    if (usuario === null) {
      this._usuario.set(null);
      this.concluir();
      return;
    }

    const resultado = await usuario.getIdTokenResult();
    this._usuario.set({
      uid: usuario.uid,
      email: usuario.email,
      nome: usuario.displayName,
      // Mesma funcao que o guard da API usa, sobre a mesma claim. Duas leituras
      // diferentes da mesma claim divergem, e divergencia aqui e a interface
      // mostrando ao advogado uma tela que o servidor vai recusar.
      perfil: perfilDoToken(resultado.claims),
    });
    this.concluir();
  }

  private concluir(): void {
    this._carregando.set(false);
    this.resolverPronta();
  }

  private async exigirContexto(): Promise<ContextoAuth> {
    const contexto = await this.contexto;
    if (contexto === null) throw new ErroDeEntrada('indisponivel');
    return contexto;
  }

  async entrar(email: string, senha: string): Promise<void> {
    const { auth, sdk } = await this.exigirContexto();
    try {
      await sdk.signInWithEmailAndPassword(auth, email, senha);
    } catch (erro) {
      throw new ErroDeEntrada(traduzirFalha(erro));
    }
  }

  async sair(): Promise<void> {
    const contexto = await this.contexto;
    if (contexto === null) return;
    await contexto.sdk.signOut(contexto.auth);
  }

  /**
   * O ID token para o cabecalho `Authorization`. `getIdToken()` renova sozinho
   * quando falta pouco para expirar, entao nao ha cache nem timer aqui.
   */
  async token(): Promise<string | null> {
    const contexto = await this.contexto;
    const usuario = contexto?.auth.currentUser ?? null;
    return usuario === null ? null : await usuario.getIdToken();
  }

  /** Confere se o `oobCode` do link ainda vale, e devolve o e-mail do dono. */
  async conferirCodigo(codigo: string): Promise<string> {
    const { auth, sdk } = await this.exigirContexto();
    return await sdk.verifyPasswordResetCode(auth, codigo);
  }

  async definirSenha(codigo: string, senha: string): Promise<void> {
    const { auth, sdk } = await this.exigirContexto();
    await sdk.confirmPasswordReset(auth, codigo, senha);
  }
}

/**
 * O Firebase unificou usuario inexistente e senha errada em
 * `auth/invalid-credential` justamente para nao permitir enumeracao, e a
 * interface nao deve desfazer isso: a mensagem de "credencial-invalida" precisa
 * ser a mesma nos dois casos.
 *
 * `user-disabled` e diferente e vale distinguir — quem foi suspenso precisa saber
 * que deve procurar o escritorio, nao tentar outra senha.
 */
export function traduzirFalha(erro: unknown): FalhaEntrada {
  const codigo =
    typeof erro === 'object' && erro !== null
      ? String((erro as { code?: unknown }).code ?? '')
      : '';

  if (codigo === 'auth/user-disabled') return 'conta-desabilitada';
  if (codigo === 'auth/too-many-requests') return 'excesso-de-tentativas';
  if (
    codigo === 'auth/invalid-credential' ||
    codigo === 'auth/wrong-password' ||
    codigo === 'auth/user-not-found' ||
    codigo === 'auth/invalid-email'
  ) {
    return 'credencial-invalida';
  }
  return 'indisponivel';
}
