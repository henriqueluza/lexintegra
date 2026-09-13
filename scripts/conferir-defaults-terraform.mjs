#!/usr/bin/env node
/**
 * Toda variavel do root module do Terraform precisa de `default`.
 *
 * POR QUE ISTO E LINT E NAO UMA NOTA NA DOCUMENTACAO.
 *
 * O deploy tem um apply PARCIAL antes de tudo: o passo "Garantir o Artifact
 * Registry" roda `terraform apply -target=google_artifact_registry_repository...`
 * porque a imagem precisa de um repositorio para onde ser empurrada, e quem cria
 * o repositorio e o Terraform. Esse passo acontece ANTES de qualquer imagem
 * existir — e portanto antes de qualquer `TF_VAR_*` ser definido no workflow.
 *
 * O Terraform valida TODAS as variaveis do root module antes de aplicar, mesmo
 * com `-target` restringindo o que sera tocado. Uma variavel sem default derruba
 * esse passo, e o deploy inteiro para antes de construir qualquer coisa.
 *
 * Aconteceu de verdade: `scanner_image` entrou na Etapa 11 sem default, o `plan`
 * dos PRs continuou verde — porque o job de plan define os `TF_VAR_*` — e a
 * quebra so apareceu no primeiro deploy depois do merge, no passo mais cedo do
 * pipeline. A proxima imagem que alguem acrescentar sem essa cautela quebraria
 * igual, e a nota na documentacao nao teria impedido.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = 'infra/terraform';

const arquivos = readdirSync(PASTA).filter((nome) => nome.endsWith('.tf'));

/** Blocos `variable "nome" { ... }` de primeiro nivel, com o corpo. */
const BLOCO = /variable\s+"([^"]+)"\s*\{([\s\S]*?)\n\}/g;

const semDefault = [];

for (const arquivo of arquivos) {
  const conteudo = readFileSync(join(PASTA, arquivo), 'utf8');
  for (const [, nome, corpo] of conteudo.matchAll(BLOCO)) {
    if (!/^\s*default\s*=/m.test(corpo)) {
      semDefault.push(`${arquivo}: ${nome}`);
    }
  }
}

if (semDefault.length > 0) {
  console.error(
    'Variaveis do Terraform sem `default`:\n' +
      semDefault.map((linha) => `  - ${linha}`).join('\n') +
      '\n\n' +
      'O passo "Garantir o Artifact Registry" do deploy roda um apply com\n' +
      '`-target` ANTES de qualquer TF_VAR_* ser definido, e o Terraform valida\n' +
      'todas as variaveis do root module mesmo com `-target`. Sem default, esse\n' +
      'passo falha e o deploy para antes de construir qualquer coisa — e o `plan`\n' +
      'dos PRs NAO pega, porque o job de plan define os TF_VAR_*.\n\n' +
      'Para variavel de imagem ou tag, o default e string vazia: um diff\n' +
      'obviamente invalido e recusado na hora, enquanto um placeholder plausivel\n' +
      'pode ser aplicado e publicar o contentor errado.',
  );
  process.exit(1);
}

console.log(
  `✔ ${String(arquivos.length)} arquivo(s) de Terraform: toda variavel tem default`,
);
