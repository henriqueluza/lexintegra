/** Movimento do diálogo nativo; foco e Escape continuam sob controle do navegador. */
export function animarMenu(dialogo: HTMLDialogElement): void {
  if (
    typeof dialogo.animate !== 'function' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return;
  const mobile = matchMedia('(max-width:640px)').matches;
  dialogo.animate(
    mobile
      ? { transform: ['translateY(100%)', 'translateY(0)'] }
      : { clipPath: ['inset(0 0 100%)', 'inset(0)'] },
    { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' },
  );
  dialogo.querySelectorAll('.topo__links a').forEach((link, i) => {
    link.animate(
      {
        transform: ['translateY(.7em)', 'translateY(0)'],
        clipPath: ['inset(0 0 100%)', 'inset(-10%)'],
      },
      {
        duration: 600,
        delay: 100 + i * 90,
        fill: 'backwards',
        easing: 'cubic-bezier(.16,1,.3,1)',
      },
    );
  });
}

export function arrastarMenu(
  dialogo: HTMLDialogElement,
  fechar: () => void,
): () => void {
  const eventos = new AbortController();
  const alca = dialogo.querySelector<HTMLElement>('.alca')!;
  let inicio = 0,
    distancia = 0,
    arrastando = false;
  alca.addEventListener(
    'pointerdown',
    (e) => {
      inicio = e.clientY;
      distancia = 0;
      arrastando = true;
      alca.setPointerCapture(e.pointerId);
    },
    { signal: eventos.signal },
  );
  alca.addEventListener(
    'pointermove',
    (e) => {
      if (!arrastando) return;
      distancia = Math.max(0, e.clientY - inicio);
      dialogo.style.transform = `translateY(${distancia}px)`;
    },
    { signal: eventos.signal },
  );
  const soltar = (): void => {
    if (!arrastando) return;
    arrastando = false;
    dialogo.style.removeProperty('transform');
    if (distancia > dialogo.clientHeight * 0.2) fechar();
    else if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      dialogo.animate(
        { transform: [`translateY(${distancia}px)`, 'translateY(0)'] },
        { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
  };
  alca.addEventListener('pointerup', soltar, { signal: eventos.signal });
  alca.addEventListener('pointercancel', soltar, { signal: eventos.signal });
  return () => eventos.abort();
}
