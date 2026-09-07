import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const CHAVE_SEM_APP_CHECK = 'lexintegra:sem-app-check';

/**
 * Tira a rota da verificacao de App Check.
 *
 * Existe por causa do health, e so dele: o startup probe do Cloud Run e o uptime
 * check nao sao navegadores, nao carregam o SDK do Firebase e nao tem como
 * produzir um token de App Check. Exigir o token la impediria a instancia de
 * subir.
 */
export const SemAppCheck = (): CustomDecorator<string> =>
  SetMetadata(CHAVE_SEM_APP_CHECK, true);
