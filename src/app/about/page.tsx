import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Database,
  FileText,
  GitMerge,
  Quote,
  Search,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

function FeatureCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-50/50 shadow-sm">
      <div className="bg-white p-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-un-blue/10">
            <Icon className="h-5 w-5 text-un-blue" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-gray-600">{description}</p>
      </div>
      {children && (
        <div className="flex flex-1 items-center border-t border-gray-100 p-4">
          <div className="w-full">{children}</div>
        </div>
      )}
    </div>
  );
}

function MockReportRow({
  symbol,
  title,
  year,
}: {
  symbol: string;
  title: string;
  year: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white p-2 text-xs shadow-sm">
      <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-un-blue">
        {symbol}
      </span>
      <span className="flex-1 truncate text-gray-600">{title}</span>
      <span className="text-gray-400">{year}</span>
    </div>
  );
}

function MockPublicationPattern() {
  const years = [2020, 2021, 2022, 2023, 2024, 2025];
  const hasPublication = [true, true, true, true, true, false];

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {years.map((year, i) => (
          <div key={year} className="flex-1 min-w-0">
            <div className="flex gap-[1px] mb-1">
              {[1, 2, 3, 4].map((q) => (
                <div
                  key={q}
                  className={`h-4 flex-1 transition-colors ${
                    hasPublication[i] && q === 2 ? "bg-un-blue" : "bg-gray-100"
                  }`}
                />
              ))}
            </div>
            <div
              className={`text-[9px] text-center ${
                hasPublication[i] ? "text-gray-600 font-medium" : "text-gray-300"
              }`}
            >
              {year}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockSimilarReport({
  title,
  symbol,
  similarity,
}: {
  title: string;
  symbol: string;
  similarity: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-gray-700">{title}</div>
        <div className="text-[10px] text-gray-400">{symbol}</div>
      </div>
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
        {similarity}%
      </span>
    </div>
  );
}

function MockMandateParagraph() {
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-gray-500">From A/RES/78/123:</div>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs italic text-gray-600 leading-relaxed">
          &ldquo;Requests the Secretary-General to submit an annual report on
          the implementation of the present resolution...&rdquo;
        </p>
      </div>
    </div>
  );
}

function MockEntityBadges() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center rounded-full font-medium whitespace-nowrap px-2 py-0.5 text-xs bg-blue-100 text-blue-800 border border-blue-500">
        DESA
      </span>
      <span className="inline-flex items-center rounded-full font-medium whitespace-nowrap px-2 py-0.5 text-xs bg-gray-100 text-gray-800 border border-gray-400">
        UNCTAD
      </span>
      <span className="inline-flex items-center rounded-full font-medium whitespace-nowrap px-2 py-0.5 text-xs bg-blue-50 text-blue-800 border border-dashed border-blue-600">
        DPPA
      </span>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header maxWidth="6xl" hideAbout />
      <main className="flex-1 bg-gradient-to-b from-gray-50 to-white">
        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-gray-900">
            SG Reports Overview
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-600">
            Data and analysis about reports of the Secretary-General:
            <br />
            catalog, publication patterns, mandates, and similar reports.
          </p>
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 rounded-lg bg-un-blue px-6 py-3 font-medium text-white transition-colors hover:bg-un-blue/90"
          >
            Browse Reports
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 pb-20">
          <h3 className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-gray-400">
            What you can explore
          </h3>

          <div className="grid gap-6 md:grid-cols-2">
            <FeatureCard
              icon={FileText}
              title="Browse All Reports"
              description="View Secretary-General reports from 2023 to present. Search by symbol or title, filter by issuing body, year, subject, entity, or reporting frequency."
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400">Search reports...</span>
                </div>
                <div className="space-y-1.5">
                  <MockReportRow
                    symbol="A/79/123"
                    title="Annual report on activities..."
                    year={2024}
                  />
                  <MockReportRow
                    symbol="A/78/456"
                    title="Implementation of resolution..."
                    year={2023}
                  />
                </div>
              </div>
            </FeatureCard>

            <FeatureCard
              icon={Building2}
              title="See Who Authors What"
              description="Each report shows the authoring entities, drawn from official DGACM and DRI data and from authoring entities' own confirmations. Solid badges are confirmed; dashed badges are official-source attribution."
            >
              <MockEntityBadges />
            </FeatureCard>

            <FeatureCard
              icon={BarChart3}
              title="Visualize Publication History"
              description="A compact quarter-by-quarter timeline shows when each report has actually been published over the past years. Compare the cadence to the mandate."
            >
              <MockPublicationPattern />
            </FeatureCard>

            <FeatureCard
              icon={Quote}
              title="Explore Mandating Paragraphs"
              description="View the original operative paragraphs from the resolutions that mandate each report — verbatim — so it is clear exactly what was requested and how often."
            >
              <MockMandateParagraph />
            </FeatureCard>

            <FeatureCard
              icon={GitMerge}
              title="Find Similar Reports"
              description="A semantic similarity search surfaces reports with overlapping content, which can be useful for identifying duplication or related work across entities."
            >
              <div className="space-y-2">
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Similar reports
                </div>
                <MockSimilarReport
                  title="Progress report on SDGs"
                  symbol="A/78/234 · DESA"
                  similarity={87}
                />
                <MockSimilarReport
                  title="Implementation update"
                  symbol="A/79/567 · DPO"
                  similarity={72}
                />
              </div>
            </FeatureCard>

            <FeatureCard
              icon={Database}
              title="Open Data Source"
              description="All report metadata comes from the UN Digital Library, refreshed regularly. The catalog includes computed reporting frequency, gap history between versions, and AI-extracted mandate text."
            >
              <a
                href="https://digitallibrary.un.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-un-blue font-medium hover:underline"
              >
                digitallibrary.un.org
                <ArrowRight className="h-3 w-3" />
              </a>
            </FeatureCard>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
