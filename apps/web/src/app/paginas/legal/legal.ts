import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TERMOS_PUBLICOS, PRIVACIDADE_PUBLICA } from './conteudo-legal';
@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal.html',
  styleUrls: ['../publicas.css', './legal.css'],
})
export class Legal {
  protected readonly termos =
    inject(ActivatedRoute).snapshot.data['termos'] === true;
  /**
   * O caminho da PROPRIA pagina no link do sumario, e nao so `#secao-n`. O
   * `index.html` tem `<base href="/">`, e um `href` so de fragmento resolve
   * contra a base: `#secao-3` vira `/#secao-3`, e o clique levava para a home
   * (05/10/2026). Com o caminho, e navegacao por fragmento no mesmo documento —
   * sem roteador, sem recarregar — e a secao ja tem `scroll-margin-top` para o
   * topo fixo.
   */
  protected readonly caminho = this.termos ? '/termos' : '/privacidade';
  protected readonly secoes = this.termos
    ? TERMOS_PUBLICOS
    : PRIVACIDADE_PUBLICA;
}
