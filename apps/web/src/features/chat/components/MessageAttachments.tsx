import { useEffect, useState } from 'react';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';
import { getAttachmentDownloadUrl } from '../../../api';
import type { MessageAttachment } from '../../../types';

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(value / 1024))} KiB`;
}

export function MessageAttachments({
  attachments,
  token,
}: {
  attachments: MessageAttachment[];
  token: string | null;
}) {
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = useState('');
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const images = attachments.filter(
      (item) => item.mimeType.startsWith('image/') && item.uploadedAt,
    );
    void Promise.all(
      images.map(async (attachment) => {
        try {
          const result = await getAttachmentDownloadUrl(token, attachment.id, 'inline');
          return [attachment.id, result.url] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (active) setPreviewUrls(Object.fromEntries(results.filter((result) => result !== null)));
    });
    return () => {
      active = false;
    };
  }, [attachments, token]);

  const download = async (attachment: MessageAttachment) => {
    if (!token || !attachment.uploadedAt) return;
    setDownloadingId(attachment.id);
    setDownloadError(false);
    try {
      const result = await getAttachmentDownloadUrl(token, attachment.id, 'attachment');
      const anchor = document.createElement('a');
      anchor.href = result.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.download = attachment.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setDownloadError(true);
    } finally {
      setDownloadingId('');
    }
  };

  if (!attachments.length) return null;
  return (
    <>
      <ul className="message-attachments" aria-label="Anexos da mensagem">
        {attachments.map((attachment) => {
          const image = attachment.mimeType.startsWith('image/');
          return (
            <li className="message-attachment" key={attachment.id}>
              {image && previewUrls[attachment.id] ? (
                <a href={previewUrls[attachment.id]} target="_blank" rel="noreferrer">
                  <img src={previewUrls[attachment.id]} alt={`Prévia de ${attachment.fileName}`} />
                </a>
              ) : (
                <div className="message-attachment-icon" aria-hidden="true">
                  {image ? <ImageIcon size={19} /> : <FileText size={19} />}
                </div>
              )}
              <div className="message-attachment-info">
                <strong title={attachment.fileName}>{attachment.fileName}</strong>
                <span>
                  {attachment.uploadedAt ? formatBytes(attachment.sizeBytes) : 'Upload pendente'}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Baixar ${attachment.fileName}`}
                disabled={!attachment.uploadedAt || downloadingId === attachment.id}
                onClick={() => void download(attachment)}
              >
                <Download size={16} />
              </button>
            </li>
          );
        })}
      </ul>
      {downloadError && (
        <span className="attachment-error" role="alert">
          Não foi possível baixar este anexo.
        </span>
      )}
    </>
  );
}
