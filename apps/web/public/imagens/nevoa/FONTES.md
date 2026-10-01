# Imagens

Fotos do **Unsplash** (licença Unsplash: uso comercial gratuito, sem atribuição obrigatória; não é permitido revendê-las como estão nem montar um serviço concorrente de fotos). O id no nome do arquivo leva à original: `https://unsplash.com/photos/<id>` ou `https://images.unsplash.com/photo-<id>`.
Arquivos em ~2400px de largura (JPG q85). Em produção, sirva versões responsivas (800/1200/1800/2400w) via `srcset` + `sizes="100vw"`, `decoding="async"`, `loading="lazy"` abaixo da dobra e `fetchpriority="high"` só no hero.

| Arquivo | Onde | Enquadramento (`object-position`) | Observação |
|---|---|---|---|
| `hero-martelo__unsplash-1575505586569-646b2ca898fc.jpg` | Hero (fundo, tela cheia) | desktop `78% 38%`; mobile: foto ocupa 64% do topo, `62% 50%` | recebe o tom bordô (tint) |
| `cap1-escolha-biblioteca-curva__…094345857637.jpg` | Capítulo 1 · ESCOLHA | centro | retrato |
| `cap2-contrate-maos-assinando__…c8848c66ca85.jpg` | Capítulo 2 · CONTRATE | centro | `--b: .5` (noite) |
| `cap3-brief-mesa-laptop__…856f4ea42174.jpg` | Capítulo 3 · BRIEF | centro | `--b: .38` (noite) |
| `cap4-elaboracao-sala-reuniao__…0bf868a2d407.jpg` | Capítulo 4 · ELABORAÇÃO | centro | `--b: .5` (noite) |
| `cap5-entrega-cidade-noite__…7a241cacace9.jpg` | Capítulo 5 · ENTREGA | centro | fundo do painel 0418 |
| `fechamento-torres-escuras__…d7d671e672a2.jpg` | Fechamento "AGORA." | `50% 30%` | recebe o tom bordô (tint) |
| `logo-lexintegra.png` | Barra superior, menu, rodapé | — | 512×512; a landing usa só a balança recortada (ver abaixo) |

Nunca usar: caneta-tinteiro, pessoas sorrindo/high-five, gradientes abstratos, stock "alegre".

## Tratamento de cor (tema Névoa) — CSS reutilizável
Toda foto é P&B levantada, clareada e assentada sobre o papel Névoa com véu da cor do fundo. Os valores vêm de `tokens/tokens.css`.

```html
<figure class="lex-photo lex-photo--tint">   <!-- --tint só no hero e no fechamento -->
  <img src="…" alt="" width="2400" height="1600">
</figure>
```
```css
.lex-photo{position:relative;overflow:clip;background:var(--lex-bg)}
.lex-photo img{width:100%;height:100%;object-fit:cover;
  filter:var(--lex-photo-filter);             /* Névoa: grayscale(1) contrast(.92) brightness(1.06) */
  opacity:var(--lex-photo-opacity)}           /* Névoa: .74 → sombras sobem para o azul-névoa */
.lex-photo--tint::before{content:"";position:absolute;inset:0;z-index:1;
  background:var(--lex-photo-tint);mix-blend-mode:color;opacity:var(--lex-photo-tint-opacity)} /* bordô .12 */
/* véu para legibilidade do texto sobre a foto (texto em --lex-text-primary) */
.lex-photo::after{content:"";position:absolute;inset:0;z-index:2;background:
  linear-gradient(to top,color-mix(in srgb,var(--lex-veil) 90%,transparent),
                         color-mix(in srgb,var(--lex-veil) 40%,transparent) 38%,transparent 70%)}
```
Capítulos (fotos de seção) usam véu duplo, cheio no topo e na base, para "fundir" na página:
```css
.lex-photo--chapter::after{background:
  linear-gradient(to bottom,var(--lex-veil) 7%,transparent 30%),
  linear-gradient(to top,var(--lex-veil) 6%,color-mix(in srgb,var(--lex-veil) 55%,transparent) 42%,transparent 72%)}
```
No tema `noite`, os mesmos tokens viram P&B escuro (`contrast(1.25) brightness(.62)`, opacidade 1, tint .28) e o véu é preto — nenhum CSS muda.

## Logo: só a balança
A barra usa o recorte da balança (sem o texto pequeno do logo), em escala `--s`:
```css
.lex-mark{--s:.17;display:block;position:relative;overflow:hidden;width:calc(285px*var(--s));height:calc(250px*var(--s))}
.lex-mark img{position:absolute;max-width:none;width:calc(512px*var(--s));height:calc(512px*var(--s));
  left:calc(-113px*var(--s));top:calc(-68px*var(--s));filter:var(--lex-logo-filter)}
```
Em fundo claro (Névoa) o logo fica colorido (bordô + dourado); no `noite` vira branco.
