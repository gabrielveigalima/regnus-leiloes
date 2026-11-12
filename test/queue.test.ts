import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;

test("fila: claims simultâneos nunca pegam o mesmo job; retry com backoff", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../src/lib/prisma");
  const { enqueue, claimJob, failJob } = await import("../src/crawler/core/queue");
  await prisma.source.upsert({ where: { id: "qtest" }, update: {}, create: { id: "qtest", name: "q", type: "BANK", baseUrl: "http://q" } });
  await prisma.crawlJob.deleteMany({ where: { sourceId: "qtest" } });
  try {
    for (let i = 0; i < 6; i++) await enqueue("qtest", "DETAIL", { i });
    const claimed = (await Promise.all(Array.from({ length: 12 }, () => claimJob()))).filter((j) => j && j.sourceId === "qtest");
    const ids = claimed.map((j) => j!.id);
    assert.equal(new Set(ids).size, ids.length, "job entregue a dois workers");
    assert.equal(ids.length, 6);
    const j = claimed[0]!;
    await failJob(j.id, j.attempts, j.maxAttempts, "boom");
    const after = await prisma.crawlJob.findUniqueOrThrow({ where: { id: j.id } });
    assert.equal(after.status, "PENDING");
    assert.ok(after.runAt > new Date());
    await failJob(j.id, j.maxAttempts, j.maxAttempts, "boom");
    assert.equal((await prisma.crawlJob.findUniqueOrThrow({ where: { id: j.id } })).status, "FAILED");
  } finally {
    await prisma.crawlJob.deleteMany({ where: { sourceId: "qtest" } });
    await prisma.source.delete({ where: { id: "qtest" } });
    await prisma.$disconnect();
  }
});
