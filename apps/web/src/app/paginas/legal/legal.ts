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
  protected readonly secoes = this.termos
    ? TERMOS_PUBLICOS
    : PRIVACIDADE_PUBLICA;
}
