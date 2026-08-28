import test from "node:test";
import assert from "node:assert/strict";

await import("../js/maps.js");
const maps = globalThis.NagoyaMaps;

const hotel = { name: "名古屋万豪酒店", latitude: 35.1709, longitude: 136.8821 };
const atsuta = { name: "热田神宫", latitude: 35.1271, longitude: 136.9088 };
const shirotori = { name: "白鸟庭园", latitude: 35.1241, longitude: 136.9001 };
const inuyama = { name: "犬山城下町", latitude: 35.3828, longitude: 136.9442 };
const scmaglev = { name: "磁悬浮・铁道馆", latitude: 35.0489, longitude: 136.849 };
const oasis = { name: "Oasis 21", latitude: 35.1706, longitude: 136.9092 };
const mirai = { name: "中部电力 MIRAI TOWER", latitude: 35.1724, longitude: 136.9083 };
const horaiken = { name: "热田蓬莱轩 神宫店", latitude: 35.122349, longitude: 136.908524 };

const googleCases = [
  ["名古屋站到热田神宫", hotel, atsuta, "transit"],
  ["热田神宫到白鸟庭园", atsuta, shirotori, "walking"],
  ["名古屋站到犬山", hotel, inuyama, "transit"],
  ["名古屋站到金城ふ头", hotel, scmaglev, "transit"],
  ["Oasis 21到MIRAI TOWER", oasis, mirai, "walking"],
  ["热田神宫到蓬莱轩神宫店", atsuta, horaiken, "walking"]
];

for (const [label, origin, destination, mode] of googleCases) {
  test(`Google Maps：${label}`, () => {
    const url = new URL(maps.buildRouteLinks(origin, destination, mode).google_maps);
    assert.equal(url.origin, "https://www.google.com");
    assert.equal(url.pathname, "/maps/dir/");
    assert.equal(url.searchParams.get("api"), "1");
    assert.equal(url.searchParams.get("origin"), `${origin.latitude},${origin.longitude}`);
    assert.equal(url.searchParams.get("destination"), `${destination.latitude},${destination.longitude}`);
    assert.equal(url.searchParams.get("travelmode"), mode);
  });
}

const amapCases = [hotel, atsuta, shirotori, oasis, mirai, inuyama, scmaglev, horaiken];
for (const destination of amapCases) {
  test(`高德地点预览：${destination.name}`, () => {
    const url = new URL(maps.buildRouteLinks(hotel, destination, "transit").amap);
    assert.equal(url.origin, "https://uri.amap.com");
    assert.equal(url.pathname, "/search");
    assert.match(url.searchParams.get("keyword"), new RegExp(destination.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(url.searchParams.get("city"), "日本名古屋");
    assert.equal(url.searchParams.get("callnative"), "0");
  });
}
