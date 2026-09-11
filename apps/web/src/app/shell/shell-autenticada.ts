import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
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
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Botao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell-autenticada.html',
  styleUrl: './shell-autenticada.css',
})
export class ShellAutenticada {
  private readonly sessao = inject(SessaoService);
  private readonly router = inject(Router);

  /**
   * Navegacao derivada do PERFIL, nao da rota atual.
   *
   * O cliente continua sem menu, e continua sendo decisao e nao esquecimento: a
   * area dele tem UMA tela — os cartoes de pedido —, e tudo que se faz com um
   * pedido acontece dentro do cartao dele, inclusive marcar reuniao. Um menu de
   * um item so e ruido; pior, um item "Reunioes" no menu seria exatamente a tela
   * de agendamento solta que o criterio de aceite da Etapa 9 proibe.
   *
   * ISTO NAO E CONTROLE DE ACESSO. Esconder link nao protege rota; quem protege
   * sao os guards de `canMatch` e, de verdade, o `@Perfis` da API.
   */
  protected readonly navegacao = computed(() => {
    const perfil = this.sessao.perfil();

    if (perfil === 'admin') {
      return [
        { rota: '/admin/distribuicao', rotulo: 'Distribuicao' },
        { rota: '/admin/clientes', rotulo: 'Clientes' },
        { rota: '/admin/advogados', rotulo: 'Advogados' },
        { rota: '/admin/produtos', rotulo: 'Produtos' },
        /*
         * Por ultimo, e de proposito: e uma tela de diagnostico, visitada quando
         * algo deu errado, e nao parte do trabalho do dia.
         */
        { rota: '/admin/entregas', rotulo: 'Entregas' },
      ];
    }

    if (perfil === 'advogado') {
      return [
        { rota: '/advogado/demandas', rotulo: 'Demandas' },
        { rota: '/advogado/disponibilidade', rotulo: 'Disponibilidade' },
      ];
    }

    return [];
  });

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
