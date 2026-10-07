import { observarConvite } from './observar-convite';

describe('Convite ao alcançar a seção reservada', () => {
  let callback: IntersectionObserverCallback;
  const desconectar = jest.fn();
  const original = globalThis.IntersectionObserver;
  beforeEach(() => {
    sessionStorage.clear();
    desconectar.mockClear();
    globalThis.IntersectionObserver = jest.fn(
      (fn: IntersectionObserverCallback) => {
        callback = fn;
        return { observe: jest.fn(), disconnect: desconectar };
      },
    ) as unknown as typeof IntersectionObserver;
  });
  afterEach(() => {
    globalThis.IntersectionObserver = original;
  });
  async function entrar(): Promise<void> {
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    await Promise.resolve();
  }
  it('só confere acesso ao chegar à seção e abre uma única vez', async () => {
    const conferir = jest.fn().mockResolvedValue(false),
      abrir = jest.fn();
    observarConvite(
      document.createElement('section'),
      conferir,
      abrir,
      () => false,
    );
    expect(conferir).not.toHaveBeenCalled();
    await entrar();
    await entrar();
    expect(abrir).toHaveBeenCalledTimes(1);
    observarConvite(
      document.createElement('section'),
      conferir,
      abrir,
      () => false,
    );
    expect(globalThis.IntersectionObserver).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'não abre para quem tem acesso ou já saiu da landing (%s)',
    async (liberado) => {
      const abrir = jest.fn();
      observarConvite(
        document.createElement('section'),
        async () => liberado,
        abrir,
        () => !liberado,
      );
      await entrar();
      expect(abrir).not.toHaveBeenCalled();
    },
  );
  it('desconecta na destruição e tolera falha da conferência', async () => {
    const abrir = jest.fn();
    const limpar = observarConvite(
      document.createElement('section'),
      async () => {
        throw new Error('indisponível');
      },
      abrir,
      () => false,
    );
    await entrar();
    await Promise.resolve();
    limpar();
    expect(desconectar).toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });
});
