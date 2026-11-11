import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationStart,
  Router,
  type Event as EventoDoRoteador,
} from '@angular/router';
import { Subject } from 'rxjs';
import {
  ESPERA_ANTES_DE_MOSTRAR_MS,
  ProgressoNavegacao,
} from './progresso-navegacao';

describe('ProgressoNavegacao', () => {
  let eventos: Subject<EventoDoRoteador>;
  let fixture: ComponentFixture<ProgressoNavegacao>;

  const barra = (): Element | null => {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[role="progressbar"]',
    );
  };
  const navegar = (id: number): void =>
    eventos.next(new NavigationStart(id, '/destino'));
  const concluir = (id: number): void =>
    eventos.next(new NavigationEnd(id, '/destino', '/destino'));

  beforeEach(() => {
    jest.useFakeTimers();
    eventos = new Subject();
    TestBed.configureTestingModule({
      imports: [ProgressoNavegacao],
      providers: [{ provide: Router, useValue: { events: eventos } }],
    });
    fixture = TestBed.createComponent(ProgressoNavegacao);
    fixture.detectChanges();
  });

  afterEach(() => jest.useRealTimers());

  it('nao aparece na primeira carga, que e do HTML pre-renderizado', () => {
    navegar(1);
    jest.advanceTimersByTime(ESPERA_ANTES_DE_MOSTRAR_MS * 2);
    expect(barra()).toBeNull();
  });

  describe('depois da primeira carga', () => {
    beforeEach(() => {
      navegar(1);
      concluir(1);
    });

    it('nao pisca em troca de tela rapida', () => {
      navegar(2);
      jest.advanceTimersByTime(ESPERA_ANTES_DE_MOSTRAR_MS - 1);
      concluir(2);
      jest.advanceTimersByTime(ESPERA_ANTES_DE_MOSTRAR_MS);
      expect(barra()).toBeNull();
    });

    it('aparece quando a troca demora e some quando termina', () => {
      navegar(2);
      jest.advanceTimersByTime(ESPERA_ANTES_DE_MOSTRAR_MS);
      expect(barra()).not.toBeNull();

      concluir(2);
      expect(barra()).toBeNull();
    });

    it('some tambem quando o guard desvia a navegacao', () => {
      navegar(2);
      jest.advanceTimersByTime(ESPERA_ANTES_DE_MOSTRAR_MS);
      eventos.next(
        new NavigationCancel(
          2,
          '/destino',
          '',
          NavigationCancellationCode.Redirect,
        ),
      );
      expect(barra()).toBeNull();
    });
  });
});
