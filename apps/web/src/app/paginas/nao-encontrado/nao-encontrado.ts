import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-nao-encontrado',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nao-encontrado.css',
  template: `
    <main class="erro">
      <p class="codigo">404</p>
      <h1>Página não encontrada.</h1>
      <a routerLink="/">Voltar ao início</a>
    </main>
  `,
})
export class NaoEncontrado {}
