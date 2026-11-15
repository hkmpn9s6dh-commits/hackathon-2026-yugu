/** 重抓一次气象数据，与仓库里的快照逐日对账。
 *
 * 用法：node scripts/fetch-rain.mjs          核对（不一致退出 1）
 *       node scripts/fetch-rain.mjs --refresh 重新生成快照
 *
 * 为什么留这个：作品的全部数字都来自这份数据，数据变了版面就该重出；
 * 一张"看起来对"的图版和一个"能复现"的图版，差别就在这一条命令。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAP = path.join(ROOT, "data", "rain-2024.json");
const URL =
  "https://archive-api.open-meteo.com/v1/archive?latitude=30.2741&longitude=120.1551" +
  "&start_date=2024-06-09&end_date=2024-07-03&daily=precipitation_sum&timezone=Asia%2FShanghai";

const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"));
const res = await fetch(URL, { headers: { "user-agent": "yugu-verify/1.0" } });
if (!res.ok) {
  console.log(`! 接口没通（HTTP ${res.status}）：本条跳过，按快照为准`);
  process.exit(0);
}
const live = await res.json();

const a = snap.daily.map((d) => `${d.date}:${d.mm}`);
const b = live.daily.time.map((t, i) => `${t}:${live.daily.precipitation_sum[i]}`);
const diff = a.filter((x, i) => x !== b[i]);

if (diff.length) {
  console.error(`✗ 与快照不一致 ${diff.length} 天：`);
  for (const d of diff.slice(0, 8)) console.error("   " + d);
  if (process.argv.includes("--refresh")) {
    fs.writeFileSync(
      SNAP,
      JSON.stringify({ ...snap, daily: live.daily.time.map((t, i) => ({ date: t, mm: live.daily.precipitation_sum[i] })) }, null, 2) + "\n",
      "utf8"
    );
    console.log("已刷新 data/rain-2024.json —— 记得重跑 mkdata 与 render");
  } else {
    process.exit(1);
  }
} else {
  const total = live.daily.precipitation_sum.reduce((x, y) => x + y, 0);
  console.log(`✓ 25 天逐日对账一致，合计 ${total.toFixed(1)} 毫米`);
}
