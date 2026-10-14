import { Link } from 'react-router-dom';
import { IdCard, Lock, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../utils/format';

const STEPS = [
  {
    title: 'Verify your student ID',
    text: 'Create an account and upload a photo of your university ID card. An admin checks it against the details you entered.',
  },
  {
    title: 'List it or find it',
    text: 'Sell, swap or give away things you no longer use, or search for what you need by category, condition and price.',
  },
  {
    title: 'Chat and meet on campus',
    text: 'Agree on the price in a private chat, then hand the item over in person. No payment goes through the website.',
  },
];

const TRUST = [
  { icon: IdCard, title: 'Every member shows an ID', text: 'Nobody can post or chat until their university ID card has been approved.' },
  { icon: UserCheck, title: 'A real person reviews each account', text: 'Admins compare the card with the name and registration number, and explain any rejection.' },
  { icon: Lock, title: 'Your ID photo stays private', text: 'It is stored out of public reach. Only you and the admin team can open it.' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-20">
        <div>
          <h1 className="font-display text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl">
            Someone on campus needs what you're not using.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">
            WeReUse is a student-only marketplace. Sell, swap or give away books, gadgets and hostel gear, and deal with
            people who have shown a real university ID.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Link to={homeFor(user)} className="btn btn-primary px-6 py-3 text-base">
                Go to my {user.role === 'admin' ? 'verification queue' : 'dashboard'}
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary px-6 py-3 text-base">
                  Create your account
                </Link>
                <Link to="/login" className="btn btn-secondary px-6 py-3 text-base">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-sm lg:max-w-md" aria-hidden="true">
          <div className="absolute -bottom-4 -right-4 h-full w-full rounded-full bg-green-100" />
          <div className="relative aspect-square rounded-full border border-line bg-white p-8 sm:p-10">
            <img src="/logo.png" alt="" className="h-full w-full object-contain" />
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-white" aria-labelledby="how-title">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="how-title" className="text-3xl font-bold">
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="font-display text-5xl font-bold text-blue-200" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-2 text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-ink-soft">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.4fr]" aria-labelledby="trust-title">
        <div>
          <h2 id="trust-title" className="text-3xl font-bold">
            Built so you can trust the person on the other side
          </h2>
          <p className="mt-3 text-ink-soft">
            Most second-hand scams happen between strangers. On WeReUse, nobody is a stranger to the admin team.
          </p>
        </div>
        <ul className="space-y-6">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-ink-soft">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-8 text-sm text-ink-soft sm:px-6">
          <p className="font-semibold text-ink">WeReUse</p>
          <p>
            An SE-331 project by Khaled Mahmud Nahid, ASM Asadullah Santo and MD. Mostofa.
          </p>
        </div>
      </footer>
    </>
  );
}
