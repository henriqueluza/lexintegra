import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import mjml2html from 'mjml';

const origem = new URL('../src/email/modelos/base.mjml', import.meta.url);
const destino = new URL('../src/email/modelos/base.html', import.meta.url);
const resultado = await mjml2html(await readFile(origem, 'utf8'), {
  validationLevel: 'strict',
  fonts: {},
});
const html = resultado.html.replace(/[\t ]+$/gmu, '').trimEnd() + '\n';
if (process.argv.includes('--check')) {
  if ((await readFile(destino, 'utf8')) !== html) {
    throw new Error(
      'HTML de e-mail desatualizado. Rode pnpm --filter api emails:build.',
    );
  }
} else {
  await writeFile(destino, html);
}
