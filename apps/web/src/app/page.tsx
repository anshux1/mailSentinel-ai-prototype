export default function Home() {
	return (
		<main className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-zinc-950">
			<div className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-12">
				<p className="text-sm font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
					MailSentinel
				</p>
				<h1 className="mt-6 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 sm:text-5xl">
					Email security, without the noise.
				</h1>
				<p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
					Your MailSentinel workspace is ready for the product experience.
				</p>
			</div>
		</main>
	);
}
