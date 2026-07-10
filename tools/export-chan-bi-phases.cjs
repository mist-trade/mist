#!/usr/bin/env node
require("ts-node/register");

const fs = require("node:fs");
const path = require("node:path");
const { BiService } = require("../apps/mist/src/chan/services/bi.service");

const [inputPath] = process.argv.slice(2);
if (!inputPath) {
  throw new Error("Usage: node tools/export-chan-bi-phases.cjs <merge-k.json>");
}

const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
if (!Array.isArray(raw)) throw new Error("merge-k.json 必须是数组");

const data = raw.map((m) => ({
  ...m,
  startTime: new Date(m.startTime),
  endTime: new Date(m.endTime),
  mergedData: m.mergedData.map((k) => ({
    ...k,
    time: new Date(k.time),
    amount: Number(k.amount),
    open: Number(k.open),
    close: Number(k.close),
    highest: Number(k.highest),
    lowest: Number(k.lowest),
  })),
}));

process.stdout.write(JSON.stringify(new BiService().getBi(data), null, 2) + "\n");
