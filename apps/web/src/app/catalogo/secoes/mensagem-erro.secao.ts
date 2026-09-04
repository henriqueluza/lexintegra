import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MensagemErro } from '../../ui/mensagem-erro/mensagem-erro';
import { Amostra } from '../pecas/amostra';
import { Pagina } from '../pecas/pagina';
import { Vitrine } from '../pecas/vitrine';

@Component({
  selector: 'app-secao-mensagem-erro',
  imports: [NgTemplateOutlet, MensagemErro, Amostra, Pagina, Vitrine],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mensagem-erro.secao.html',
})
export class SecaoMensagemErro {}
