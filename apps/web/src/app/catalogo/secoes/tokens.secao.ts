import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

/**
 * Galeria dos tokens SEMANTICOS, nao dos primitivos.
 *
 * Mostrar `--vinho-800` ao lado de `--papel` nao diz nada: os dois nunca aparecem
 * na mesma tela. O que interessa comparar e o papel — o que e "superficie" e o
 * que e "texto-3" em cada direcao —, porque e isso que o componente consome.
 *
 * Cada amostra e uma classe de CSS, e nao um `style` inline: o criterio de aceite
 * da etapa vale para o catalogo tambem.
 */
@Component({
  selector: 'app-secao-tokens',
  imports: [NgTemplateOutlet, Amostra, Pagina, Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tokens.secao.html',
  styleUrl: './tokens.secao.css',
})
export class SecaoTokens {}
