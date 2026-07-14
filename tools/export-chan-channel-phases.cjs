#!/usr/bin/env node
require('tsconfig-paths/register');
require('ts-node/register');

const fs = require('node:fs');
const path = require('node:path');
const { BiService } = require('../apps/mist/src/chan/services/bi.service');
const {
  ChannelService,
} = require('../apps/mist/src/chan/services/channel.service');

const [inputPath] = process.argv.slice(2);
if (!inputPath) {
  throw new Error(
    'Usage: node tools/export-chan-channel-phases.cjs <merge-k.json>',
  );
}

const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
if (!Array.isArray(raw)) throw new Error('merge-k.json 必须是数组');

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

// 与 export-chan-bi-phases.cjs 对齐：从 merge-k 现算笔（phaseB）再算中枢
const bi = new BiService().getBi(data);
const channel = new ChannelService().createChannel({ bi: bi.phaseB });

process.stdout.write(JSON.stringify(channel, null, 2) + '\n');
