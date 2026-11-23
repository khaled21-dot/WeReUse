import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Star, X } from 'lucide-react';
import { MAX_PHOTOS, MAX_PHOTO_MB, validatePhoto } from '../utils/listings';

/**
 * Up to 5 product photos: click or drag them in, remove one, or make one the cover (the first photo
 * is what buyers see in the list). It validates each file and reports problems with onError(message).
 */
export default function PhotoPicker({ photos, onChange, onError, error, id = 'photos' }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const urls = photos.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  const addFiles = (fileList) => {
    const next = [...photos];
    let problem = '';
    for (const file of Array.from(fileList || [])) {
      const message = validatePhoto(file);
      if (message) {
        problem = `${file.name}: ${message}`;
      } else if (next.length >= MAX_PHOTOS) {
        problem = `You can add up to ${MAX_PHOTOS} photos.`;
        break;
      } else {
        next.push(file);
      }
    }
    onChange(next);
    onError(problem);
  };

  const remove = (index) => {
    onChange(photos.filter((_, i) => i !== index));
    onError('');
  };
  const makeCover = (index) => onChange([photos[index], ...photos.filter((_, i) => i !== index)]);
  const errorId = `${id}-error`;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((file, index) => (
          <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="relative overflow-hidden rounded-xl border border-line bg-white">
            {previews[index] && (
              <img src={previews[index]} alt={`Photo ${index + 1}: ${file.name}`} className="aspect-[4/3] w-full object-cover" />
            )}
            {index === 0 && (
              <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">Cover</span>
            )}
            <div className="flex items-center justify-between gap-2 p-2">
              {index === 0 ? (
                <span className="text-[13px] text-ink-faint">Shown first</span>
              ) : (
                <button type="button" onClick={() => makeCover(index)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 hover:underline">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  Make cover
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded-full p-1.5 text-ink-soft hover:bg-coral-50 hover:text-coral-600"
                aria-label={`Remove photo ${index + 1}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}

        {photos.length < MAX_PHOTOS && (
          <li>
            <button
              type="button"
              id={id}
              onClick={() => inputRef.current?.click()}
              aria-describedby={error ? errorId : undefined}
              className={`flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 text-center transition-colors ${
                error ? 'border-coral-600 bg-coral-50' : dragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 bg-white hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              <ImagePlus className="h-7 w-7 text-blue-500" aria-hidden="true" />
              <span className="text-sm font-semibold text-blue-700">{photos.length === 0 ? 'Add photos' : 'Add more'}</span>
              <span className="text-xs text-ink-faint">or drag them here</span>
            </button>
          </li>
        )}
      </ul>

      <input
        ref={inputRef}
        data-testid="photo-input"
        type="file"
        accept="image/png,image/jpeg"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = ''; // lets the same file be chosen again after removing it
        }}
      />

      <p className="mt-2 text-[13px] text-ink-faint">
        {photos.length} of {MAX_PHOTOS} photos · JPG or PNG · up to {MAX_PHOTO_MB} MB each
      </p>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-[13px] font-medium text-coral-600">
          {error}
        </p>
      )}
    </div>
  );
}