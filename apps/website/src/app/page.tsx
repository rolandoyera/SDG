import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export default function Home() {
  return (
    <section className="flex flex-col justify-center py-24 sm:py-36">
      <h1 className="text-4xl font-semibold tracking-tight text-neutral-50 sm:text-5xl">
        {SITE_NAME}
      </h1>
      <p className="mt-5 max-w-xl text-lg text-neutral-300">
        Web design, engineering, and growth for small businesses.
      </p>
      <p className="mt-4 max-w-xl text-neutral-400">
        We build fast websites, the software that runs behind them, and the
        search and advertising systems that bring customers to them — end to
        end, for businesses that want one team handling all of it.
      </p>
      <div className="mt-10">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center rounded-full bg-neutral-50 px-6 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-neutral-300"
        >
          Get in touch
        </a>
      </div>
    </section>
  );
}
