import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SessaoService } from '../autenticacao/sessao.service';
import { Botao } from '../ui/botao/botao';

/**
 * Moldura de tudo que exige sessao. O que ela faz de estrutural e uma coisa so:
 * declarar `data-direcao="pauta"` no proprio elemento raiz.
 *
 * A Direcao B (Pauta) e a linguagem dos modulos internos autenticados; a Direcao
 * A (Catedra) fica nas paginas publicas (docs/design.md). Como o <html> e sempre
 * `catedra`, as duas se ANINHAM aqui — e e desse aninhamento que veio o bug de
 * escopo que `e2e/direcao.spec.ts` guarda.
 */
@Component({
  selector: 'app-shell-autenticada',
  imports: [RouterOutlet, Botao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell-autenticada.html',
  styleUrl: './shell-autenticada.css',
})
export class ShellAutenticada {
  private readonly sessao = inject(SessaoService);
  private readonly router = inject(Router);

  protected readonly descricaoDoUsuario = computed(() => {
    const usuario = this.sessao.usuario();
    if (usuario === null) return '';
    return usuario.nome ?? usuario.email ?? 'Sessao ativa';
  });

  protected async sair(): Promise<void> {
    await this.sessao.sair();
    await this.router.navigateByUrl('/entrar');
  }
}
