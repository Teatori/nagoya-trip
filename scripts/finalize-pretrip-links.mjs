import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "data", "sources.json");
const data = JSON.parse(await readFile(file, "utf8"));
const checkedAt = "2026-08-28T02:00:00+08:00";

function updateSource(id, changes) {
  const source = data.sources.find((item) => item.id === id);
  if (!source) throw new Error(`Missing source: ${id}`);
  Object.assign(source, changes);
}

updateSource("src-breakfast-kako-official", {
  label: "KAKO 花车本店官方主页",
  url: "https://kakomaster1972.wixsite.com/kako1972/%E3%83%9B%E3%83%BC%E3%83%A0",
  purpose: ["official_site", "business_hours", "temporary_closure_recheck"],
  verification: {
    status: "verified",
    verified: true,
    verified_at: checkedAt,
    checked_by: "pre_trip_official_web_recheck",
    http_status: 200,
    redirected: false,
    final_url: "https://kakomaster1972.wixsite.com/kako1972/%E3%83%9B%E3%83%BC%E3%83%A0",
    content_matches_purpose: true,
    entity_or_branch_matches: true,
    mobile_checked: false,
    mobile_accessible: null,
    login_required: false,
    access_restrictions: [],
    notes: "官方公开主页已确认店名、地址和营业信息；替换可能要求登录的 Instagram 入口。移动端请发布前人工点验一次。"
  },
  retrieved_at: "2026-08-28",
  notes: ["官方公开主页；不需要社交平台登录。"]
});

updateSource("src-transit-day-passes", {
  url: "https://www.kotsu.city.nagoya.jp/rp/ticket/trp0000310.htm",
  verification: {
    status: "verified",
    verified: true,
    verified_at: checkedAt,
    checked_by: "pre_trip_official_web_recheck",
    http_status: 200,
    redirected: false,
    final_url: "https://www.kotsu.city.nagoya.jp/rp/ticket/trp0000310.htm",
    content_matches_purpose: true,
    entity_or_branch_matches: true,
    mobile_checked: false,
    mobile_accessible: null,
    login_required: false,
    access_restrictions: [],
    notes: "从旧移动版跳转地址替换为当前官方固定页面；页面含一日券与地下铁24小时券现行价格和使用规则。"
  },
  retrieved_at: "2026-08-28"
});

updateSource("src-sky", {
  verification: {
    status: "needs_recheck",
    verified: false,
    verified_at: checkedAt,
    checked_by: "pre_trip_browser_recheck",
    http_status: null,
    redirected: false,
    final_url: "https://www.midland-square.com/sky-promenade/",
    content_matches_purpose: true,
    entity_or_branch_matches: true,
    mobile_checked: true,
    mobile_accessible: false,
    login_required: false,
    access_restrictions: ["本次自动手机请求与真实浏览器均连接超时"],
    notes: "官方页面内容可由公开索引确认，但本次真实浏览器连接超时；前台继续隐藏官网按钮并列为人工点验项。"
  },
  retrieved_at: "2026-08-28"
});

await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ updated: 3, sources: data.sources.length }));
