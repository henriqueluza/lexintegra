/**
 * Leitura de senha sem eco, com o terminal em modo raw.
 *
 * A primeira versao sobrescrevia `_writeToOutput` do `readline`. Isso e
 * detalhe interno: no Node 26 o `readline/promises` escreve por um simbolo
 * privado, a sobrescrita nunca foi chamada e a senha apareceu na tela. Aqui nao
 * ha `readline`: o terminal para de ecoar (`setRawMode`) e cada tecla e tratada
 * a mao. Ctrl+C cancela, Backspace apaga, Enter conclui.
 */
export function lerOculto(
  pergunta,
  { entrada = process.stdin, saida = process.stdout } = {},
) {
  if (!entrada.isTTY) {
    return Promise.reject(
      new Error('A senha precisa ser digitada num terminal interativo.'),
    );
  }

  saida.write(pergunta);
  return new Promise((resolver, rejeitar) => {
    let valor = '';

    const terminar = (erro) => {
      entrada.off('data', aoDigitar);
      entrada.setRawMode(false);
      entrada.pause();
      saida.write('\n');
      if (erro === undefined) resolver(valor);
      else rejeitar(erro);
    };

    function aoDigitar(pedaco) {
      for (const caractere of pedaco.toString('utf8')) {
        if (caractere === '\r' || caractere === '\n') return terminar();
        /* Em modo raw o Ctrl+C chega como caractere, e nao como SIGINT. */
        if (caractere === '\u0003') return terminar(new Error('Cancelado.'));
        if (caractere === '\u007f' || caractere === '\b') {
          valor = [...valor].slice(0, -1).join('');
          continue;
        }
        if (caractere < ' ') continue;
        valor += caractere;
      }
    }

    entrada.setRawMode(true);
    entrada.resume();
    entrada.on('data', aoDigitar);
  });
}
