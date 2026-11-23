import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Lock, X } from 'lucide-react';
import Spinner from '../components/Spinner';
import Alert from '../components/Alert';
import PhotoPicker from '../components/PhotoPicker';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { categoryApi, listingApi } from '../api';
import { parseApiError } from '../api/client';
import { CONDITION_OPTIONS, MAX_PHOTOS, TYPE_OPTIONS, UNIT_OPTIONS, buildListingFormData, imageUrl, validateListingForm } from '../utils/listings';

const EMPTY = {
  title: '',
  description: '',
  category: '',
  listingType: 'sell',
  price: '',
  exchangeFor: '',
  condition: '',
  usedValue: '',
  usedUnit: 'months',
};

// Label + control + hint/error, the same look as the other forms
function Field({ id, label, error, hint, optional, children }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-faint">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-[13px] text-ink-faint">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] font-medium text-coral-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Big radio buttons (sell / exchange / donate, condition)
function ChoiceGroup({ legend, name, options, value, onChange, error, columns = 'sm:grid-cols-3' }) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className={`grid grid-cols-2 gap-2 ${columns}`}>
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer flex-col rounded-lg border px-3.5 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-blue-200 ${
                checked ? 'border-blue-500 bg-blue-50' : error ? 'border-coral-600 bg-white' : 'border-line bg-white hover:border-blue-300'
              }`}
            >
              <input type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="sr-only" />
              <span className={`text-[15px] font-semibold ${checked ? 'text-blue-800' : ''}`}>{o.label}</span>
              {o.hint && <span className="text-[13px] text-ink-faint">{o.hint}</span>}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[13px] font-medium text-coral-600">{error}</p>}
    </fieldset>
  );
}

/** A loaded listing -> the form's values */
const toValues = (l) => ({
  title: l.title,
  description: l.description,
  category: l.category ? l.category.id : '',
  listingType: l.listingType,
  price: l.price ? String(l.price) : '',
  exchangeFor: l.exchangeFor || '',
  condition: l.condition,
  usedValue: l.usedFor ? String(l.usedFor.value) : '',
  usedUnit: l.usedFor ? l.usedFor.unit : 'months',
});

/** Post an item (/listings/new) or edit one of your own (/listings/:id/edit). */
export default function NewListing() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const summaryRef = useRef(null);

  const [values, setValues] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState({});
  const [photoProblem, setPhotoProblem] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState(null); // null = still loading
  const [kept, setKept] = useState([]); // editing: current photo file names that stay
  const [loadState, setLoadState] = useState(editing ? 'loading' : 'ready'); // loading | ready | error
  const [loadError, setLoadError] = useState('');

  // editing: load the item and fill the form
  useEffect(() => {
    if (!editing) return;
    let active = true;
    listingApi
      .get(id)
      .then((res) => {
        if (!active) return;
        const l = res.data.data.listing;
        if (!l.isMine) {
          setLoadError('You can only edit your own items.');
          setLoadState('error');
          return;
        }
        setValues(toValues(l));
        setKept(l.images);
        setLoadState('ready');
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(parseApiError(err).message);
        setLoadState('error');
      });
    return () => {
      active = false;
    };
  }, [editing, id]);

  const verified = user.verificationStatus === 'verified';

  useEffect(() => {
    categoryApi
      .listActive()
      .then((res) => setCategories(res.data.data.categories))
      .catch(() => setCategories([]));
  }, []);

  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const showErrors = (next, message) => {
    setErrors(next);
    setFormError(message);
    setTimeout(() => summaryRef.current?.focus(), 0);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const found = validateListingForm(values, [...kept, ...photos]);
    if (Object.keys(found).length) {
      setPhotoProblem('');
      return showErrors(found, 'Please fix the highlighted fields.');
    }

    setSubmitting(true);
    setFormError('');
    try {
      const res = editing
        ? await listingApi.update(id, buildListingFormData(values, photos, kept))
        : await listingApi.create(buildListingFormData(values, photos));
      toast.success(editing ? 'Your item was updated.' : 'Your item is now listed.');
      return navigate(`/listings/${res.data.data.listing.id}`);
    } catch (err) {
      const parsed = parseApiError(err);
      const fieldErrors = parsed.fieldErrors || {};
      return showErrors(fieldErrors, Object.keys(fieldErrors).length ? 'Please fix the highlighted fields.' : parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!verified) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-xl border border-line bg-white p-6">
          <Lock className="h-6 w-6 text-ink-faint" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-bold">Only verified students can post items</h1>
          <p className="mt-2 text-ink-soft">Your ID card has to be approved by an admin first. You can still browse everything.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/dashboard" className="btn btn-primary">
              Check my verification
            </Link>
            <Link to="/listings" className="btn btn-secondary">
              Browse items
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loadState !== 'ready') {
    return loadState === 'loading' ? (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-blue-600" label="Loading your item" />
      </div>
    ) : (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Alert variant="error">{loadError}</Alert>
        <Link to="/listings/mine" className="btn btn-secondary mt-4">
          Back to my listings
        </Link>
      </div>
    );
  }

  const isSell = values.listingType === 'sell';
  const isExchange = values.listingType === 'exchange';
  const isUsed = values.condition && values.condition !== 'new';
  const noCategories = categories && categories.length === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold sm:text-4xl">{editing ? 'Edit your item' : 'Post an item'}</h1>
        <p className="mt-1 text-ink-soft">
          {editing ? 'Change anything below. Buyers see the new details right away.' : 'Describe it honestly and add clear photos. Other students can then find it.'}
        </p>
      </header>

      {formError && (
        <div ref={summaryRef} tabIndex={-1} className="mb-5 outline-none">
          <Alert variant="error">{formError}</Alert>
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-6 rounded-xl border border-line bg-white p-5 sm:p-6">
        <Field id="listing-title" label="Title" error={errors.title} hint="For example: Thomas Calculus, 14th edition">
          <input id="listing-title" className="input" maxLength={100} value={values.title} onChange={(e) => set('title', e.target.value)} aria-invalid={errors.title ? 'true' : 'false'} />
        </Field>

        <Field id="listing-category" label="Category" error={errors.category}>
          <select id="listing-category" className="input" value={values.category} onChange={(e) => set('category', e.target.value)} aria-invalid={errors.category ? 'true' : 'false'} disabled={categories === null}>
            <option value="">{categories === null ? 'Loading categories…' : 'Choose a category'}</option>
            {(categories || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {noCategories && <p className="mt-1.5 text-[13px] text-ink-faint">No categories exist yet. Please ask an admin to add one.</p>}
        </Field>

        <ChoiceGroup legend="What do you want to do?" name="listingType" options={TYPE_OPTIONS} value={values.listingType} onChange={(v) => set('listingType', v)} error={errors.listingType} />

        {isSell && (
          <Field id="listing-price" label="Price (৳ taka)" error={errors.price}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true">
                ৳
              </span>
              <input
                id="listing-price"
                inputMode="numeric"
                className="input pl-8"
                value={values.price}
                onChange={(e) => set('price', e.target.value.replace(/\D/g, '').slice(0, 7))}
                aria-invalid={errors.price ? 'true' : 'false'}
              />
            </div>
          </Field>
        )}

        {isExchange && (
          <Field id="listing-exchange" label="What would you like in return?" optional error={errors.exchangeFor} hint="For example: a scientific calculator or a USB hub">
            <input id="listing-exchange" className="input" maxLength={200} value={values.exchangeFor} onChange={(e) => set('exchangeFor', e.target.value)} aria-invalid={errors.exchangeFor ? 'true' : 'false'} />
          </Field>
        )}

        <Field id="listing-description" label="Description" error={errors.description} hint={`${values.description.trim().length} / 2000 characters`}>
          <textarea
            id="listing-description"
            rows={5}
            maxLength={2000}
            className="input"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            aria-invalid={errors.description ? 'true' : 'false'}
          />
        </Field>

        <ChoiceGroup legend="Condition" name="condition" options={CONDITION_OPTIONS} value={values.condition} onChange={(v) => set('condition', v)} error={errors.condition} columns="sm:grid-cols-5" />

        {isUsed && (
          <div>
            <p className="label">How long have you used it?</p>
            <div className="flex gap-3">
              <div className="w-28">
                <label htmlFor="listing-used-value" className="sr-only">
                  Used for (number)
                </label>
                <input
                  id="listing-used-value"
                  inputMode="numeric"
                  className="input"
                  value={values.usedValue}
                  onChange={(e) => set('usedValue', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  aria-invalid={errors.usedValue ? 'true' : 'false'}
                />
              </div>
              <div className="w-36">
                <label htmlFor="listing-used-unit" className="sr-only">
                  Used for (unit)
                </label>
                <select id="listing-used-unit" className="input" value={values.usedUnit} onChange={(e) => set('usedUnit', e.target.value)} aria-invalid={errors.usedUnit ? 'true' : 'false'}>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {(errors.usedValue || errors.usedUnit) && <p className="mt-1.5 text-[13px] font-medium text-coral-600">{errors.usedValue || errors.usedUnit}</p>}
          </div>
        )}

        <div>
          <p id="photos-label" className="label">
            Photos
          </p>
          {kept.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] text-ink-faint">Current photos (the first one is the cover)</p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {kept.map((name, i) => (
                  <li key={name} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-paper">
                    <img src={imageUrl(name)} alt={`Current photo ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setKept((k) => k.filter((x) => x !== name))}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-coral-600 shadow hover:bg-white"
                      aria-label={`Remove current photo ${i + 1}`}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {editing && kept.length + photos.length >= MAX_PHOTOS && photos.length === 0 ? (
            <p className="text-[13px] text-ink-faint">You have {MAX_PHOTOS} photos. Remove one to add a new photo.</p>
          ) : (
          <PhotoPicker
            photos={photos}
            onChange={(next) => {
              setPhotos(next);
              setErrors((e) => (e.images ? { ...e, images: undefined } : e));
            }}
            onError={setPhotoProblem}
            error={photoProblem || errors.images}
          />
          )}
          {editing && kept.length + photos.length > MAX_PHOTOS && (
            <p className="mt-1.5 text-[13px] font-medium text-coral-600">You can have up to {MAX_PHOTOS} photos in total. Remove some.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
          <button type="submit" disabled={submitting || noCategories} className="btn btn-primary">
            {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
            {submitting ? (editing ? 'Saving…' : 'Posting…') : editing ? 'Save changes' : 'Post item'}
          </button>
          <Link to={editing ? `/listings/${id}` : '/listings'} className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}