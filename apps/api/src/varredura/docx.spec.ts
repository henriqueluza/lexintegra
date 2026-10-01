import { DOCX, TIPOS_DOCM, TIPOS_PLANILHA, zip } from '../arnes-docx.js';
import { problemaDoDocx } from './docx.js';

function conferir(arquivo: Uint8Array): Promise<string | null> {
  return problemaDoDocx(
    (inicio, quantidade) =>
      Promise.resolve(arquivo.slice(inicio, inicio + quantidade)),
    arquivo.length,
  );
}

describe('problemaDoDocx', () => {
  it('aceita um DOCX', async () => {
    expect(await conferir(zip(DOCX))).toBeNull();
  });

  it('aceita o indice sem compressao', async () => {
    expect(
      await conferir(zip([{ ...DOCX[0], metodo: 0 }, DOCX[1]])),
    ).toBeNull();
  });

  /** O caso que motiva o arquivo: todo DOCM passa pelo magic bytes. */
  it('recusa DOCM pelo tipo de conteudo', async () => {
    expect(
      await conferir(
        zip([{ nome: '[Content_Types].xml', conteudo: TIPOS_DOCM }, DOCX[1]]),
      ),
    ).toMatch(/macro/);
  });

  it('recusa DOCX com projeto de macro escondido', async () => {
    expect(
      await conferir(
        zip([...DOCX, { nome: 'word/vbaProject.bin', conteudo: 'x' }]),
      ),
    ).toMatch(/macro/);
  });

  it('recusa outro documento do Office (planilha)', async () => {
    expect(
      await conferir(
        zip([
          { nome: '[Content_Types].xml', conteudo: TIPOS_PLANILHA },
          DOCX[1],
        ]),
      ),
    ).toMatch(/nao e um documento do Word/);
  });

  it('recusa ZIP sem o corpo do Word', async () => {
    expect(await conferir(zip([DOCX[0]]))).toMatch(/corpo do documento/);
  });

  it('recusa ZIP sem o indice de tipos', async () => {
    expect(await conferir(zip([DOCX[1]]))).toMatch(/Content_Types/);
  });

  it('recusa entrada cifrada', async () => {
    expect(
      await conferir(zip([DOCX[0], { ...DOCX[1], cifrada: true }])),
    ).toMatch(/senha/);
  });

  it('recusa ZIP64', async () => {
    expect(await conferir(zip(DOCX, { zip64: true }))).toMatch(/ZIP64/);
  });

  it('recusa compressao desconhecida no indice', async () => {
    expect(await conferir(zip([{ ...DOCX[0], metodo: 12 }, DOCX[1]]))).toMatch(
      /Compressao/,
    );
  });

  it('recusa o que nao e ZIP', async () => {
    expect(
      await conferir(new TextEncoder().encode('%PDF-1.7 nao e zip nenhum')),
    ).toMatch(/ZIP valido/);
  });

  it('recusa ZIP com o diretorio central corrompido', async () => {
    const corrompido = zip(DOCX);
    const fim = corrompido.length - 22;
    const inicioDoDiretorio = new DataView(corrompido.buffer).getUint32(
      fim + 16,
      true,
    );
    corrompido[inicioDoDiretorio] = 0x00;
    expect(await conferir(corrompido)).toMatch(/corrompido/);
  });

  it('falha de leitura vira recusa, nao excecao', async () => {
    await expect(
      problemaDoDocx(() => Promise.reject(new Error('rede')), 100),
    ).resolves.toMatch(/nao pode ser lido/);
  });
});
