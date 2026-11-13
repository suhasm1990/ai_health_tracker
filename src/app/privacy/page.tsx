import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { listFreeModels, PROVIDER_LABELS, resolveLlmConfig } from "@/lib/llm/config";

export const metadata: Metadata = {
  title: "Privacy Policy | AI Health Tracker",
  description: "How AI Health Tracker accesses, uses, stores and shares your Google account and health data.",
};

const CONTACT_EMAIL = "suhu.90@gmail.com";
const EFFECTIVE_DATE = "November 13, 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</div>
    </section>
  );
}

const LINK = "text-emerald-700 underline underline-offset-2 dark:text-emerald-400";

export default function PrivacyPage() {
  const llm = resolveLlmConfig();
  // Every provider the assistant can use: the default plus any free model the chat's picker offers.
  const providers = [
    ...new Set([
      ...(llm.provider === "mock" ? [] : [llm.provider]),
      ...listFreeModels().filter((m) => m.available).map((m) => m.provider),
    ]),
  ];
  const providerNames = providers.map((p) => PROVIDER_LABELS[p] ?? "a third-party AI provider");
  const aiProvider = providerNames.length ? providerNames.join(" or ") : null;
  const usesGemini = providers.includes("google");
  const contact = <a className={LINK} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <Link href="/" className={`text-sm ${LINK}`}>← Back to AI Health Tracker</Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Privacy Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Effective {EFFECTIVE_DATE}</p>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          AI Health Tracker is a personal, non-commercial app shared with friends and family. It shows your fitness, sleep and
          heart data from Google Health in one dashboard. This policy explains what the app reads, what it stores, and who can see it.
        </p>
      </header>

      <Section title="Data we access">
        <p>When you sign in with Google, you choose whether to grant access to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Your Google profile:</strong> name, email address and profile photo.</li>
          <li>
            <strong>Your Google Health data, read-only:</strong> activity and fitness (such as steps, distance, calories and workouts),
            health metrics (such as heart rate, heart rate variability, breathing rate, skin temperature, blood oxygen, weight and height), sleep, nutrition, and
            settings including your connected devices. This can include data synced into Google Health from other apps, such as Apple Health.
          </li>
        </ul>
        <p>The app never writes, changes or deletes anything in your Google account.</p>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To show your dashboard, trends and readiness score, compared with your own recent averages.</li>
          <li>To refresh your data automatically once a night, so your history stays up to date without opening the app.</li>
          <li>
            To answer questions in the AI health assistant.
            {aiProvider
              ? ` When you use it, the health data needed to answer your question is sent to ${aiProvider}${
                  providerNames.length > 1 ? ", depending on the model you pick in the assistant," : ""
                } to generate the reply.`
              : " The assistant currently runs within the app, and no health data is sent to an outside AI provider."}
            {usesGemini &&
              " Google Gemini is used on Google's free tier, and Google may use what is sent to it, including your question and the health data in it, to improve its products. Pick NVIDIA Nemotron in the assistant if you prefer that your data is not sent to Google for this."}
          </li>
          <li>
            To let the app owner check that everyone&apos;s sync is working and spot possible concerns. The owner can see your name,
            email, when you joined, when your data last synced, and automated flags such as &ldquo;resting heart rate above your
            usual&rdquo;, &ldquo;short sleep on recent nights&rdquo;, &ldquo;possible illness pattern&rdquo; or a change over the
            last 3 months, and which kinds of readings your device sends (for example, whether HRV arrives).
          </li>
        </ul>
        <p>
          Your data is not used for advertising and is not sold.
          {usesGemini ? " Apart from Google Gemini's free tier described above, it is not used to train AI models." : " It is not used to train AI models."}
        </p>
      </Section>

      <Section title="What we store">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your profile (name, email, time zone) and the dates you joined and last synced.</li>
          <li>Daily health summaries and workouts, starting with up to 30 days before you join and continuing nightly.</li>
          <li>The Google sign-in token used for nightly sync, encrypted.</li>
          <li>An encrypted sign-in cookie in your browser. The app also remembers your theme and whether you dismissed the install banner on your device.</li>
        </ul>
        <p>
          The app runs on Vercel, and data is stored in a hosted PostgreSQL database. Stored data is kept until you ask for it to be
          deleted.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          Only the service providers needed to run the app: Google (the source of your data), Vercel (hosting), the database host
          {providerNames.length ? `, and ${providerNames.join(" and ")} for the AI assistant` : ""}. We do not share your data with anyone else.
        </p>
      </Section>

      <Section title="Google API Services User Data Policy">
        <p>
          AI Health Tracker&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
          <a className={LINK} href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Stop access:</strong> remove AI Health Tracker in your{" "}
            <a className={LINK} href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
              Google account connections
            </a>
            . Nightly sync stops immediately.
          </li>
          <li>
            <strong>Delete your data:</strong> email {contact}, and your profile, stored health data and sign-in token will be deleted.
          </li>
          <li><strong>Get a copy:</strong> email {contact} for a copy of what is stored about you.</li>
        </ul>
      </Section>

      <Section title="Not medical advice">
        <p>
          AI Health Tracker is for general wellness only. It is not a medical device, and its scores, flags and AI answers are not a
          diagnosis. Always ask a qualified healthcare provider about medical questions.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes, the effective date above will be updated. Questions or requests: {contact}.
        </p>
      </Section>
    </main>
  );
}
