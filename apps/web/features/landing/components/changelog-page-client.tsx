"use client";

import { useEffect, useState } from "react";
import { LandingHeader } from "./landing-header";
import { LandingFooter } from "./landing-footer";
import { useLocale } from "../i18n";
import type { Locale } from "../i18n/types";

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMonthDay(dateStr: string, locale: Locale) {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return dateStr;
  if (locale === "zh") return `${month}\u6708${day}\u65e5`;
  return `${MONTHS_EN[month - 1]} ${day}`;
}

function ChangeList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((change) => (
        <li
          key={change}
          className="flex items-start gap-2.5 text-[14px] leading-[1.7] text-[#0a0d12]/60 sm:text-[15px]"
        >
          <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#0a0d12]/30" />
          {change}
        </li>
      ))}
    </ul>
  );
}

function anchorId(version: string) {
  return `release-${version.replace(/\./g, "-")}`;
}

export function ChangelogPageClient() {
  const { t, locale } = useLocale();
  const categoryLabels = t.changelog.categories;
  const entries = t.changelog.entries;

  const [activeVersion, setActiveVersion] = useState<string>(
    entries[0]?.version ?? ""
  );

  useEffect(() => {
    if (entries.length === 0) return;
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (observed) => {
        observed.forEach((entry) => {
          const version = (entry.target as HTMLElement).dataset.version;
          if (!version) return;
          if (entry.isIntersecting) visible.add(version);
          else visible.delete(version);
        });
        const firstVisible = entries.find((r) => visible.has(r.version));
        if (firstVisible) {
          setActiveVersion(firstVisible.version);
          return;
        }
        // Nothing is in the active band: pick the last one passed above it.
        const scrollY = window.scrollY;
        let best = entries[0]?.version ?? "";
        for (const release of entries) {
          const el = document.getElementById(anchorId(release.version));
          if (!el) continue;
          if (el.getBoundingClientRect().top + scrollY <= scrollY + 120) {
            best = release.version;
          }
        }
        setActiveVersion(best);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    entries.forEach((release) => {
      const el = document.getElementById(anchorId(release.version));
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [entries]);

  return (
    <>
      <LandingHeader variant="light" />
      <main className="bg-white text-[#0a0d12]">
        <div className="relative mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <aside
            aria-label={t.changelog.toc}
            className="pointer-events-none absolute right-4 top-0 hidden h-full w-[180px] lg:block xl:right-6"
          >
            <nav className="pointer-events-auto sticky top-28">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0a0d12]/50">
                {t.changelog.toc}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {entries.map((release) => {
                  const isActive = release.version === activeVersion;
                  return (
                    <li key={release.version}>
                      <a
                        href={`#${anchorId(release.version)}`}
                        aria-current={isActive ? "true" : undefined}
                        className={[
                          "block text-[11px] font-semibold uppercase tracking-[0.14em] tabular-nums transition-colors",
                          isActive
                            ? "text-[#0a0d12]"
                            : "text-[#0a0d12]/35 hover:text-[#0a0d12]/70",
                        ].join(" ")}
                      >
                        {formatMonthDay(release.date, locale)}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="mx-auto max-w-[720px]">
            <h1 className="font-[family-name:var(--font-serif)] text-[2.6rem] leading-[1.05] tracking-[-0.03em] sm:text-[3.4rem]">
              {t.changelog.title}
            </h1>
            <p className="mt-4 text-[15px] leading-7 text-[#0a0d12]/60 sm:text-[16px]">
              {t.changelog.subtitle}
            </p>

            <div className="mt-16 space-y-16">
              {entries.map((release) => {
                const hasCategorized =
                  release.features || release.improvements || release.fixes;

                return (
                  <section
                    key={release.version}
                    id={anchorId(release.version)}
                    data-version={release.version}
                    className="relative scroll-mt-28"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="text-[13px] font-semibold tabular-nums">
                        v{release.version}
                      </span>
                      <span className="text-[13px] text-[#0a0d12]/40">
                        {formatMonthDay(release.date, locale)}
                      </span>
                    </div>
                    <h2 className="mt-2 text-[20px] font-semibold leading-snug sm:text-[22px]">
                      {release.title}
                    </h2>

                    {hasCategorized ? (
                      <div className="mt-4 space-y-5">
                        {release.features && release.features.length > 0 && (
                          <div>
                            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#0a0d12]/50">
                              {categoryLabels.features}
                            </h3>
                            <ChangeList items={release.features} />
                          </div>
                        )}
                        {release.improvements &&
                          release.improvements.length > 0 && (
                            <div>
                              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#0a0d12]/50">
                                {categoryLabels.improvements}
                              </h3>
                              <ChangeList items={release.improvements} />
                            </div>
                          )}
                        {release.fixes && release.fixes.length > 0 && (
                          <div>
                            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#0a0d12]/50">
                              {categoryLabels.fixes}
                            </h3>
                            <ChangeList items={release.fixes} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <ChangeList items={release.changes} />
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </>
  );
}
