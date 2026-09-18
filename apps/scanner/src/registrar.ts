/**
 * Log estruturado do scanner, em dez linhas.
 *
 * O Cloud Logging le `severity` e espalha o resto do objeto em `jsonPayload`, e
 * e por campo do `jsonPayload` que a politica de alerta casa. Texto corrido
 * obrigaria a politica a casar expressao regular sobre a linha.
 *
 * NAO IMPORTA O LOGGER DA API, e isso e deliberado: o scanner nao usa
 * `packages/shared` nem nada do monorepo (ver o cabecalho de `servidor.ts`), e e
 * essa ausencia que permite construi-lo e implanta-lo sozinho. Dez linhas
 * duplicadas custam menos que essa dependencia.
 */
type Severidade = 'INFO' | 'WARNING' | 'ERROR';

export function registrar(
  severidade: Severidade,
  mensagem: string,
  campos: Record<string, unknown> = {},
): void {
  const linha = JSON.stringify({
    severity: severidade,
    message: mensagem,
    time: new Date().toISOString(),
    ...campos,
  });

  if (severidade === 'ERROR') {
    console.error(linha);
    return;
  }
  console.log(linha);
}
