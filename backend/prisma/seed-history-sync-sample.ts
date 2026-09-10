import {
  DongilSyncOutboxStatus,
  InspectionStatus,
  LineSessionEndReason,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();
const SAMPLE_PREFIX = 'sample-history-202609-';
const SAMPLE_RESULT_COUNT = 10_000;
const START_DAY = 1;
const END_DAY = 6;
const HOOKED_UNTIL = new Date('2100-01-01T00:00:00.000Z');

type SeedOptions = {
  count: number;
  prefix: string;
  today: boolean;
  todayStart?: Date;
  todayEnd?: Date;
};

type SampleResult = {
  localResultId: string;
  productId: string;
  productCode: string;
  productName: string;
  jobKey: string;
  inspectedAt: Date;
  result: 'OK' | 'NG';
};

type SessionBounds = {
  productId: string;
  earliest: Date;
  latest: Date;
};

async function main() {
  assertLocalDatabase();

  const options = createSeedOptions(process.argv.slice(2));

  const [existingOutbox, existingLogs, products, actor] = await Promise.all([
    prisma.dongilSyncOutbox.count({
      where: { localResultId: { startsWith: options.prefix } },
    }),
    prisma.inspectionLog.count({
      where: { plcCaptureId: { startsWith: options.prefix } },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.user.findFirst({
      where: { active: true },
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    }),
  ]);

  if (existingOutbox > 0 || existingLogs > 0) {
    throw new Error(
      `Sample history data already exists (${existingOutbox} outbox rows, ${existingLogs} inspection logs).`,
    );
  }
  if (products.length === 0) {
    throw new Error('No active product exists. Create or activate a product before seeding samples.');
  }
  if (!actor) {
    throw new Error('No active user exists to own the sample inspection sessions.');
  }

  const random = createRandom(options.today ? Date.now() : 20260909);
  const samples: SampleResult[] = [];
  const sessions = new Map<string, SessionBounds>();
  const dayCount = END_DAY - START_DAY + 1;

  for (let index = 0; index < options.count; index += 1) {
    const day = START_DAY + (index % dayCount);
    const product =
      index < products.length
        ? products[index]
        : products[Math.floor(random() * products.length)];
    const inspectedAt = options.today
      ? evenlySpacedTime(
          options.todayStart!,
          options.todayEnd!,
          index,
          options.count,
        )
      : randomTimeOnVietnamDay(2026, 9, day, random);
    const result =
      index === 0
        ? 'OK'
        : index === 1
          ? 'NG'
          : random() < 0.78
            ? 'OK'
            : 'NG';
    const jobKey = `${vietnamDate(inspectedAt)}:${product.id}`;
    const existingSession = sessions.get(jobKey);
    sessions.set(jobKey, {
      productId: product.id,
      earliest:
        !existingSession || inspectedAt < existingSession.earliest
          ? inspectedAt
          : existingSession.earliest,
      latest:
        !existingSession || inspectedAt > existingSession.latest
          ? inspectedAt
          : existingSession.latest,
    });
    samples.push({
      localResultId: `${options.prefix}${String(index + 1).padStart(6, '0')}`,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      jobKey,
      inspectedAt,
      result,
    });
  }

  const jobIdByKey = new Map<string, string>();
  for (const [jobKey, session] of sessions) {
    const job = await prisma.inspectionJob.create({
      data: {
        productId: session.productId,
        operatorId: actor.id,
        endedById: actor.id,
        status: InspectionStatus.completed,
        startedAt: session.earliest,
        stoppedAt: session.latest,
        endReason: LineSessionEndReason.line_stop,
        note: 'Sample history synchronization data. No image was created.',
        createdAt: session.earliest,
      },
      select: { id: true },
    });
    jobIdByKey.set(jobKey, job.id);
  }

  for (const chunk of chunks(samples, 500)) {
    await prisma.$transaction([
      prisma.inspectionLog.createMany({
        data: chunk.map((sample) => ({
          jobId: jobIdByKey.get(sample.jobKey)!,
          plcCaptureId: sample.localResultId,
          slotIndex: 0,
          slotLabel: 'sample-history',
          result: sample.result,
          capturedAt: sample.inspectedAt,
        })),
      }),
      prisma.dongilSyncOutbox.createMany({
        data: chunk.map((sample) => ({
          localResultId: sample.localResultId,
          productCode: sample.productCode,
          productName: sample.productName,
          result: sample.result,
          okCount: sample.result === 'OK' ? 1 : 0,
          ngCount: sample.result === 'NG' ? 1 : 0,
          localSessionId: jobIdByKey.get(sample.jobKey)!,
          inspectedAt: sample.inspectedAt,
          // Keep test data out of the normal sender. A history run explicitly
          // selects it regardless of nextAttemptAt and makes it sendable.
          status: DongilSyncOutboxStatus.PENDING,
          nextAttemptAt: HOOKED_UNTIL,
          createdAt: sample.inspectedAt,
        })),
      }),
    ]);
  }

  const okCount = samples.filter(
    (sample) => sample.result === 'OK',
  ).length;
  const byDay = new Map<string, number>();
  for (const sample of samples) {
    const day = vietnamDate(sample.inspectedAt);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        actor: actor.username,
        products: products.map((product) => product.code),
        sessionsCreated: jobIdByKey.size,
        resultsCreated: samples.length,
        ok: okCount,
        ng: samples.length - okCount,
        byDay: Object.fromEntries(byDay),
        inspectedFrom: samples[0]?.inspectedAt.toISOString(),
        inspectedTo: samples.at(-1)?.inspectedAt.toISOString(),
        outboxBehavior:
          'Pending until 2100 to prevent normal automatic sending; start Dongil history sync to upload test data.',
      },
      null,
      2,
    ),
  );
}

function createSeedOptions(args: string[]): SeedOptions {
  const today = args.includes('--today');
  const countArgument = args.find((argument) => argument.startsWith('--count='));
  const count = countArgument
    ? Number.parseInt(countArgument.slice('--count='.length), 10)
    : SAMPLE_RESULT_COUNT;

  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error('--count must be a positive integer.');
  }

  if (!today) {
    return { count, prefix: SAMPLE_PREFIX, today: false };
  }

  const now = new Date();
  const todayKey = vietnamDate(now);
  const todayStart = new Date(`${todayKey}T00:00:00+07:00`);
  const todayEnd = new Date(now.getTime() - 1_000);
  if (todayEnd <= todayStart) {
    throw new Error('Cannot seed today before the first second of the GMT+7 day.');
  }

  return {
    count,
    prefix: `sample-history-today-${todayKey.replaceAll('-', '')}-${Date.now().toString(36)}-`,
    today: true,
    todayStart,
    todayEnd,
  };
}

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const host = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to seed non-local database host: ${host}`);
  }
}

function createRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function randomTimeOnVietnamDay(
  year: number,
  month: number,
  day: number,
  random: () => number,
) {
  const start = Date.UTC(year, month - 1, day - 1, 17, 0, 0);
  return new Date(start + Math.floor(random() * 24 * 60 * 60 * 1_000));
}

function evenlySpacedTime(
  start: Date,
  end: Date,
  index: number,
  count: number,
) {
  const fraction = (index + 1) / (count + 1);
  return new Date(start.getTime() + Math.floor((end.getTime() - start.getTime()) * fraction));
}

function vietnamDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function* chunks<T>(items: T[], size: number) {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
