import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const [placesData, restaurantsData, transportData, transitData, sourcesData] = await Promise.all([
  readJson("data/places.json"), readJson("data/restaurants.json"), readJson("data/transport.json"),
  readJson("data/transit-edges.json"), readJson("data/sources.json")
]);

const sourceIds = new Set();
const add = (value) => {
  if (Array.isArray(value)) value.filter(Boolean).forEach((item) => sourceIds.add(item));
  else if (value) sourceIds.add(value);
};

for (const place of placesData.places) {
  add(place.links?.official_site_source_id);
  add(place.links?.official_hours_source_id);
  add(place.links?.official_ticket_source_id);
}
for (const restaurant of restaurantsData.restaurants) {
  add(restaurant.links?.official_site_source_id);
  add(restaurant.links?.official_menu_source_id);
  add(restaurant.links?.official_reservation_source_id);
}
for (const option of transportData.transport_options) {
  if (option.record_status === "researched_transport") add(option.source_ids);
}
for (const edge of transitData.edges) {
  for (const option of edge.options || []) {
    add(option.official_timetable_source_ids);
  }
}

const sourceMap = new Map(sourcesData.sources.map((source) => [source.id, source]));
const missingSourceIds = [...sourceIds].filter((id) => !sourceMap.has(id));
if (missingSourceIds.length) throw new Error(`前台链接存在悬空source ID：${missingSourceIds.join(", ")}`);

const targets = [...sourceIds].map((id) => sourceMap.get(id)).filter((source) => source?.url);
const checkedAt = new Date().toISOString();
const mobileUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function check(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": mobileUa, "accept-language": "zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7" }
    });
    const contentType = response.headers.get("content-type") || "";
    let title = "";
    if (contentType.includes("text") || contentType.includes("html")) {
      const body = await response.text();
      title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
    }
    const ok = response.ok;
    const accessLimited = [401, 403, 429].includes(response.status);
    return {
      id: source.id, label: source.label, requested_url: source.url, final_url: response.url,
      status: response.status, ok, redirected: response.url !== source.url, access_limited: accessLimited,
      content_type: contentType, title, error: null,
      outcome: ok ? "normal" : accessLimited ? "pending_manual" : "failed"
    };
  } catch (error) {
    return {
      id: source.id, label: source.label, requested_url: source.url, final_url: "", status: null,
      ok: false, redirected: false, access_limited: false, content_type: "", title: "",
      error: error.name === "AbortError" ? "timeout_15s" : String(error.message || error), outcome: "pending_manual"
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
for (let index = 0; index < targets.length; index += 8) {
  results.push(...await Promise.all(targets.slice(index, index + 8).map(check)));
}

const summary = {
  checked_at: checkedAt,
  scope: "unique source URLs backing formal front-end official, menu, reservation and timetable buttons",
  total: results.length,
  normal: results.filter((item) => item.outcome === "normal").length,
  redirected_normal: results.filter((item) => item.outcome === "normal" && item.redirected).length,
  pending_manual: results.filter((item) => item.outcome === "pending_manual").length,
  failed: results.filter((item) => item.outcome === "failed").length,
  missing_source_ids: missingSourceIds,
  results
};

await writeFile(path.join(root, "research", "final-link-qa-report.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  total: summary.total, normal: summary.normal, redirected_normal: summary.redirected_normal,
  pending_manual: summary.pending_manual, failed: summary.failed,
  pending_ids: results.filter((item) => item.outcome === "pending_manual").map((item) => item.id),
  failed_ids: results.filter((item) => item.outcome === "failed").map((item) => item.id)
}));
