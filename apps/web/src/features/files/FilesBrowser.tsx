import { useEffect, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Search } from 'lucide-react';
import { getAttachmentDownloadUrl, getChannelFiles, getFiles, type RemoteFile } from '../../api';
import { useAuth } from '../../auth/AuthContext';

type SortBy = 'recent' | 'name' | 'size';

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(value / 1024))} KiB`;
}

function locationLabel(file: RemoteFile) {
  if (file.message.location?.type === 'CHANNEL')
    return `${file.message.location.teamName} · #${file.message.location.channelName}`;
  if (file.message.location?.type === 'CHAT') return file.message.location.conversationName;
  if (file.message.channel)
    return `#${file.message.channel.name} · ${file.message.channel.team.name}`;
  return 'Conversa';
}

export function FilesBrowser({
  channelId,
  channelName,
}: {
  channelId?: string;
  channelName?: string;
}) {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const load = channelId
        ? getChannelFiles(accessToken, channelId, { query, sortBy })
        : getFiles(accessToken, { query, sortBy });
      void load
        .then((result) => {
          if (active) setFiles(result.items);
        })
        .catch(() => {
          if (active) setError('Não foi possível carregar os arquivos. Tente novamente.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [accessToken, channelId, query, sortBy]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const images = files.filter((file) => file.mimeType.startsWith('image/') && file.uploadedAt);
    void Promise.all(
      images.map(async (file) => {
        try {
          const result = await getAttachmentDownloadUrl(accessToken, file.id, 'inline');
          return [file.id, result.url] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (!active) return;
      setPreviewUrls(Object.fromEntries(results.filter((result) => result !== null)));
    });
    return () => {
      active = false;
    };
  }, [accessToken, files]);

  const download = async (file: RemoteFile) => {
    if (!accessToken || !file.uploadedAt) return;
    setDownloadingId(file.id);
    try {
      const result = await getAttachmentDownloadUrl(accessToken, file.id, 'attachment');
      const anchor = document.createElement('a');
      anchor.href = result.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.download = file.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setError('Não foi possível preparar o download deste arquivo.');
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <section
      className="files-browser"
      aria-label={channelName ? `Arquivos de ${channelName}` : 'Arquivos compartilhados'}
    >
      <header className="files-browser-header">
        <div>
          <h2>{channelName ? `Arquivos de #${channelName}` : 'Arquivos compartilhados'}</h2>
          <p>
            {channelName
              ? 'Arquivos enviados nas mensagens deste canal.'
              : 'Arquivos disponíveis nas suas conversas e canais.'}
          </p>
        </div>
        <label className="files-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar arquivos"
            placeholder="Buscar arquivos"
          />
        </label>
        <label className="files-sort-label">
          <span>Ordenar</span>
          <select
            value={sortBy}
            aria-label="Ordenar arquivos"
            onChange={(event) => setSortBy(event.target.value as SortBy)}
          >
            <option value="recent">Mais recentes</option>
            <option value="name">Nome</option>
            <option value="size">Tamanho</option>
          </select>
        </label>
      </header>
      {error && (
        <p className="files-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="files-status" role="status">
          Carregando arquivos…
        </p>
      ) : files.length ? (
        <ul className="file-card-grid" aria-label="Lista de arquivos">
          {files.map((file) => {
            const isImage = file.mimeType.startsWith('image/');
            return (
              <li className="file-card" key={file.id}>
                <div className="file-card-preview">
                  {isImage && previewUrls[file.id] ? (
                    <img
                      src={previewUrls[file.id]}
                      alt={`Prévia de ${file.fileName}`}
                      loading="lazy"
                    />
                  ) : isImage ? (
                    <ImageIcon size={26} aria-hidden="true" />
                  ) : (
                    <FileText size={26} aria-hidden="true" />
                  )}
                </div>
                <div className="file-card-meta">
                  <strong title={file.fileName}>{file.fileName}</strong>
                  <span>
                    {formatBytes(file.sizeBytes)} · {file.message.author.displayName}
                  </span>
                  <span>{locationLabel(file)}</span>
                  {file.message.text && <p>{file.message.text}</p>}
                </div>
                <button
                  className="file-download-button"
                  type="button"
                  disabled={!file.uploadedAt || downloadingId === file.id}
                  onClick={() => void download(file)}
                  aria-label={`Baixar ${file.fileName}`}
                >
                  <Download size={16} />
                  <span>{downloadingId === file.id ? 'Preparando…' : 'Baixar'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="files-status" role="status">
          {query ? 'Nenhum arquivo corresponde à busca.' : 'Ainda não há arquivos compartilhados.'}
        </p>
      )}
    </section>
  );
}
