/**
 * Analise de mutacao dos alvos da API (arquitetura, secao 10).
 *
 * TRES ALVOS, e so eles: a validacao de transicao de status do entregavel
 * (ADR-11), as regras de autorizacao — quem acessa o que — e a verificacao de
 * assinatura do webhook, que a secao 11 classifica como "impacto maximo:
 * qualquer pessoa cria conta paga sem pagar".
 *
 * O quarto alvo que a arquitetura lista — calculo de saldo e intervalo de
 * reunioes — chegou na Etapa 10. A parte PURA dele mora em
 * `packages/shared/src/regras-reuniao.ts` e e mutada pela configuracao de la;
 * aqui entra o que decide com o banco: a transacao que reserva o slot e a que
 * cancela, onde a regra vira estado gravado.
 *
 * `inPlace: true` PORQUE O SANDBOX QUEBRA AQUI, e por uma razao especifica deste
 * pacote: `jest.config.mjs` mapeia `shared` para `../../../packages/shared/src`,
 * FORA de `apps/api`. Dentro da caixa do Stryker esse caminho aponta para um
 * diretorio que nao existe, e todo mutante "morreria" por falha de resolucao —
 * um escore alto que nao significa nada. No lugar, a resolucao e identica a de
 * `pnpm test`.
 *
 * A SUITE DE INTEGRACAO NAO ENTRA, e isso sai de graca: `testRegex` exige ponto
 * antes de `spec`, e os arquivos de integracao usam hifen (`*.integration-spec.ts`).
 * Eles exigem o emulador do Firestore, que uma corrida de mutacao com dezenas de
 * processos paralelos nao tem como oferecer.
 */
export default {
  packageManager: 'pnpm',
  testRunner: 'jest',
  inPlace: true,
  reporters: ['clear-text', 'progress', 'html', 'json'],

  // Ver o comentario em `packages/shared/stryker.config.mjs`.
  plugins: ['@stryker-mutator/jest-runner'],

  jest: {
    projectType: 'custom',
    configFile: 'jest.config.mjs',
    enableFindRelatedTests: true,
  },

  testRunnerNodeArgs: ['--experimental-vm-modules'],

  mutate: [
    // Transicao de status (ADR-11, regra inviolavel 14).
    'src/entregaveis/entregaveis.service.ts',

    // Autorizacao: quem e, qual perfil, e se o pedido e dele.
    'src/autenticacao/autenticacao.guard.ts',
    'src/autenticacao/perfis.guard.ts',
    'src/autenticacao/usuario.ts',
    'src/pedidos/consulta.service.ts',
    'src/pedidos/acesso.service.ts',
    'src/pedidos/pedido.ts',
    'src/tarefas/tarefa.guard.ts',

    // Agendamento (Etapa 10): a regra virando estado gravado.
    'src/reunioes/reunioes.service.ts',
    'src/reunioes/cancelamento.service.ts',

    // Assinatura do webhook (Etapa 8; arquitetura, secao 11).
    'src/pagamentos/webhook/assinatura.ts',
    'src/pagamentos/webhook/assinatura.guard.ts',
  ],

  /*
   * MEDIDO: 88.69% na primeira corrida limpa (318 mortos, 42 sobreviventes);
   * 87.69% na Etapa 10, com os dois servicos de reuniao acrescentados acima
   * (506 de 577). `break` fica em 86 — o piso da primeira medicao menos dois
   * pontos. Nao foi baixado para acompanhar a queda: 86 continua sendo passado
   * com folga, e afrouxar o limiar toda vez que ele encosta e o mesmo que nao
   * ter limiar.
   *
   * ⚠️ ESTE NUMERO E UM PISO, E A LISTA DE SOBREVIVENTES TEM FALSO ALARME.
   * Verificado na Etapa 10, aplicando o mutante a mao e rodando a suite: pelo
   * menos dois "sobreviventes" sao MORTOS pelos testes que ja existem —
   * `cancelamento.service.ts` na conferencia de acesso (`ator.perfil ===
   * 'cliente' && ...` trocado por `true`, morto por "cliente de outro pedido
   * responde 404" e por "advogado do pedido responde 404") e na conferencia de
   * existencia (trocada por `false`, morta por "reuniao inexistente responde
   * 404"). O relatorio diz que 13 dos 15 testes do arquivo cobrem o primeiro
   * mutante, e os dois que faltam sao justamente os que o matam.
   *
   * A causa provavel e a atribuicao de cobertura por teste sob ESM com
   * `--experimental-vm-modules`, que e como esta suite roda. O erro e para o
   * lado seguro — mutante vivo relatado como vivo, nunca o contrario —, mas
   * custa tempo: ANTES de escrever teste para um sobrevivente deste pacote,
   * aplique o mutante a mao e rode a suite dele. O relatorio de
   * `packages/shared` nao tem esse problema (conferido no mesmo dia, com um
   * sobrevivente de la confirmado como real).
   *
   * O QUE SOBROU, e por que nao vale forcar mais. A maioria dos sobreviventes e
   * literal de MENSAGEM — texto de log e de excecao, que nenhum teste deve fixar
   * — e o resto vem da redundancia deliberada dos guards: com segredo e
   * assinatura conferidos em sequencia, afrouxar um deles nao muda a resposta,
   * porque o outro recusa. Sao mutantes equivalentes por DESENHO, e o desenho
   * esta certo. Perseguir esse numero produziria testes que fixam texto.
   *
   * O sobrevivente que valia matar foi morto: `PerfisGuard` com lista vazia —
   * ver `ControladorMisto` em `autenticacao.spec.ts`.
   */
  thresholds: { high: 90, low: 75, break: 86 },

  tempDirName: 'node_modules/.stryker-tmp',
  htmlReporter: { fileName: '../../reports/mutacao-api.html' },
  jsonReporter: { fileName: '../../reports/mutacao-api.json' },
};
