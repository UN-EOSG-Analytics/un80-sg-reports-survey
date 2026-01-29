import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  FileText,
  GitMerge,
  LayoutDashboard,
  Mic,
  Pencil,
  Plus,
  Quote,
  Search,
  Sparkles,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const dynamic = "force-dynamic";

// =============================================================================
// Feature Card Component
// =============================================================================

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

// =============================================================================
// Mini Mockup Components
// =============================================================================

// Mock report row for Browse All Reports
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

// Mock publication pattern visualization
function MockPublicationPattern() {
  const years = [2020, 2021, 2022, 2023, 2024, 2025];
  const hasPublication = [true, true, true, true, true, false];
  const quarters = ["Q2", "Q2", "Q2", "Q2", "Q2", ""];

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
      <div className="flex gap-2 text-[8px] text-gray-400">
        {quarters.map((q, i) => (
          <div key={i} className="flex-1 text-center">{q}</div>
        ))}
      </div>
    </div>
  );
}

// Mock frequency selector
function MockFrequencyOption({
  label,
  selected,
}: {
  label: string;
  selected?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span
        className={`h-3 w-3 rounded-full border ${
          selected
            ? "border-un-blue bg-un-blue"
            : "border-gray-300"
        }`}
      >
        {selected && (
          <span className="flex h-full w-full items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          </span>
        )}
      </span>
      {label}
    </div>
  );
}

// Mock format option card
function MockFormatCard({
  icon: Icon,
  label,
  selected,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  selected?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center ${
        selected
          ? "border-un-blue bg-blue-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <Icon className={`h-4 w-4 ${selected ? "text-un-blue" : "text-gray-500"}`} />
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  );
}

// Mock similar report for merge
function MockSimilarReport({
  title,
  symbol,
  similarity,
  merged,
}: {
  title: string;
  symbol: string;
  similarity: number;
  merged?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-gray-700">{title}</div>
        <div className="text-[10px] text-gray-400">{symbol}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
          {similarity}%
        </span>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
            merged
              ? "bg-un-blue text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {merged ? (
            <span className="flex items-center gap-1">
              <Check className="h-2.5 w-2.5" /> Merge
            </span>
          ) : (
            "Merge"
          )}
        </span>
      </div>
    </div>
  );
}

// Mock mandating paragraph
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

// =============================================================================
// Main About Page
// =============================================================================

