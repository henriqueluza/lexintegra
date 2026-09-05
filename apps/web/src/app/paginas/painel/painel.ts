import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { SessaoService } from '../../autenticacao/sessao.service';
import { Cartao } from '../../ui/cartao/cartao';

/**
 * Area autenticada de cliente e de advogado.
 *
 * Uma tela para os dois perfis nesta etapa, com o texto trocando conforme o
 * perfil. As areas de verdade sao a Etapa 9 — inventar aqui uma estrutura de
 * navegacao para elas seria decidir a Etapa 9 sem os requisitos dela.
 *
 * O que esta tela prova e a fronteira: quem chega aqui tem sessao, e o cabecalho
 * da shell mostra a identidade que o token carrega.
 */
@Component({
  selector: 'app-painel',
  imports: [Cartao],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './painel.html',
  styleUrl: './painel.css',
})
export class Painel {
  private readonly sessao = inject(SessaoService);

  protected readonly titulo = computed(() =>
    this.sessao.perfil() === 'advogado'
      ? 'Area do advogado'
      : 'Area do cliente',
  );

  protected readonly explicacao = computed(() =>
    this.sessao.perfil() === 'advogado'
      ? 'Aqui aparecerao os pedidos distribuidos a voce, e apenas eles.'
      : 'Aqui aparecerao seus produtos contratados e o andamento de cada entregavel.',
  );

  protected readonly resumoDaSessao = computed(() => {
    const usuario = this.sessao.usuario();
    if (usuario === null) return '';
    return `${usuario.email ?? 'sem e-mail'} — perfil ${usuario.perfil ?? 'nao atribuido'}`;
  });
}
