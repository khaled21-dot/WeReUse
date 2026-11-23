import { useEffect, useState } from 'react';
import { Loader2, MessageSquareWarning, Send, ShieldAlert } from 'lucide-react';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import { useToast } from '../context/ToastContext';
import { Link } from 'react-router-dom';
import { complaintApi, userApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDateTime } from '../utils/format';
import { COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS, REPORT_REASON_LABELS, REPORT_STATUS, validateComplaint } from '../utils/support';

const EMPTY = { category: '', subject: '', description: '' };

/** The complaint box: report scams or system problems straight to the admins. */
export default function Support() {
  const toast = useToast();

  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [complaints, setComplaints] = useState(null);
  const [listError, setListError] = useState('');
  const [reports, setReports] = useState([]);

  useEffect(() => {
    complaintApi
      .mine()
      .then((res) => setComplaints(res.data.data.complaints))
      .catch((err) => setListError(parseApiError(err).message));
    userApi
      .myReports()
      .then((res) => setReports(res.data.data.reports))
      .catch(() => {});
  }, []);

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((x) => ({ ...x, [field]: '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateComplaint(values);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSending(true);
    setFormError('');
    try {
      const res = await complaintApi.create({
        category: values.category,
        subject: values.subject.trim(),
        description: values.description.trim(),
      });
      setComplaints((list) => [res.data.data.complaint, ...(list || [])]);
      setValues(EMPTY);
      toast.success(res.data.message);
    } catch (err) {
      const parsed = parseApiError(err);
      setErrors(parsed.fieldErrors);
      if (!Object.keys(parsed.fieldErrors).length) setFormError(parsed.message);
    } finally {
      setSending(false);
    }
  };

  const fieldProps = (name) => ({
    'aria-invalid': errors[name] ? 'true' : 'false',
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const FieldError = ({ name }) =>
    errors[name] ? (
      <p id={`${name}-error`} className="mt-1 text-[13px] font-medium text-coral-600">
        {errors[name]}
      </p>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="inline-flex items-center gap-2.5 text-3xl font-bold">
        <MessageSquareWarning className="h-8 w-8 text-coral-600" aria-hidden="true" />
        Complaint box
      </h1>
      <p className="mt-1 text-ink-soft">Report a scam, a payment problem or something that is broken. Only the admins can read it.</p>

      <Alert variant="warning" className="mt-5" title="Being scammed right now?">
        Do not hand over the item or meet the person again. Describe what happened below, including names, the item and the date.
      </Alert>
      <p className="mt-3 text-sm text-ink-soft">
        Problem with a specific student? Open their profile (click their name anywhere) and use <span className="font-semibold">Report user</span>.
      </p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-5 rounded-xl border border-line bg-white p-5" aria-labelledby="new-complaint-title">
        <h2 id="new-complaint-title" className="text-lg font-bold">
          New complaint
        </h2>

        <fieldset>
          <legend className="label">What is it about?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {COMPLAINT_CATEGORIES.map((c) => (
              <label
                key={c.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                  values.category === c.value ? 'border-blue-500 bg-blue-50' : 'border-line hover:border-blue-300'
                }`}
              >
                <input type="radio" name="category" value={c.value} checked={values.category === c.value} onChange={set('category')} className="mt-1 h-4 w-4 accent-blue-600" />
                <span>
                  <span className="block font-semibold">{c.label}</span>
                  {c.hint && <span className="block text-[13px] text-ink-soft">{c.hint}</span>}
                </span>
              </label>
            ))}
          </div>
          <FieldError name="category" />
        </fieldset>

        <div>
          <label htmlFor="complaint-subject" className="label">
            Subject
          </label>
          <input id="complaint-subject" className="input" maxLength={120} value={values.subject} onChange={set('subject')} placeholder="e.g. Seller took the payment but never came" {...fieldProps('subject')} />
          <FieldError name="subject" />
        </div>

        <div>
          <label htmlFor="complaint-description" className="label">
            What happened?
          </label>
          <textarea id="complaint-description" rows={6} className="input" maxLength={3000} value={values.description} onChange={set('description')} {...fieldProps('description')} />
          <div className="flex justify-between gap-3">
            <FieldError name="description" />
            <p className="ml-auto mt-1 text-xs text-ink-faint">{values.description.length} / 3000</p>
          </div>
        </div>

        {formError && <Alert variant="error">{formError}</Alert>}

        <button type="submit" disabled={sending} className="btn btn-primary">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          Send to admins
        </button>
      </form>

      <section className="mt-8" aria-labelledby="my-complaints-title">
        <h2 id="my-complaints-title" className="text-xl font-bold">
          My complaints
        </h2>
        {listError && (
          <Alert variant="error" className="mt-3">
            {listError}
          </Alert>
        )}
        {!complaints && !listError && (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6 text-blue-600" label="Loading your complaints" />
          </div>
        )}
        {complaints && complaints.length === 0 && <p className="mt-3 rounded-xl border border-line bg-white p-6 text-center text-ink-faint">You have not sent any complaints.</p>}
        {complaints && complaints.length > 0 && (
          <ul className="mt-3 space-y-3">
            {complaints.map((c) => {
              const status = COMPLAINT_STATUS[c.status] || COMPLAINT_STATUS.open;
              return (
                <li key={c.id} className="rounded-xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 break-words font-semibold">{c.subject}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.badge}`}>{status.label}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-faint">
                    {COMPLAINT_CATEGORY_LABELS[c.category]} · {formatDateTime(c.createdAt)}
                  </p>
                  <p className="mt-2 whitespace-pre-line break-words text-sm text-ink-soft">{c.description}</p>
                  {c.adminResponse && (
                    <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm">
                      <p className="inline-flex items-center gap-1.5 font-semibold text-blue-800">
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                        Admin response
                      </p>
                      <p className="mt-0.5 whitespace-pre-line break-words text-ink">{c.adminResponse}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {reports.length > 0 && (
        <section className="mt-8" aria-labelledby="my-reports-title">
          <h2 id="my-reports-title" className="text-xl font-bold">
            Students I reported
          </h2>
          <ul className="mt-3 space-y-3">
            {reports.map((r) => {
              const status = REPORT_STATUS[r.status] || REPORT_STATUS.open;
              return (
                <li key={r.id} className="rounded-xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">
                      {r.reported ? (
                        <Link to={`/users/${r.reported.id}`} className="hover:text-blue-700 hover:underline">
                          {r.reported.name}
                        </Link>
                      ) : (
                        'Deleted account'
                      )}
                      <span className="font-normal text-ink-soft"> · {REPORT_REASON_LABELS[r.reason]}</span>
                    </p>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.badge}`}>{status.label}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-faint">{formatDateTime(r.createdAt)}</p>
                  <p className="mt-2 whitespace-pre-line break-words text-sm text-ink-soft">{r.details}</p>
                  {r.adminNote && (
                    <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm">
                      <p className="inline-flex items-center gap-1.5 font-semibold text-blue-800">
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                        Admin response
                      </p>
                      <p className="mt-0.5 whitespace-pre-line break-words text-ink">{r.adminNote}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