export default async function AboutPage() {
  const user = await getCurrentUser();
  const isLoggedIn = !!user;
  const ctaHref = isLoggedIn ? "/" : "/login";

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} maxWidth="6xl" hideAbout />
      <main className="flex-1 bg-gradient-to-b from-gray-50 to-white">
        {/* Hero Section */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-gray-900">
            SG Reports Survey
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-gray-600">
            Provide feedback on Secretary-General reports:
            <br />
            frequency, format, and consolidation opportunities.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-lg bg-un-blue px-6 py-3 font-medium text-white transition-colors hover:bg-un-blue/90"
            >
              {isLoggedIn ? "Go to Dashboard" : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/reports"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Browse Reports
            </Link>
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="mx-auto max-w-6xl px-4 pb-20">
          <h3 className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-gray-400">
            Survey Features
          </h3>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 1. Browse All Reports */}
            <FeatureCard
              icon={FileText}
              title="Browse All Reports"
              description="View all Secretary-General reports from 2023-2025. Search by symbol or title, filter by issuing body, year, or subject, and sort by any column."
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

            {/* 2. Find Your Reports */}
            <FeatureCard
              icon={Building2}
              title="Find Your Reports"
              description="Search for reports authored by your entity and confirm ownership. Once confirmed, you can provide feedback on each report's future."
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-3 py-2">
                  <Plus className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400">
                    Search to add reports...
                  </span>
                </div>
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Your reports
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs shadow-sm">
                    <Check className="h-3 w-3 text-green-500" />
                    <span className="text-gray-700">Annual report on activities</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs shadow-sm">
                    <Check className="h-3 w-3 text-green-500" />
                    <span className="text-gray-700">Implementation of resolution</span>
                  </div>
                </div>
              </div>
            </FeatureCard>

            {/* 3. Visualize Publication History */}
            <FeatureCard
              icon={BarChart3}
              title="Visualize Publication History"
              description="See when each report has been published over time. The visual timeline helps you identify the actual reporting frequency."
            >
              <MockPublicationPattern />
            </FeatureCard>

            {/* 4. Confirm or Adjust Frequency */}
            <FeatureCard
              icon={Calendar}
              title="Confirm or Adjust Frequency"
              description="Confirm the current reporting frequency or recommend a change. Options range from multiple times per year to one-time only."
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <span className="text-xs text-gray-700">Annual</span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MockFrequencyOption label="Multiple/year" />
                  <MockFrequencyOption label="Annual" selected />
                  <MockFrequencyOption label="Biennial" />
                  <MockFrequencyOption label="Triennial" />
                  <MockFrequencyOption label="Quadrennial" />
                  <MockFrequencyOption label="One-time" />
                </div>
              </div>
            </FeatureCard>

            {/* 5. Recommend New Formats */}
            <FeatureCard
              icon={Sparkles}
              title="Recommend New Formats"
              description="Suggest innovative reporting formats. Reports could be shorter, delivered orally, or transformed into interactive dashboards."
            >
              <div className="space-y-2">
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Recommended format
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MockFormatCard icon={FileText} label="Shorter report" />
                  <MockFormatCard icon={Mic} label="Oral update" />
                  <MockFormatCard icon={LayoutDashboard} label="Dashboard" selected />
                  <MockFormatCard icon={Pencil} label="Other" />
                </div>
              </div>
            </FeatureCard>

            {/* 6. Suggest Report Mergers */}
            <FeatureCard
              icon={GitMerge}
              title="Suggest Report Mergers"
              description="Identify reports with similar content that could be consolidated. Similarity search finds merge candidates automatically."
            >
              <div className="space-y-2">
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  Similar reports found
                </div>
                <MockSimilarReport
                  title="Progress report on SDGs"
                  symbol="A/78/234 · DESA"
                  similarity={87}
                  merged
                />
                <MockSimilarReport
                  title="Implementation update"
                  symbol="A/79/567 · DPO"
                  similarity={72}
                />
              </div>
            </FeatureCard>

            {/* 7. Explore Mandating Paragraphs */}
            <FeatureCard
              icon={Quote}
              title="Explore Mandating Paragraphs"
              description="View the original operative paragraphs from resolutions that mandate each report. Understand exactly what was requested and when."
            >
              <MockMandateParagraph />
            </FeatureCard>
          </div>
        </section>

        {/* Getting Started Section */}
        <section className="border-t border-gray-200 bg-gray-50 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center">
            <h3 className="mb-8 text-2xl font-bold text-gray-900">
              Get Started in 3 Steps
            </h3>
            <div className="grid gap-8 md:grid-cols-3">
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-un-blue text-lg font-bold text-white">
                  1
                </div>
                <h4 className="mb-2 font-semibold text-gray-900">Sign In</h4>
                <p className="text-sm text-gray-600">
                  Enter your email and click the magic link sent to your inbox.
                </p>
              </div>
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-un-blue text-lg font-bold text-white">
                  2
                </div>
                <h4 className="mb-2 font-semibold text-gray-900">Select Your Entity</h4>
                <p className="text-sm text-gray-600">
                  Choose your organisational entity on first sign-in to access your dashboard.
                </p>
              </div>
              <div>
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-un-blue text-lg font-bold text-white">
                  3
                </div>
                <h4 className="mb-2 font-semibold text-gray-900">Complete Surveys</h4>
                <p className="text-sm text-gray-600">
                  Find your reports and provide feedback on frequency, format, and consolidation.
                </p>
              </div>
            </div>
            <Link
              href={ctaHref}
              className="mt-10 inline-flex items-center gap-2 rounded-lg bg-un-blue px-6 py-3 font-medium text-white transition-colors hover:bg-un-blue/90"
            >
              {isLoggedIn ? "Go to Dashboard" : "Get Started"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
