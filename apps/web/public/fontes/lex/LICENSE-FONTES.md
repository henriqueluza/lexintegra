# Licença das fontes

| Fonte | Uso | Pesos | Origem | Licença |
|---|---|---|---|---|
| **Panchang** (Indian Type Foundry) | Display: títulos, sempre CAIXA ALTA, peso 400 | 400 | fontshare.com/fonts/panchang | ITF Free Font License (FFL) — "Closed Source" |
| **Supreme** (Indian Type Foundry) | Texto, UI, labels | 400, 500 | fontshare.com/fonts/supreme | ITF Free Font License (FFL) — "Closed Source" |

Conferido em 30/09/2026 em https://www.fontshare.com/licenses/itf-ffl (versão 2.0, 17 ago 2026). Pontos que importam para o projeto:

- **Permitido:** uso pessoal e comercial gratuito, em sites e apps; **self-host via `@font-face` é permitido e recomendado**; embutir em apps e documentos; uso interno entre funcionários da empresa licenciada.
- **Proibido:** modificar os arquivos, **inclusive subsetting e conversão de formato**; redistribuir; **entregar os arquivos diretamente a designers, agências ou prestadores externos** (cada terceiro deve baixar a própria cópia no Fontshare); disponibilizar a fonte para terceiros criarem conteúdo (ex.: editor de templates/SaaS de design).
- Crédito à ITF/Fontshare é opcional.

Por isso **os .woff2 não estão neste pacote**. O dev (ou a LexIntegra) baixa os arquivos oficiais com `python get-fonts.py` ou manualmente no Fontshare e coloca nesta pasta com os nomes de `fonts.css`. Não converta nem gere subsets.
Observação: `reference/v2-nevoa.html` embute as fontes em base64 apenas como a própria página da LexIntegra para visualização; não extraia fontes dela.
