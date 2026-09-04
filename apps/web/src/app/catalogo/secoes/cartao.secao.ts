import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Botao } from '../../ui/botao/botao';
import { Cartao, CartaoRodape } from '../../ui/cartao/cartao';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-cartao',
  imports: [
    NgTemplateOutlet,
    Botao,
    Cartao,
    CartaoRodape,
    Amostra,
    Pagina,
    Vitrine,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cartao.secao.html',
})
export class SecaoCartao {}
