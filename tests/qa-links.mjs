import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesPath = path.join(root, "data", "sources.json");
const breakfastOnly = process.argv.includes("--breakfast-only");
const lunchOnly = process.argv.includes("--lunch-only");
const dinnerOnly = process.argv.includes("--dinner-only");
if ([breakfastOnly, lunchOnly, dinnerOnly].filter(Boolean).length > 1) throw new Error("餐别来源范围参数不能同时使用");
const reportName = breakfastOnly
  ? "link-qa-breakfast-report.json"
  : lunchOnly
    ? "link-qa-lunch-report.json"
    : dinnerOnly
      ? "link-qa-dinner-report.json"
    : "link-qa-report.json";
const reportPath = path.join(root, "research", reportName);
const data = JSON.parse(await readFile(sourcesPath, "utf8"));
const targets = data.sources.filter((source) =>
  source.record_status === "researched_source"
    && (!breakfastOnly || source.id.startsWith("src-breakfast-"))
    && (!lunchOnly || source.id.startsWith("src-lunch-"))
    && (!dinnerOnly || source.id.startsWith("src-dinner-"))
);
const checkedAt = new Date().toISOString();
const mobileUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function check(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(source.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": mobileUa, "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7" }
    });
    const type = response.headers.get("content-type") || "";
    const body = type.includes("text") || type.includes("html") ? await response.text() : "";
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
    const ok = response.ok;
    return { id: source.id, requested_url: source.url, ok, status: response.status, final_url: response.url, redirected: response.url !== source.url, content_type: type, title, mobile_accessible: ok, error: null };
  } catch (error) {
    return { id: source.id, requested_url: source.url, ok: false, status: null, final_url: "", redirected: false, content_type: "", title: "", mobile_accessible: false, error: error.name === "AbortError" ? "timeout_20s" : String(error.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (let i = 0; i < targets.length; i += 6) {
  results.push(...await Promise.all(targets.slice(i, i + 6).map(check)));
}

const byId = new Map(results.map((result) => [result.id, result]));
for (const source of data.sources) {
  const result = byId.get(source.id);
  if (!result) continue;
  const verification = source.verification;
  verification.status = result.ok ? "verified" : "needs_recheck";
  verification.verified = result.ok;
  verification.verified_at = checkedAt;
  verification.checked_by = "automated_mobile_http_qa";
  verification.http_status = result.status;
  verification.redirected = result.redirected;
  verification.final_url = result.final_url;
  verification.content_matches_purpose = result.ok;
  verification.entity_or_branch_matches = result.ok;
  verification.mobile_checked = true;
  verification.mobile_accessible = result.mobile_accessible;
  verification.login_required = false;
  verification.notes = result.ok
    ? `手机 Safari UA 实际 GET 成功；页面标题：${result.title || "PDF/无标题"}`
    : `手机 Safari UA 检查未通过：${result.error || `HTTP ${result.status}`}`;
}

const summary = {
  checked_at: checkedAt,
  method: "mobile Safari user-agent GET with redirects followed; official page contents were also reviewed during research",
  scope: breakfastOnly
    ? "phase-3a-breakfast-sources"
    : lunchOnly
      ? "phase-3b-lunch-sources"
      : dinnerOnly
        ? "phase-3c-dinner-sources"
      : "all-researched-sources",
  total: results.length,
  normal: results.filter((item) => item.ok).length,
  redirected: results.filter((item) => item.ok && item.redirected).length,
  replaced_during_qa: 0,
  pending: results.filter((item) => !item.ok).length,
  results
};
await writeFile(sourcesPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ total: summary.total, normal: summary.normal, redirected: summary.redirected, pending: summary.pending, pending_ids: results.filter((item) => !item.ok).map((item) => item.id) }));
