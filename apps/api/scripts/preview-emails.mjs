import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { comRodape } from '../dist/email/rodape.js';
import {
  mensagemDeAcesso,
  TIPOS_COM_LINK_DE_SENHA,
} from '../dist/email/textos-de-acesso.js';

// Apenas arquivos locais e links fictícios. Não importa transporte nem Auth.
const pasta = new URL('../../../reports/emails/', import.meta.url);
await mkdir(pasta, { recursive: true });
for (const tipo of TIPOS_COM_LINK_DE_SENHA) {
  const mensagem = comRodape({
    para: ['preview@example.test'],
    replyTo: 'suportelexintegra@gmail.com',
    ...mensagemDeAcesso(
      tipo,
      'https://example.test/definir-senha?oobCode=PREVIEW-SEM-CREDENCIAL',
    ),
  });
  await writeFile(new URL(`${tipo}.html`, pasta), mensagem.corpoHtml);
}
await writeFile(
  new URL('index.html', pasta),
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Preview de e-mails</title><h1>LexIntegra · E-mails</h1><p>Arquivos locais. Links fictícios, nenhum envio.</p><ul>${TIPOS_COM_LINK_DE_SENHA.map((tipo) => `<li><a href="${tipo}.html">${tipo}</a></li>`).join('')}</ul></html>`,
);
