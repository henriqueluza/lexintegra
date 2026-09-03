import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Rota publica. Nao faz chamada HTTP (regra inviolavel 10) e nao usa o SDK do
 * Firebase (regra inviolavel 7) — a autenticacao entra na Etapa 4.
 *
 * O conteudo definitivo vem da Etapa 6; o sistema de design, da Etapa 3.
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {}
