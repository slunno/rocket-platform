import { describe, expect, it } from 'vitest';
import {
  detectAttachmentMimeType,
  isAllowedAttachment,
  sanitizeAttachmentFileName,
} from './files.js';

describe('StorageProvider helpers', () => {
  it('remove caminhos e caracteres de controle do nome do arquivo', () => {
    expect(sanitizeAttachmentFileName('C:\\Users\\Pessoa\\ ficha\u0000.png ')).toBe('ficha.png');
    expect(sanitizeAttachmentFileName('../../')).toBe('arquivo');
  });

  it('limita nomes longos sem quebrar caracteres Unicode', () => {
    const name = `${'á'.repeat(200)}.pdf`;
    expect(Array.from(sanitizeAttachmentFileName(name))).toHaveLength(180);
  });

  it('exige uma extensão compatível com o MIME permitido', () => {
    expect(isAllowedAttachment('colecao.png', 'image/png')).toBe(true);
    expect(isAllowedAttachment('colecao.exe', 'image/png')).toBe(false);
    expect(isAllowedAttachment('colecao.svg', 'image/svg+xml')).toBe(false);
  });

  it('verifica o conteúdo real de imagens, PDFs e texto', () => {
    expect(
      detectAttachmentMimeType(
        'foto.png',
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(detectAttachmentMimeType('arquivo.pdf', Buffer.from('%PDF-1.7'))).toBe(
      'application/pdf',
    );
    expect(detectAttachmentMimeType('notas.txt', Buffer.from('Amostra em UTF-8'))).toBe(
      'text/plain',
    );
    expect(detectAttachmentMimeType('imagem.jpg', Buffer.from('não é uma imagem'))).toBeNull();
  });
});
