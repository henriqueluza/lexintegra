# Marcas de pagamento

O componente mostra as marcas das formas de pagamento que a conta do AbacatePay
aceita. A lista vem de `packages/shared/src/formas-de-pagamento.ts`, que é a
fonte única. Mudar a conta significa mudar aquele arquivo e o teste dele, e
mais nada.

## Origem de cada desenho

Os paths foram copiados dos arquivos de cada marca, sem redesenho. Quatro vêm
dos kits oficiais. A Visa vem do Wikimedia Commons, porque o kit dela exige
cadastro com dados pessoais e aceite de termos; o responsável pelo projeto
dispensou o arquivo oficial em 01/11/2026. Duas coisas mudaram em relação aos
originais:

- o atributo `fill` virou classe, e a cor vem de
  `styles/tokens/marcas-pagamento.css`, com o mesmo valor do arquivo (regra
  inviolável 8);
- o `viewBox` foi recortado na caixa visual quando o arquivo trazia margem
  transparente (Pix, Mastercard e Google Pay). A área de proteção passa a vir
  de `--marca-pagamento-espaco`.

| Marca | Arquivo | De onde | Baixado em |
|---|---|---|---|
| Pix | `PacoteMarcaPixPDF.zip`, `simbolo_pix_policromia_positivo.pdf`, convertido em SVG com `pdftocairo -svg` (poppler 26.10) | bcb.gov.br, Pix → Área dos participantes → Marca | 01/11/2026 |
| Visa | `Visa Inc. logo (2021–present).svg`, Wikimedia Commons (marcado lá como domínio público; a marca continua sendo da Visa). **Não é do kit oficial.** Para trocar pelo oficial, baixe em globalclient.visa.com/brand-mark (formulário e aceite dos termos da Visa) | commons.wikimedia.org | 01/11/2026 |
| Mastercard | `mc_symbol_SVG.zip`, `ma_symbol.svg` ("Mastercard Symbol"), sob o Artwork Download Agreement da página | mastercard.com/brandcenter, Download Artwork | 01/11/2026 |
| Apple Pay | `Apple-Pay-Mark.zip`, `Apple_Pay_Mark_RGB_041619.svg` | developer.apple.com/apple-pay/marketing | 01/11/2026 |
| Google Pay | `Google-Pay-Acceptance.zip`, `google-pay-mark_800.svg` | developers.google.com/pay/api/web/guides/brand-guidelines | 01/11/2026 |

Os arquivos originais não entram no repositório. Para regerar, baixe os
pacotes de novo nas páginas acima.

## Regras dos manuais que o componente cumpre

- **Pix** (Manual de Uso da Marca, v1.6, 14/05/2025):
  - O símbolo sozinho pode ser usado em plataformas de comércio eletrônico, na
    cor verde Pix (RGB 119 182 168). O arquivo do BC vem em CMYK, e a tela usa
    o RGB que o manual dá.
  - Em meio digital, o símbolo tem no mínimo 24 px.
  - Em paridade com outras marcas, nenhuma delas pode ser mais alta que o
    símbolo Pix.
- **Mastercard** (Brand Center): o Symbol a cores é o padrão, e a área de
  proteção é de pelo menos 1/4 da largura de um dos círculos (cerca de 8 px a
  32 px de altura).
- **Visa**: é um logotipo sem selo. Fica com 20 px de altura (15 px no
  checkout), mais baixo que as outras marcas, para não pesar o dobro. O manual
  do Pix só limita a altura das outras marcas para cima.
- **Apple Pay**:
  - Só a versão branca com contorno.
  - Altura não menor que a das outras marcas.
  - Área de proteção de 1/4 da altura.
  - Sem distorção, sombra ou animação.
- **Google Pay**:
  - Sem recolorir nem alterar o contorno.
  - Altura igual à das outras marcas.
  - Área de proteção de metade da altura do "G".

As marcas com selo ou símbolo têm a mesma altura (`--marca-pagamento-altura`,
32 px no rodapé e 24 px no checkout). A largura sai da proporção de cada uma.

## Ponto de atenção

O guia da Apple orienta a mostrar mensagens de Apple Pay só a quem tem
dispositivo compatível (`ApplePaySession.canMakePayments()`). O rodapé é
pré-renderizado e não roda JavaScript para isso. Ele lista a marca entre as
formas aceitas, como faz para as demais.
