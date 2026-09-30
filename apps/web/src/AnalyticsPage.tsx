import { useEffect, useRef, useState } from "react";
import { select } from "d3";
import { api } from "./api";

type Summary = { byStatus: Record<string, number>; skills: Record<string, number> };

export default function AnalyticsPage() {
  const ref = useRef<SVGSVGElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api("/analytics/summary").then(setSummary).catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    if (!summary || !ref.current) return;
    const entries = Object.entries(summary.byStatus);
    const svg = select(ref.current);
    svg.selectAll("*").remove();
    svg.selectAll("rect").data(entries).enter().append("rect")
      .attr("x", (_row, index) => index * 48)
      .attr("y", (row) => 120 - row[1] * 8)
      .attr("width", 32)
      .attr("height", (row) => row[1] * 8)
      .attr("fill", "#c2410c");
  }, [summary]);
  if (error) return <p role="alert">{error}</p>;
  if (!summary) return <p>Loading analytics</p>;
  const total = Object.values(summary.byStatus).reduce((sum, value) => sum + value, 0);
  return (
    <section className="p-8">
      <h1 className="text-4xl font-black">Analytics</h1>
      <p>Applications {total}</p>
      {total === 0 ? <p>No applications yet.</p> : <svg ref={ref} width="480" height="140" role="img" aria-label="Application funnel" />}
    </section>
  );
}
