import {
  BarChart3,
  FileText,
  GitMerge,
  Quote,
  Search,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReportsTable } from "@/components/SGReportsList";

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
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 shadow-sm">
      <div className="bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-un-blue/10">
            <Icon className="h-3.5 w-3.5 text-un-blue" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-gray-600">{description}</p>
      </div>
      {false && children && (
        <div className="flex flex-1 items-center border-t border-gray-100 p-3">
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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-background py-8">
        <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-8">
          <section className="space-y-4">
            <p className="max-w-3xl text-base leading-relaxed text-gray-600">
              Developed as part of the{" "}
              <a
                href="https://www.un.org/un80-initiative/en"
                target="_blank"
                rel="noopener noreferrer"
                className="text-un-blue hover:underline"
              >
                UN80 Initiative
              </a>
              , this list provides a consolidated view of
              Secretary-General&rsquo;s reports published as official documents
              of the United Nations from 2023 to 2025. It is intended to
              provide context for the analysis of the reporting landscape
              pursuant to the{" "}
              <a
                href="https://docs.un.org/en/A/RES/80/251#page=4"
                target="_blank"
                rel="noopener noreferrer"
                className="text-un-blue hover:underline"
              >
                General Assembly resolution 80/251 paragraph 16
              </a>
              . The list is drawn from the{" "}
              <a
                href="https://digitallibrary.un.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-un-blue hover:underline"
              >
                United Nations Digital Library
              </a>
              , where such Secretary-General&rsquo;s reports are stored.
            </p>
          </section>

          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                icon={FileText}
                title="Browse All Reports"
                description="Search by symbol or title; filter by body, year, entity, subjects or frequency."
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1">
                    <Search className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] text-gray-400">
                      Search reports...
                    </span>
                  </div>
                  <MockReportRow
                    symbol="A/79/123"
                    title="Annual report on activities..."
                    year={2024}
                  />
                </div>
              </FeatureCard>

              <FeatureCard
                icon={BarChart3}
                title="Publication History"
                description="View the publication pattern for this report title, based on when the current and previous versions were published each quarter."
              >
                <MockPublicationPattern />
              </FeatureCard>

              <FeatureCard
                icon={Quote}
                title="Mandate Source"
                description="Find the resolution or decision identified as the source of the reporting mandate, based on United Nations Digital Library metadata where available."
              >
                <MockMandateParagraph />
              </FeatureCard>

              <FeatureCard
                icon={GitMerge}
                title="Similar Reports"
                description="Find reports with similar or related topics, including reports from different sessions or intergovernmental bodies."
              >
                <div className="space-y-1.5">
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
            </div>
          </section>

          <section>
            <ReportsTable />
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
