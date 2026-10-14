import { useEffect, useRef, useState } from 'react';
import { Trash2, UploadCloud } from 'lucide-react';
import { validateIdFile } from '../utils/validators';

/**
 * Click / keyboard / drag-and-drop picker for the ID card photo.
 * It validates type and size itself, then reports with onSelect(file) or onReject(message).
 */
export default function FileDropzone({ id = 'idCard', label, hint, file, onSelect, onReject, onClear, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFiles = (files) => {
    const picked = files && files[0];
    if (!picked) return;
    const message = validateIdFile(picked);
    if (message) onReject(message);
    else onSelect(picked);
  };

  const openPicker = () => inputRef.current?.click();
  const errorId = `${id}-error`;

  return (
    <div>
      <span id={`${id}-label`} className="label">
        {label}
      </span>

      {file ? (
        <div className={`flex flex-col gap-4 rounded-xl border bg-white p-3 sm:flex-row sm:items-center ${error ? 'border-coral-600' : 'border-line'}`}>
          {preview && (
            <img
              src={preview}
              alt="Preview of the ID card you selected"
              className="h-28 w-full rounded-lg border border-line bg-paper object-contain sm:w-44"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-[13px] text-ink-faint">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={openPicker} className="btn btn-secondary !px-3 !py-1.5 text-sm">
                Choose another
              </button>
              <button type="button" onClick={onClear} className="btn btn-ghost !px-3 !py-1.5 text-sm">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          id={`${id}-dropzone`}
          role="button"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-describedby={error ? errorId : undefined}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
            error ? 'border-coral-600 bg-coral-50' : dragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 bg-white hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <UploadCloud className="h-8 w-8 text-blue-500" aria-hidden="true" />
          <p className="text-[15px] text-ink">
            Drag a photo here, or <span className="font-semibold text-blue-600 underline">browse your files</span>
          </p>
          {hint && <p className="text-[13px] text-ink-faint">{hint}</p>}
        </div>
      )}

      <input
        ref={inputRef}
        id={id}
        data-testid="idcard-input"
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = ''; // lets the same file be chosen again after removing it
        }}
      />

      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] font-medium text-coral-600">
          {error}
        </p>
      )}
    </div>
  );
}
