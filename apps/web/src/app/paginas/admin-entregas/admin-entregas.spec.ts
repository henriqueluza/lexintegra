import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ApiOutboxService,
  type EntregaResumo,
} from '../../autenticacao/api-outbox.service';
import { AdminEntregas } from './admin-entregas';

const FALHOU: EntregaResumo = {
  id: 'redefinir-senha_uid-clara_1',
  tipo: 'redefinir-senha',
  estado: 'falhou',
  tentativas: 3,
  ciclo: 0,
  criadoEm: '2026-09-11T12:00:00.000Z',
  ultimaTentativaEm: '2026-09-11T12:05:00.000Z',
  enviadoEm: null,
  ultimoErro: 'API key is invalid',
};

const ABANDONADO: EntregaResumo = {
  ...FALHOU,
  id: 'definir-senha_uid-ana',
  tipo: 'definir-senha',
  estado: 'abandonado',
  tentativas: 10,
};

const PENDENTE: EntregaResumo = {
  ...FALHOU,
  id: 'definir-senha_uid-bia',
  estado: 'pendente',
  tentativas: 0,
  ultimaTentativaEm: null,
  ultimoErro: null,
};

const ENVIADO: EntregaResumo = {
  ...FALHOU,
  id: 'definir-senha_uid-caio',
  estado: 'enviado',
  enviadoEm: '2026-09-11T12:06:00.000Z',
  ultimoErro: null,
};

interface ApiDeTeste {
  entregas: EntregaResumo[];
  chamadas: string[];
  erroAoReenviar: unknown;
}

async function montar(opcoes: Partial<ApiDeTeste> = {}): Promise<{
  fixture: ComponentFixture<AdminEntregas>;
  api: ApiDeTeste;
}> {
  const api: ApiDeTeste = {
    entregas: opcoes.entregas ?? [],
    chamadas: [],
    erroAoReenviar: opcoes.erroAoReenviar ?? null,
  };

  TestBed.configureTestingModule({
    imports: [AdminEntregas],
    providers: [
      {
        provide: ApiOutboxService,
        useValue: {
          listarEntregas: (situacao: string) => {
            api.chamadas.push(`listar ${situacao}`);
            return Promise.resolve(api.entregas);
          },
          reenviar: (id: string) => {
            api.chamadas.push(`reenviar ${id}`);
            return api.erroAoReenviar === null
              ? Promise.resolve({ reenviado: true })
              : Promise.reject(api.erroAoReenviar);
          },
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminEntregas);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, api };
}

function botaoDeReenvio(
  fixture: ComponentFixture<AdminEntregas>,
): HTMLButtonElement | undefined {
  return [...fixture.nativeElement.querySelectorAll('button')].find(
    (botao: HTMLButtonElement) =>
      botao.textContent?.includes('Reenviar agora') === true,
  );
}

describe('AdminEntregas', () => {
  /**
   * Abre em "falharam", e nao em "todos": quem entra aqui esta atras de um
   * problema, e a lista inteira e dominada por entregas que deram certo.
   */
  it('abre no filtro do que falhou', async () => {
    const { api } = await montar({ entregas: [FALHOU] });

    expect(api.chamadas).toEqual(['listar falhou']);
  });

  it('mostra tipo, tentativas e motivo em linguagem de gente', async () => {
    const { fixture } = await montar({ entregas: [FALHOU] });

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Redefinicao de senha');
    expect(texto).toContain('Falhou');
    expect(texto).toContain('3');
    expect(texto).toContain('API key is invalid');
  });

  /**
   * A LISTA NAO PODE MOSTRAR DESTINATARIO NEM CONTEUDO. O documento do outbox nao
   * guarda os dois de propósito — endereco e dado pessoal em repouso, link de
   * senha e credencial viva — e a tela nao pode ser a porta dos fundos que os
   * traz de volta.
   */
  it('nao mostra nada que identifique o destinatario', async () => {
    const { fixture } = await montar({ entregas: [FALHOU] });

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).not.toMatch(/@[a-z]/i);
  });

  it('reenvia e recarrega a lista', async () => {
    const { fixture, api } = await montar({ entregas: [FALHOU] });

    botaoDeReenvio(fixture)?.click();
    await fixture.whenStable();

    expect(api.chamadas).toEqual([
      'listar falhou',
      `reenviar ${FALHOU.id}`,
      'listar falhou',
    ]);
  });

  it.each([
    ['falhou', FALHOU],
    ['abandonado', ABANDONADO],
  ])('oferece reenvio para registro %s', async (_nome, entrega) => {
    const { fixture } = await montar({ entregas: [entrega] });

    expect(botaoDeReenvio(fixture)).toBeDefined();
  });

  /**
   * O SERVIDOR RECUSA ESSES DOIS COM 409, e por isso a tela nao os oferece.
   * Reenviar um registro na fila criaria uma segunda tarefa para algo que sera
   * entregue de qualquer jeito — um botao que nao faz nada e nao diz por que. A
   * conferencia esta nos dois lados, e nao so aqui: esconder botao nao e regra.
   */
  it.each([
    ['pendente', PENDENTE],
    ['enviado', ENVIADO],
  ])('nao oferece reenvio para registro %s', async (_nome, entrega) => {
    const { fixture } = await montar({ entregas: [entrega] });

    expect(botaoDeReenvio(fixture)).toBeUndefined();
  });

  it('mostra o erro do reenvio sem derrubar a lista', async () => {
    const { fixture } = await montar({
      entregas: [FALHOU],
      erroAoReenviar: new Error('deu ruim'),
    });

    botaoDeReenvio(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Redefinicao de senha');
    expect(fixture.nativeElement.querySelector('app-mensagem-erro')).toBeTruthy();
  });

  it('avisa quando a lista nao carrega', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AdminEntregas],
      providers: [
        {
          provide: ApiOutboxService,
          useValue: {
            listarEntregas: () => Promise.reject(new Error('rede')),
            reenviar: () => Promise.resolve({ reenviado: true }),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(AdminEntregas);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent as string).toContain(
      'Nao foi possivel carregar as entregas',
    );
  });

  it('recarrega quando a situacao muda', async () => {
    const { fixture, api } = await montar({ entregas: [FALHOU] });

    const filtro = fixture.nativeElement.querySelector(
      'select',
    ) as HTMLSelectElement;
    filtro.value = 'abandonado';
    filtro.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.chamadas).toEqual(['listar falhou', 'listar abandonado']);
  });

  /** Registro que nunca foi tentado nao tem quando mostrar, e um `Invalid Date`
   * na coluna faria parecer defeito. */
  it('mostra travessao quando nao houve tentativa', async () => {
    const { fixture } = await montar({ entregas: [PENDENTE] });

    expect(fixture.nativeElement.textContent as string).toContain('—');
  });
});
