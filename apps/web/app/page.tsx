import Link from "next/link";
export default function Home() {
  return <main className="mx-auto max-w-3xl px-6 py-20 text-slate-900"><p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">Virtual Wardrobe · Sprint 0</p><h1 className="mt-4 text-4xl font-semibold tracking-tight">Avatar Reconstruction Lab</h1><p className="mt-6 text-lg text-slate-600">Explore the locally generated MHR neutral avatar. Photo reconstruction is not implemented yet.</p><Link href="/lab" className="mt-8 inline-block rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white">Open avatar studio →</Link></main>;
}
