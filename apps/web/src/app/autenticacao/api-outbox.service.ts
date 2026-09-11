import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { EstadoEntrega, TipoEvento } from 'shared/evento-outbox';

/**
 * Uma linha do painel de entregas.
 *
 * O QUE NAO ESTA AQUI E O PONTO: nao ha destinatario, endereco nem conteudo. O
 * documento do outbox nao guarda os dois ultimos de propósito — endereco e dado
 * pessoal em repouso, link de senha e credencial viva — e o painel nao pode ser
 * a porta dos fundos que os traz de volta. Quem opera precisa saber QUE entrega
 * falhou, nao de quem e a conta.
 *
 * `type` e nao `interface`, e nao e estilo: `app-tabela` recebe
 * `Readonly<Record<string, unknown>>`, e o TypeScript so da assinatura de indice
 * implicita a alias de tipo. Com `interface` o componente compila em teste e
 * quebra no build de producao — que e o pior lugar para descobrir. Os outros
 * resumos que alimentam tabelas vem inferidos de zod, e por isso ja sao alias.
 */
export type EntregaResumo = {
  readonly id: string;
  readonly tipo: TipoEvento;
  readonly estado: EstadoEntrega;
  readonly tentativas: number;
  readonly ciclo: number;
  readonly criadoEm: string;
  readonly ultimaTentativaEm: string | null;
  readonly enviadoEm: string | null;
  readonly ultimoErro: string | null;
};

/**
 * O painel de entregas do administrador global (Etapa 7, arquitetura 7.1).
 *
 * Servico proprio pelo mesmo motivo dos outros: e outra superficie
 * administrativa, com outro controlador do lado da API — e um cliente HTTP unico
 * com quarenta metodos vira o lugar onde ninguem acha nada.
 */
@Injectable({ providedIn: 'root' })
export class ApiOutboxService {
  private readonly http = inject(HttpClient);

  listarEntregas(situacao: string): Promise<EntregaResumo[]> {
    /* Filtro vazio nao vira `?situacao=`: o servidor trataria a string vazia como
     * termo desconhecido — daria no mesmo hoje, mas depende de um `catch` que e
     * detalhe dele, e nao contrato. */
    const params: Record<string, string> =
      situacao === 'todos' ? {} : { situacao };

    return firstValueFrom(
      this.http.get<EntregaResumo[]>('/api/admin/outbox', { params }),
    );
  }

  /**
   * Reenvio e RECURSO, como `atribuicao` e `ativacao`. Nao ha
   * `PATCH { estado: 'pendente' }` — um corpo com o campo convidaria a tratar o
   * estado da entrega como texto editavel, e ele e o resultado de uma maquina que
   * so o servidor move.
   */
  reenviar(id: string): Promise<{ reenviado: true }> {
    return firstValueFrom(
      this.http.post<{ reenviado: true }>(
        `/api/admin/outbox/${encodeURIComponent(id)}/reenvio`,
        {},
      ),
    );
  }
}
