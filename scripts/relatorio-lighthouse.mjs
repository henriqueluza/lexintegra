#!/usr/bin/env node
/**
 * Converte o JSON do Lighthouse e o resultado do axe nas duas secoes do relatorio
 * da Etapa 6, e as insere no lugar dos marcadores.
 *
 * Escreve entre marcadores em vez de reescrever o arquivo: as secoes 1 e 4 a 7 do
 * relatorio sao texto escrito a mao, sobre decisoes, e uma geracao completa as
 * apagaria a cada execucao.
 *
 * Uso: node scripts/relatorio-lighthouse.mjs <lighthouse.json> <axe.txt>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , caminhoLighthouse, caminhoAxe] = process.argv;
const RELATORIO = 'docs/etapa6-relatorio-acessibilidade-performance.md';

const lh = JSON.parse(readFileSync(caminhoLighthouse, 'utf8'));

/** Lighthouse devolve 0 a 1; o painel mostra 0 a 100. */
const nota = (id) => {
  const bruto = lh.categories?.[id]?.score;
  return typeof bruto === 'number' ? Math.round(bruto * 100) : null;
};

const metrica = (id) => lh.audits?.[id]?.displayValue ?? '—';

const CATEGORIAS = [
  ['performance', 'Performance'],
  ['accessibility', 'Acessibilidade'],
  ['best-practices', 'Boas práticas'],
  ['seo', 'SEO'],
];

const METRICAS = [
  ['first-contentful-paint', 'First Contentful Paint'],
  ['largest-contentful-paint', 'Largest Contentful Paint'],
  ['total-blocking-time', 'Total Blocking Time'],
  ['cumulative-layout-shift', 'Cumulative Layout Shift'],
  ['speed-index', 'Speed Index'],
];

const linhasCategorias = CATEGORIAS.map(
  ([id, nome]) => `| ${nome} | **${nota(id) ?? '—'}** |`,
).join('\n');

const linhasMetricas = METRICAS.map(
  ([id, nome]) => `| ${nome} | ${metrica(id)} |`,
).join('\n');

const reprovadas = Object.values(lh.audits ?? {})
  .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === 'binary')
  .map((a) => `- \`${a.id}\` — ${a.title}`)
  .slice(0, 12);

const performance = `
Medido em ${new Date(lh.fetchTime ?? Date.now()).toISOString().slice(0, 10)},
Lighthouse ${lh.lighthouseVersion ?? '—'}, perfil móvel (o padrão do CLI), contra o
build de produção servido estaticamente — não contra o servidor de desenvolvimento.

| Categoria | Nota |
|---|---|
${linhasCategorias}

| Métrica | Valor |
|---|---|
${linhasMetricas}

${
  reprovadas.length === 0
    ? 'Nenhuma auditoria binária reprovada.'
    : `Auditorias binárias reprovadas:\n\n${reprovadas.join('\n')}`
}
`.trim();

const axe = readFileSync(caminhoAxe, 'utf8').trim();
const acessibilidade = `
axe-core sobre a home, nas três larguras (360, 768 e 1280), e nos **dois** estados
da vitrine — travado e liberado. O estado liberado tem uma árvore de conteúdo
diferente (cartões, listas, preços), e verificar só o travado deixaria metade da
página sem cobertura.

Regras: \`wcag2a\`, \`wcag2aa\`, \`wcag21a\`, \`wcag21aa\`. Gravidades consideradas:
\`serious\` e \`critical\` — o mesmo recorte que a suíte do catálogo usa desde a
Etapa 3.

\`\`\`
${axe}
\`\`\`

Esta suíte é **portão de CI**: roda em \`pnpm test:a11y\` e no job \`visual\`.
`.trim();

let texto = readFileSync(RELATORIO, 'utf8');

const inserir = (secao, conteudo) => {
  const marcador = '<!-- PREENCHIDO PELO SCRIPT -->';
  const inicio = texto.indexOf(`## ${secao}`);
  if (inicio === -1) throw new Error(`Secao "${secao}" nao encontrada.`);
  const posMarcador = texto.indexOf(marcador, inicio);
  const fimSecao = texto.indexOf('\n## ', inicio + 1);
  const alvo = posMarcador !== -1 && (fimSecao === -1 || posMarcador < fimSecao);

  const de = alvo ? posMarcador : texto.indexOf('\n', inicio) + 1;
  const ate = alvo ? posMarcador + marcador.length : fimSecao;
  texto = `${texto.slice(0, de)}${conteudo}${texto.slice(ate)}`;
};

inserir('2. Acessibilidade — axe-core', acessibilidade);
inserir('3. Performance — Lighthouse', performance);

writeFileSync(RELATORIO, texto);
console.log(`Relatorio atualizado: ${RELATORIO}`);
