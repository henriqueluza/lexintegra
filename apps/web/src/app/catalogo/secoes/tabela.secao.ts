import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Botao } from '../../ui/botao/botao';
import { SeloEstado } from '../../ui/selo-estado/selo-estado';
import {
  CelulaTabela,
  Tabela,
  type ColunaTabela,
  type LinhaTabela,
} from '../../ui/tabela/tabela';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';
import type { EstadoEntregavel } from 'shared';

interface Entregavel extends LinhaTabela {
  readonly nome: string;
  readonly estado: EstadoEntregavel;
  readonly prazo: string;
}

@Component({
  selector: 'app-secao-tabela',
  imports: [
    NgTemplateOutlet,
    Tabela,
    CelulaTabela,
    SeloEstado,
    Botao,
    Amostra,
    Pagina,
    Vitrine,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabela.secao.html',
})
export class SecaoTabela {
  protected readonly COLUNAS: readonly ColunaTabela[] = [
    { chave: 'nome', rotulo: 'Entregável' },
    { chave: 'estado', rotulo: 'Estado' },
    { chave: 'prazo', rotulo: 'Prazo' },
    { chave: 'acao', rotulo: 'Ação', alinhamento: 'fim' },
  ];

  protected readonly ENTREGAVEIS: readonly Entregavel[] = [
    {
      nome: 'Relatório de exposição trabalhista',
      estado: 'em_revisao',
      prazo: '12/09',
    },
    {
      nome: 'Plano de correção priorizado',
      estado: 'em_elaboracao',
      prazo: '20/09',
    },
    {
      nome: 'Minuta de política interna',
      estado: 'solicitado',
      prazo: '30/09',
    },
    { nome: 'Parecer consolidado', estado: 'entregue', prazo: '02/09' },
  ];

  protected readonly VAZIA: readonly Entregavel[] = [];

  protected comoEntregavel(linha: LinhaTabela): Entregavel {
    return linha as Entregavel;
  }
}
