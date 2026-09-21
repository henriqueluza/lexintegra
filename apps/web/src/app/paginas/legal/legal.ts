import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TEXTO_TERMOS_CHECKOUT } from 'shared/termos-checkout';
import { TEXTOS } from '../landing/textos';
@Component({
  selector: 'app-legal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal.html',
  styleUrl: '../publicas.css',
})
export class Legal {
  protected readonly termos =
    inject(ActivatedRoute).snapshot.data['termos'] === true;
  protected readonly texto = this.termos
    ? TEXTO_TERMOS_CHECKOUT
    : TEXTOS.privacidade.juridico;
}
