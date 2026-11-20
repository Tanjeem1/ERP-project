import { Plus } from "lucide-react";

export function FaqList({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  return (
    <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">
      {faqs.map((faq, index) => (
        <details key={faq.question} name="erp-faq" className="group" open={index === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[15px] font-semibold leading-6 tracking-tight marker:hidden [&::-webkit-details-marker]:hidden">
            <span role="heading" aria-level={3}>{faq.question}</span>
            <Plus className="size-4 shrink-0 text-slate-500 transition-transform duration-200 group-open:rotate-45" />
          </summary>
          <div className="max-w-3xl pb-6"><p className="text-sm leading-7 text-muted-foreground">{faq.answer}</p></div>
        </details>
      ))}
    </div>
  );
}
