import { useEffect, useState } from 'react';
import { ImageOff, X, ZoomIn } from 'lucide-react';
import { adminApi, verificationApi } from '../api';
import Spinner from './Spinner';

/**
 * Shows an ID card image. The image is protected on the server (login required), so a plain
 * <img src> would fail: we download it with the login cookie and show it from a blob URL.
 * `version` changes (e.g. after a re-upload) make it reload.
 * kind="student" (default) loads a student's ID card; kind="admin" loads the logged-in admin's own card.
 */
export default function PrivateImage({ userId, version, alt, className = '', zoomable = false, kind = 'student' }) {
  const [state, setState] = useState({ status: 'loading', url: null });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = null;
    setState({ status: 'loading', url: null });

    const request = kind === 'admin' ? adminApi.idCard(userId) : verificationApi.idCard(userId);
    request
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data);
        setState({ status: 'ready', url: objectUrl });
      })
      .catch(() => active && setState({ status: 'error', url: null }));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, version, kind]);

  if (state.status === 'loading') {
    return (
      <div className={`flex items-center justify-center bg-paper ${className}`}>
        <Spinner label="Loading ID card" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-1 bg-paper p-4 text-sm text-ink-faint ${className}`}>
        <ImageOff className="h-6 w-6" aria-hidden="true" />
        Could not load the image
      </div>
    );
  }

  const image = <img src={state.url} alt={alt} className={`object-contain ${className}`} />;
  if (!zoomable) return image;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-lg"
        aria-label="Enlarge ID card image"
      >
        {image}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-ink/80 px-2 py-1 text-xs font-semibold text-white">
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          Enlarge
        </span>
      </button>
      {open && <Lightbox url={state.url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({ url, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ID card, full size"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        autoFocus
        className="absolute right-4 top-4 rounded-full bg-white p-2 text-ink hover:bg-blue-50"
        aria-label="Close full size image"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <img
        src={url}
        alt={alt}
        className="max-h-full max-w-full rounded-lg bg-white object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
