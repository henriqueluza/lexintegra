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
import { Icone, type NomeIcone } from '../ui/icone/icone';

interface ItemDeMenu {
  readonly rota: string;
  readonly rotulo: string;
  readonly icone: NomeIcone;
  /** Primeiro item de um grupo que merece separacao visual. */
  readonly grupo?: string;
  /** `/painel` casaria com `/painel/anamnese` sem isto. */
  readonly exata?: boolean;
}

/**
 * Moldura de tudo que exige sessao: menu lateral, barra de topo com a pessoa e o
 * conteudo. O que ela faz de estrutural e declarar `data-direcao="pauta"` no
 * proprio elemento raiz — a escala densa dos paineis (ADR-22).
 *
 * Como o <html> e sempre `catedra`, as duas direcoes se ANINHAM aqui — e e desse
 * aninhamento que veio o bug de escopo que `e2e/direcao.spec.ts` guarda.
 */
@Component({
  selector: 'app-shell-autenticada',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Icone],
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
   * O CLIENTE GANHOU MENU no redesign de setembro de 2026, e nenhum item e de
   * agendamento. A reuniao continua dentro do cartao do pedido — o criterio de
   * aceite da Etapa 9 proibe uma tela de agendamento solta, e
   * `app.routes.spec.ts` continua falhando se alguem a criar. O que o menu
   * oferece sao as tres coisas que o cliente ja podia fazer por link: ver os
   * pedidos, contratar outro servico e rever a ficha inicial.
   *
   * ISTO NAO E CONTROLE DE ACESSO. Esconder link nao protege rota; quem protege
   * sao os guards de `canMatch` e, de verdade, o `@Perfis` da API.
   */
  protected readonly navegacao = computed((): readonly ItemDeMenu[] => {
    const perfil = this.sessao.perfil();

    if (perfil === 'admin') {
      return [
        { rota: '/admin/distribuicao', rotulo: 'Distribuição', icone: 'rota' },
        { rota: '/admin/clientes', rotulo: 'Clientes', icone: 'usuarios' },
        { rota: '/admin/advogados', rotulo: 'Advogados', icone: 'usuario' },
        { rota: '/admin/produtos', rotulo: 'Produtos', icone: 'grade' },
        /* Etapa 8: as devolucoes que o escritorio faz por fora do gateway. */
        { rota: '/admin/estornos', rotulo: 'Estornos', icone: 'estorno' },
        /* B2 (decisoes.md 5.5): convidar e remover administradores. */
        {
          rota: '/admin/administradores',
          rotulo: 'Administradores',
          icone: 'cadeado',
        },
        /*
         * O grupo do fim e o das telas visitadas quando algo deu errado — nao
         * parte do trabalho do dia. Por isso no fim, separadas. A B2 acrescentou
         * as contestacoes (5.4) e os pagamentos que nao viraram pedido (4.2):
         * os dois chegam por alerta critico.
         */
        {
          rota: '/admin/contestacoes',
          rotulo: 'Contestações',
          icone: 'escudo',
          grupo: 'Quando algo falha',
        },
        { rota: '/admin/pagamentos', rotulo: 'Pagamentos', icone: 'alerta' },
        { rota: '/admin/entregas', rotulo: 'Entregas', icone: 'mensagem' },
        { rota: '/admin/reunioes', rotulo: 'Reuniões', icone: 'video' },
      ];
    }

    if (perfil === 'advogado') {
      return [
        { rota: '/advogado/demandas', rotulo: 'Demandas', icone: 'pasta' },
        /*
         * Etapa 10, e desde 07/10/2026 o calendario do mes: as reunioes marcadas
         * e os horarios de atendimento numa tela so (era "Agenda" mais
         * "Disponibilidade").
         */
        { rota: '/advogado/agenda', rotulo: 'Agenda', icone: 'calendario' },
      ];
    }

    if (perfil === 'cliente') {
      return [
        {
          rota: '/painel',
          rotulo: 'Meus pedidos',
          icone: 'pasta',
          exata: true,
        },
        { rota: '/servicos', rotulo: 'Contratar serviço', icone: 'grade' },
        {
          rota: '/painel/anamnese',
          rotulo: 'Ficha inicial',
          icone: 'documento',
        },
      ];
    }

    return [];
  });

  protected readonly area = computed(() => {
    const perfil = this.sessao.perfil();
    if (perfil === 'admin') return 'Administração';
    if (perfil === 'advogado') return 'Advogado';
    if (perfil === 'cliente') return 'Cliente';
    return '';
  });

  protected readonly rotuloDaArea = computed(() => {
    const perfil = this.sessao.perfil();
    if (perfil === 'admin') return 'Área administrativa';
    if (perfil === 'advogado') return 'Área do advogado';
    if (perfil === 'cliente') return 'Área do cliente';
    return '';
  });

  protected readonly descricaoDoUsuario = computed(() => {
    const usuario = this.sessao.usuario();
    if (usuario === null) return '';
    return usuario.nome ?? usuario.email ?? 'Sessão ativa';
  });

  protected readonly iniciais = computed(() => {
    const usuario = this.sessao.usuario();
    return usuario === null ? '' : iniciaisDe(usuario.nome, usuario.email);
  });

  protected async sair(): Promise<void> {
    await this.sessao.sair();
    await this.router.navigateByUrl('/entrar');
  }
}

/** Duas iniciais do nome (primeiro e ultimo), ou a primeira letra do e-mail. */
function iniciaisDe(nome: string | null, email: string | null): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  const letras =
    partes.length === 0
      ? (email?.[0] ?? '')
      : (partes[0][0] ?? '') +
        (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '');
  return letras.toLocaleUpperCase('pt-BR');
}
