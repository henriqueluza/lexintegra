import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs';
import type { ClienteResumo } from 'shared/esquemas/cliente';
import { ApiDistribuicaoService } from '../../autenticacao/api-distribuicao.service';
import { Campo } from '../../ui/campo/campo';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
} from '../../ui/tabela/tabela';

/**
 * A pagina "Clientes" (item 2.5.8): busca por nome ou e-mail, filtro por produto
 * contratado.
 *
 * A BUSCA ACONTECE NO SERVIDOR. Poderia parecer mais simples carregar tudo uma
 * vez e filtrar aqui — mas isso significaria mandar a lista de clientes de um
 * escritorio de advocacia inteira para o navegador, que e informacao sensivel por
 * si so: e a lista de quem procurou um advogado (arquitetura 5.5 e secao 13).
 *
 * O `debounceTime` nao e enfeite: sem ele, cada tecla digitada vira uma consulta
 * que percorre a colecao no servidor.
 */
@Component({
  selector: 'app-admin-clientes',
  imports: [ReactiveFormsModule, Campo, CelulaTabela, MensagemErro, Tabela],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-clientes.html',
  styleUrl: './admin-clientes.css',
})
export class AdminClientes implements OnInit {
  private readonly api = inject(ApiDistribuicaoService);

  protected readonly colunas: readonly ColunaTabela[] = [
    { chave: 'nome', rotulo: 'Cliente' },
    { chave: 'email', rotulo: 'E-mail' },
    { chave: 'produtos', rotulo: 'Produtos contratados' },
  ];

  protected readonly linhas = signal<readonly ClienteResumo[]>([]);
  protected readonly carregando = signal(true);
  protected readonly falha = signal(false);

  protected readonly busca = new FormControl('', { nonNullable: true });
  protected readonly produto = new FormControl('', { nonNullable: true });

  constructor() {
    for (const controle of [this.busca, this.produto]) {
      controle.valueChanges
        .pipe(debounceTime(300), takeUntilDestroyed())
        .subscribe(() => void this.recarregar());
    }
  }

  ngOnInit(): void {
    void this.recarregar();
  }

  protected comoCliente(linha: Record<string, unknown>): ClienteResumo {
    return linha as unknown as ClienteResumo;
  }

  protected produtos(cliente: ClienteResumo): string {
    return cliente.produtosContratados.length === 0
      ? '—'
      : cliente.produtosContratados.join(' · ');
  }

  private async recarregar(): Promise<void> {
    this.carregando.set(true);
    this.falha.set(false);
    try {
      this.linhas.set(
        await this.api.buscarClientes({
          busca: this.busca.value,
          produto: this.produto.value,
        }),
      );
    } catch {
      this.falha.set(true);
    } finally {
      this.carregando.set(false);
    }
  }
}
