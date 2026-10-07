const CHAVE = 'lexintegra:convite-catalogo-visto';

/** Só observa a seção; conferir lê o acesso existente, sem buscar produtos. */
export function observarConvite(
  secao: Element,
  conferir: () => Promise<boolean>,
  abrir: () => void,
  destruido: () => boolean,
): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => undefined;
  try {
    if (sessionStorage.getItem(CHAVE)) return () => undefined;
  } catch {
    /* A sessão em memória continua disponível. */
  }
  let usado = false;
  const observador = new IntersectionObserver(
    (entradas) => {
      if (usado || !entradas.some((entrada) => entrada.isIntersecting)) return;
      usado = true;
      observador.disconnect();
      void conferir()
        .then((liberado) => {
          if (liberado || destruido()) return;
          try {
            sessionStorage.setItem(CHAVE, '1');
          } catch {
            /* Não impede a navegação. */
          }
          abrir();
        })
        .catch(() => {
          /* O CTA da seção permanece disponível. */
        });
    },
    { threshold: 0.25 },
  );
  observador.observe(secao);
  return () => {
    usado = true;
    observador.disconnect();
  };
}
