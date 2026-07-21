import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import {
  InspectionResult,
  InspectionStatus,
  LineResultSavePolicy,
  LineSessionEndReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { CameraProfileDto } from '../products/dto/product-profile.dto';
import { CreateTestSessionReportDto } from './dto/create-test-session-report.dto';
import { UpdateLineResultSettingsDto } from './dto/line-result-settings.dto';
import {
  evaluateInspectionSlot,
  resolveInspectionAggregateResult,
  resolveInspectionResults,
} from './inspection-text-matcher';
import { StartInspectionDto } from './dto/start-inspection.dto';
import { TestInspectionImageDto } from './dto/test-inspection-image.dto';

const productInclude = {
  cameraConfig: { include: { cameraIdentity: true } },
  roiRegions: { orderBy: { index: 'asc' as const } },
};

const LINE_RESULT_SETTINGS_ID = 'default';

type ProductWithProfile = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

type InspectionJobWithLogs = Prisma.InspectionJobGetPayload<{
  include: {
    logs: {
      orderBy: { capturedAt: 'desc' };
    };
  };
}>;

type ProductFrameScan = Awaited<
  ReturnType<DeviceToolService['inspectProductFrame']>
>;

type CompletedLineDetection = {
  jobId: string;
  productId: string;
  imageBase64: string;
  completedAt: Date;
  product: ProductWithProfile;
  scan: ProductFrameScan;
};

@Injectable()
export class InspectionsService {
  private latestCompletedLineDetection: CompletedLineDetection | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly deviceToolService: DeviceToolService,
  ) {}

  async startInspection(
    dto: StartInspectionDto,
    user: { id: string; username: string; role: string },
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: productInclude,
    });

    if (!product || !product.active) {
      throw new NotFoundException('Active product not found');
    }

    if (!product.modelPath) {
      throw new BadRequestException('Product model path is required');
    }

    if (product.roiRegions.length === 0) {
      throw new BadRequestException('Product ROI regions are required');
    }

    const existingRunningJob = await this.prisma.inspectionJob.findFirst({
      where: { status: InspectionStatus.running },
      orderBy: { createdAt: 'desc' },
    });

    if (
      existingRunningJob &&
      (existingRunningJob.productId !== product.id ||
        existingRunningJob.operatorId !== user.id)
    ) {
      throw new ConflictException('Another inspection job is already running');
    }

    const lineResultSettings = existingRunningJob
      ? null
      : await this.ensureLineResultSettings();
    const job =
      existingRunningJob ??
      (await this.prisma.inspectionJob.create({
        data: {
          productId: product.id,
          operatorId: user.id,
          status: InspectionStatus.running,
          startedAt: new Date(),
          note: dto.operatorNote || null,
          resultSaveFolderPath: lineResultSettings?.saveFolderPath ?? null,
          resultSavePolicy: lineResultSettings?.savePolicy ?? null,
        },
      }));

    try {
      const scan = await this.deviceToolService.inspectProduct({
        modelPath: product.modelPath,
        camera: this.toCameraProfile(product),
        roiRegions: product.roiRegions.map((region) => ({
          index: region.index,
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          rotation: Number(region.rotation),
        })),
        thresholdAccept: Number(product.thresholdAccept),
        thresholdMns: Number(product.thresholdMns),
        rowThreshold: product.rowThreshold,
        rotateImageClockwise: product.rotateTestImageClockwise,
      });

      const capturedAt = new Date();
      const expectedText = product.code.trim().toUpperCase();
      const logs = product.roiRegions.map((region, index) => {
        const slotResult = scan.results[index];
        const evaluation = evaluateInspectionSlot({
          rawText: slotResult?.text,
          rows: slotResult?.rows,
          errorMessage: slotResult?.error,
          expectedText,
        });

        return {
          jobId: job.id,
          slotIndex: region.index,
          slotLabel: `slot-${region.index}`,
          expectedText,
          result: evaluation.result,
          text: evaluation.rawText,
          rows: slotResult?.rows ?? [],
          confidence: null,
          imagePath: null,
          errorMessage: evaluation.errorMessage,
          capturedAt,
        };
      });

      await this.prisma.inspectionLog.createMany({
        data: logs,
      });

      return {
        data: await this.buildInspectionState(job.id),
      };
    } catch (error) {
      const capturedAt = new Date();
      await this.prisma.inspectionLog.create({
        data: {
          jobId: job.id,
          result: InspectionResult.UNKNOWN,
          text: null,
          confidence: null,
          imagePath: null,
          errorMessage: this.getErrorMessage(error),
          capturedAt,
        },
      });

      if (!existingRunningJob) {
        await this.prisma.inspectionJob.update({
          where: { id: job.id },
          data: {
            status: InspectionStatus.failed,
            stoppedAt: new Date(),
          },
        });
      }

      throw error;
    }
  }

  async getCurrentInspection() {
    const job = await this.prisma.inspectionJob.findFirst({
      where: { status: InspectionStatus.running },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      return { data: null };
    }

    return { data: await this.buildInspectionState(job.id) };
  }

  async beginInspectionSession(
    dto: StartInspectionDto,
    user: { id: string; username: string; role: string },
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: productInclude,
    });

    if (!product || !product.active) {
      throw new NotFoundException('Active product not found');
    }
    if (!product.modelPath) {
      throw new BadRequestException('Product model path is required');
    }
    if (product.roiRegions.length === 0) {
      throw new BadRequestException('Product ROI regions are required');
    }

    const existingRunningJob = await this.prisma.inspectionJob.findFirst({
      where: { status: InspectionStatus.running },
      orderBy: { createdAt: 'desc' },
    });
    if (
      existingRunningJob &&
      (existingRunningJob.productId !== product.id ||
        existingRunningJob.operatorId !== user.id)
    ) {
      throw new ConflictException('Another inspection job is already running');
    }

    if (existingRunningJob) {
      return { data: await this.buildInspectionState(existingRunningJob.id) };
    }

    const lineResultSettings = await this.ensureLineResultSettings();
    const job = await this.prisma.inspectionJob.create({
      data: {
        productId: product.id,
        operatorId: user.id,
        status: InspectionStatus.running,
        startedAt: new Date(),
        note: dto.operatorNote || null,
        resultSaveFolderPath: lineResultSettings.saveFolderPath ?? null,
        resultSavePolicy: lineResultSettings.savePolicy ?? null,
      },
    });

    return { data: await this.buildInspectionState(job.id) };
  }

  async refreshLatestRunningInspection(signal?: AbortSignal) {
    const job = await this.prisma.inspectionJob.findFirst({
      where: { status: InspectionStatus.running },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new BadRequestException(
        'A running inspection job is required for continuous detection',
      );
    }

    const product = await this.getActiveProductForScan(job.productId);
    signal?.throwIfAborted();
    await this.deviceToolService.ensureCameraReady(
      this.toCameraProfile(product),
      signal,
    );
    const frame = await this.deviceToolService.grabCameraFrame(
      { encodeFormat: '.jpg', jpegQuality: 90 },
      signal,
    );
    signal?.throwIfAborted();

    if (!frame.image_base64) {
      throw new BadRequestException(
        'Continuous detection returned no camera frame',
      );
    }

    const scan = await this.deviceToolService.inspectProductFrame(
      {
        modelPath: product.modelPath!,
        camera: this.toCameraProfile(product),
        roiRegions: product.roiRegions.map((region) => ({
          index: region.index,
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          rotation: Number(region.rotation),
        })),
        thresholdAccept: Number(product.thresholdAccept),
        thresholdMns: Number(product.thresholdMns),
        rowThreshold: product.rowThreshold,
        rotateImageClockwise: product.rotateTestImageClockwise,
      },
      frame.image_base64,
      signal,
    );
    signal?.throwIfAborted();

    const completedAt = new Date();
    const completedDetection: CompletedLineDetection = {
      jobId: job.id,
      productId: product.id,
      imageBase64: frame.image_base64,
      completedAt,
      product,
      scan,
    };
    this.latestCompletedLineDetection = completedDetection;

    return {
      data: await this.buildLiveInspectionState(completedDetection),
    };
  }

  async captureRunningInspectionFromPlc(signal?: AbortSignal) {
    const completedDetection = this.latestCompletedLineDetection;

    if (!completedDetection) {
      throw new BadRequestException(
        'No completed detection is available for PLC capture',
      );
    }

    signal?.throwIfAborted();
    const job = await this.prisma.inspectionJob.findFirst({
      where: { status: InspectionStatus.running },
      orderBy: { createdAt: 'desc' },
    });

    if (!job || job.id !== completedDetection.jobId) {
      throw new BadRequestException(
        'The latest completed detection does not belong to the running job',
      );
    }

    const capturedAt = new Date();
    const imagePath = await this.savePlcCaptureFrame({
      job,
      productCode: completedDetection.product.code,
      imageBase64: completedDetection.imageBase64,
      capturedAt,
    });

    try {
      signal?.throwIfAborted();
      await this.persistPlcCaptureLogs({
        jobId: job.id,
        product: completedDetection.product,
        scan: completedDetection.scan,
        imagePath,
        capturedAt,
      });
    } catch (error) {
      if (signal?.aborted && imagePath) {
        await unlink(imagePath).catch(() => undefined);
      }
      throw error;
    }

    return { data: await this.buildInspectionState(job.id) };
  }

  clearLatestRunningInspection() {
    this.latestCompletedLineDetection = null;
  }

  async verifyRunningInspectionCameraFrame() {
    const job = await this.prisma.inspectionJob.findFirst({
      where: { status: InspectionStatus.running },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) {
      throw new BadRequestException(
        'A running inspection job is required to restore the camera',
      );
    }

    const product = await this.prisma.product.findUnique({
      where: { id: job.productId },
      include: productInclude,
    });

    if (!product || !product.active) {
      throw new NotFoundException('Active product not found');
    }

    await this.deviceToolService.ensureCameraReady(
      this.toCameraProfile(product),
    );
    const frame = await this.deviceToolService.grabCameraFrame({
      encodeFormat: '.jpg',
      jpegQuality: 70,
    });

    if (!frame.image_base64) {
      throw new BadRequestException('Camera connected but returned no frame');
    }

    return { success: true, width: frame.width, height: frame.height };
  }

  async verifyStartupCameraFrame(preferredProductId?: string) {
    const products = await this.prisma.product.findMany({
      where: { active: true },
      include: productInclude,
      orderBy: { updatedAt: 'desc' },
    });
    const latestJob = await this.prisma.inspectionJob.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    const isConnectable = (product: ProductWithProfile) =>
      ['usb', 'rtsp'].includes(
        product.cameraConfig?.sourceType.trim().toLowerCase() ?? '',
      );
    const product =
      products.find(
        (item) => item.id === preferredProductId && isConnectable(item),
      ) ??
      products.find(
        (item) => item.id === latestJob?.productId && isConnectable(item),
      ) ??
      products.find(isConnectable) ??
      null;

    if (!product) {
      throw new BadRequestException(
        'No active camera product profile is available for startup',
      );
    }

    await this.deviceToolService.ensureCameraReady(
      this.toCameraProfile(product),
    );
    const frame = await this.deviceToolService.grabCameraFrame({
      encodeFormat: '.jpg',
      jpegQuality: 70,
    });

    if (!frame.image_base64) {
      throw new BadRequestException(
        'Camera connected during startup but returned no frame',
      );
    }

    return {
      data: {
        productId: product.id,
        productCode: product.code,
        width: frame.width,
        height: frame.height,
      },
    };
  }

  async testImage(dto: TestInspectionImageDto) {
    const product = await this.getActiveProductForScan(dto.productId);
    const testRoiRegions =
      dto.roiRegions && dto.roiRegions.length > 0
        ? dto.roiRegions
        : product.roiRegions;
    const scan = await this.deviceToolService.inspectProductImage({
      modelPath: product.modelPath!,
      crops: dto.crops,
      roiRegions: testRoiRegions.map((region) => ({
        index: region.index,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        rotation: Number(region.rotation),
      })),
      thresholdAccept: Number(product.thresholdAccept),
      thresholdMns: Number(product.thresholdMns),
      rowThreshold: product.rowThreshold,
      rotateImageClockwise: product.rotateTestImageClockwise,
    });
    const expectedText = product.code.trim().toUpperCase();

    return {
      data: {
        productId: product.id,
        productCode: product.code,
        expectedText,
        imageWidth: scan.image_width,
        imageHeight: scan.image_height,
        cycleTimeMs: scan.cycle_time_ms,
        success: scan.success,
        error: scan.error ?? null,
        result: resolveInspectionResults(scan.results, expectedText),
        slots: testRoiRegions.map((region, index) => {
          const slotResult = scan.results[index];
          const evaluation = evaluateInspectionSlot({
            rawText: slotResult?.text,
            rows: slotResult?.rows,
            errorMessage: slotResult?.error,
            expectedText,
          });

          return {
            slotIndex: region.index,
            slotLabel: `slot-${region.index}`,
            expectedText,
            rawText: evaluation.rawText,
            rows: slotResult?.rows ?? [],
            result: evaluation.result,
            errorMessage: evaluation.errorMessage,
            toolDebugImageBase64: slotResult?.debugImageBase64 ?? null,
          };
        }),
      },
    };
  }

  async createTestSessionReport(
    dto: CreateTestSessionReportDto,
    user: { id: string; username: string; role: string },
  ) {
    const product = await this.getActiveProductForScan(dto.productId);

    if (dto.failedImages.length > dto.totalImages) {
      throw new BadRequestException('Failed images cannot exceed total images');
    }

    const totalCount =
      dto.okImages + dto.ngImages + dto.unknownImages + dto.errorImages;

    if (totalCount !== dto.totalImages) {
      throw new BadRequestException('Session totals do not match total images');
    }

    const reportId = randomUUID();
    const createdAt = new Date();
    const normalizedSaveFolderPath = dto.saveFolderPath?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "TestSessionReport" (
          "id",
          "productId",
          "actorId",
          "folderName",
          "totalImages",
          "okImages",
          "ngImages",
          "unknownImages",
          "errorImages",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${reportId},
          ${product.id},
          ${user.id},
          ${dto.folderName || null},
          ${dto.totalImages},
          ${dto.okImages},
          ${dto.ngImages},
          ${dto.unknownImages},
          ${dto.errorImages},
          ${createdAt},
          ${createdAt}
        )
      `;

      for (const image of dto.failedImages) {
        const failedImageId = randomUUID();

        await tx.$executeRaw`
          INSERT INTO "TestSessionFailedImage" (
            "id",
            "reportId",
            "fileName",
            "relativePath",
            "result",
            "cycleTimeMs",
            "errorMessage",
            "originalImageBase64",
            "createdAt"
          )
          VALUES (
            ${failedImageId},
            ${reportId},
            ${image.fileName},
            ${image.relativePath},
            CAST(${image.result} AS "TestSessionImageResult"),
            ${image.cycleTimeMs ?? null},
            ${image.errorMessage ?? null},
            ${image.originalImageBase64},
            ${createdAt}
          )
        `;

        for (const roi of image.roiResults) {
          await tx.$executeRaw`
            INSERT INTO "TestSessionFailedRoiResult" (
              "id",
              "failedImageId",
              "slotIndex",
              "slotLabel",
              "expectedText",
              "rawText",
              "rows",
              "result",
              "errorMessage",
              "toolDebugImageBase64",
              "createdAt"
            )
            VALUES (
              ${randomUUID()},
              ${failedImageId},
              ${roi.slotIndex ?? null},
              ${roi.slotLabel ?? null},
              ${roi.expectedText ?? null},
              ${roi.rawText ?? null},
              CAST(${JSON.stringify(roi.rows ?? [])} AS JSONB),
              CAST(${roi.result} AS "InspectionResult"),
              ${roi.errorMessage ?? null},
              ${roi.toolDebugImageBase64 ?? null},
              ${createdAt}
            )
          `;
        }
      }

      if (normalizedSaveFolderPath) {
        await this.writeTestSessionFiles({
          reportId,
          productCode: product.code,
          actorUsername: user.username,
          folderPath: normalizedSaveFolderPath,
          folderName: dto.folderName ?? null,
          totalImages: dto.totalImages,
          okImages: dto.okImages,
          ngImages: dto.ngImages,
          unknownImages: dto.unknownImages,
          errorImages: dto.errorImages,
          createdAt,
          failedImages: dto.failedImages,
        });
      }
    });

    return {
      data: {
        id: reportId,
        productId: product.id,
        productCode: product.code,
        actorId: user.id,
        saveFolderPath: normalizedSaveFolderPath,
        savedFailedImageCount: dto.failedImages.length,
        folderName: dto.folderName || null,
        totalImages: dto.totalImages,
        okImages: dto.okImages,
        ngImages: dto.ngImages,
        unknownImages: dto.unknownImages,
        errorImages: dto.errorImages,
        failedImages: dto.failedImages,
        createdAt: createdAt.toISOString(),
      },
    };
  }

  async listTestSessionReports(limit = 10, page = 1) {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit) || 10));
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const offset = (safePage - 1) * safeLimit;
    const total = await this.prisma.testSessionReport.count();
    const reports = await this.prisma.$queryRaw<
      Array<{
        id: string;
        productId: string;
        productCode: string;
        actorId: string;
        actorUsername: string;
        folderName: string | null;
        totalImages: number;
        okImages: number;
        ngImages: number;
        unknownImages: number;
        errorImages: number;
        createdAt: Date;
      }>
    >`
      SELECT
        report."id",
        report."productId",
        product."code" AS "productCode",
        report."actorId",
        actor."username" AS "actorUsername",
        report."folderName",
        report."totalImages",
        report."okImages",
        report."ngImages",
        report."unknownImages",
        report."errorImages",
        report."createdAt"
      FROM "TestSessionReport" AS report
      INNER JOIN "Product" AS product ON product."id" = report."productId"
      INNER JOIN "User" AS actor ON actor."id" = report."actorId"
      ORDER BY report."createdAt" DESC
      OFFSET ${offset}
      LIMIT ${safeLimit}
    `;

    if (reports.length === 0) {
      return {
        data: [],
        meta: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        },
      };
    }

    const reportIds = reports.map((report) => report.id);
    const failedImages = await this.prisma.$queryRaw<
      Array<{
        id: string;
        reportId: string;
        fileName: string;
        relativePath: string;
        result: string;
        cycleTimeMs: number | null;
        errorMessage: string | null;
        originalImageBase64: string | null;
        createdAt: Date;
      }>
    >(
      Prisma.sql`
        SELECT
          image."id",
          image."reportId",
          image."fileName",
          image."relativePath",
          image."result"::text AS "result",
          image."cycleTimeMs",
          image."errorMessage",
          image."originalImageBase64",
          image."createdAt"
        FROM "TestSessionFailedImage" AS image
        WHERE image."reportId" IN (${Prisma.join(reportIds)})
        ORDER BY image."createdAt" ASC
      `,
    );

    const failedImageIds = failedImages.map((image) => image.id);
    const roiResults =
      failedImageIds.length > 0
        ? await this.prisma.$queryRaw<
            Array<{
              id: string;
              failedImageId: string;
              slotIndex: number | null;
              slotLabel: string | null;
              expectedText: string | null;
              rawText: string | null;
              rows: Prisma.JsonValue | null;
              result: string;
              errorMessage: string | null;
              createdAt: Date;
            }>
          >(
            Prisma.sql`
              SELECT
                roi."id",
                roi."failedImageId",
                roi."slotIndex",
                roi."slotLabel",
                roi."expectedText",
                roi."rawText",
                roi."rows",
                roi."result"::text AS "result",
                roi."errorMessage",
                roi."createdAt"
              FROM "TestSessionFailedRoiResult" AS roi
              WHERE roi."failedImageId" IN (${Prisma.join(failedImageIds)})
              ORDER BY roi."slotIndex" ASC, roi."createdAt" ASC
            `,
          )
        : [];

    const roiByImageId = new Map<
      string,
      Array<{
        slotIndex: number | null;
        slotLabel: string | null;
        expectedText: string | null;
        rawText: string | null;
        rows: string[];
        result: string;
        errorMessage: string | null;
      }>
    >();

    for (const roi of roiResults) {
      const list = roiByImageId.get(roi.failedImageId) ?? [];
      list.push({
        slotIndex: roi.slotIndex,
        slotLabel: roi.slotLabel,
        expectedText: roi.expectedText,
        rawText: roi.rawText,
        rows: this.normalizeRows(roi.rows),
        result: roi.result,
        errorMessage: roi.errorMessage,
      });
      roiByImageId.set(roi.failedImageId, list);
    }

    const failedImagesByReportId = new Map<
      string,
      Array<{
        id: string;
        fileName: string;
        relativePath: string;
        result: string;
        cycleTimeMs: number | null;
        errorMessage: string | null;
        originalImageBase64: string | null;
        roiResults: Array<{
          slotIndex: number | null;
          slotLabel: string | null;
          expectedText: string | null;
          rawText: string | null;
          rows: string[];
          result: string;
          errorMessage: string | null;
        }>;
      }>
    >();

    for (const image of failedImages) {
      const list = failedImagesByReportId.get(image.reportId) ?? [];
      list.push({
        id: image.id,
        fileName: image.fileName,
        relativePath: image.relativePath,
        result: image.result,
        cycleTimeMs: image.cycleTimeMs,
        errorMessage: image.errorMessage,
        originalImageBase64: image.originalImageBase64,
        roiResults: roiByImageId.get(image.id) ?? [],
      });
      failedImagesByReportId.set(image.reportId, list);
    }

    return {
      data: reports.map((report) => ({
        id: report.id,
        productId: report.productId,
        productCode: report.productCode,
        actorId: report.actorId,
        actorUsername: report.actorUsername,
        folderName: report.folderName,
        totalImages: report.totalImages,
        okImages: report.okImages,
        ngImages: report.ngImages,
        unknownImages: report.unknownImages,
        errorImages: report.errorImages,
        failedImages: failedImagesByReportId.get(report.id) ?? [],
        createdAt: report.createdAt.toISOString(),
      })),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  async getLineResultSettings() {
    const settings = await this.ensureLineResultSettings();

    return { data: this.toLineResultSettings(settings) };
  }

  async updateLineResultSettings(dto: UpdateLineResultSettingsDto) {
    const currentSettings = await this.ensureLineResultSettings();
    const hasSaveFolderPath = Object.prototype.hasOwnProperty.call(
      dto,
      'saveFolderPath',
    );
    const saveFolderPath = hasSaveFolderPath
      ? dto.saveFolderPath?.trim() || null
      : currentSettings.saveFolderPath;
    const savePolicy = dto.savePolicy ?? currentSettings.savePolicy;

    if (savePolicy !== LineResultSavePolicy.none && !saveFolderPath) {
      throw new BadRequestException(
        'Line result save folder is required unless saving is disabled',
      );
    }

    const settings = await this.prisma.lineResultSettings.update({
      where: { id: LINE_RESULT_SETTINGS_ID },
      data: {
        saveFolderPath,
        savePolicy,
        saveBySession: dto.saveBySession ?? currentSettings.saveBySession,
        newSessionOnLineStop:
          dto.newSessionOnLineStop ?? currentSettings.newSessionOnLineStop,
        newSessionOnProductChange:
          dto.newSessionOnProductChange ??
          currentSettings.newSessionOnProductChange,
      },
    });

    return { data: this.toLineResultSettings(settings) };
  }

  async stopInspection(
    jobId: string,
    endReason: LineSessionEndReason = LineSessionEndReason.line_stop,
  ) {
    const job = await this.prisma.inspectionJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });

    if (!job) {
      throw new NotFoundException('Inspection job not found');
    }

    const nextStatus =
      job.status === InspectionStatus.failed
        ? InspectionStatus.failed
        : InspectionStatus.completed;

    await this.prisma.inspectionJob.update({
      where: { id: jobId },
      data: {
        status: nextStatus,
        stoppedAt: new Date(),
        endReason,
      },
    });

    await this.writeLineResultSession(jobId);

    return { data: await this.buildInspectionState(jobId) };
  }

  async stopCurrentInspection(endReason: LineSessionEndReason) {
    const job = await this.prisma.inspectionJob.findFirst({
      where: { status: InspectionStatus.running },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!job) return { data: null };
    return this.stopInspection(job.id, endReason);
  }

  private async persistPlcCaptureLogs({
    capturedAt,
    imagePath,
    jobId,
    product,
    scan,
  }: {
    capturedAt: Date;
    imagePath: string | null;
    jobId: string;
    product: ProductWithProfile;
    scan: Awaited<ReturnType<DeviceToolService['inspectProductFrame']>>;
  }) {
    const expectedText = product.code.trim().toUpperCase();
    const plcCaptureId = randomUUID();
    const logs = product.roiRegions.map((region, index) => {
      const slotResult = scan.results[index];
      const evaluation = evaluateInspectionSlot({
        rawText: slotResult?.text,
        rows: slotResult?.rows,
        errorMessage: slotResult?.error,
        expectedText,
      });

      return {
        jobId,
        plcCaptureId,
        slotIndex: region.index,
        slotLabel: `slot-${region.index}`,
        expectedText,
        result: evaluation.result,
        text: evaluation.rawText,
        rows: slotResult?.rows ?? [],
        confidence: null,
        imagePath,
        errorMessage: evaluation.errorMessage,
        capturedAt,
      };
    });

    await this.prisma.inspectionLog.createMany({ data: logs });
  }

  private async savePlcCaptureFrame({
    capturedAt,
    imageBase64,
    job,
    productCode,
  }: {
    capturedAt: Date;
    imageBase64: string;
    job: {
      id: string;
      createdAt: Date;
      startedAt: Date | null;
      resultSaveFolderPath: string | null;
      resultSavePolicy: LineResultSavePolicy | null;
      resultSessionFolderName: string | null;
    };
    productCode: string;
  }) {
    const settings = await this.ensureLineResultSettings();
    const savePolicy = job.resultSavePolicy ?? settings.savePolicy;
    if (savePolicy === LineResultSavePolicy.none) return null;
    const saveFolderPath =
      job.resultSaveFolderPath ?? settings.saveFolderPath ?? null;

    if (!saveFolderPath) return null;

    const sessionFolderName =
      job.resultSessionFolderName ??
      this.buildSessionFolderName(
        productCode,
        job.startedAt ?? job.createdAt,
        job.id,
      );
    const sessionRoot = this.resolveInsideDirectory(
      saveFolderPath,
      sessionFolderName,
    );
    const timestamp = capturedAt
      .toISOString()
      .replaceAll(':', '-')
      .replace('T', '_')
      .replace('Z', '');
    const relativeImagePath = join(
      'captures',
      `${timestamp}-${randomUUID().slice(0, 8)}.jpg`,
    );
    const absoluteImagePath = this.resolveInsideDirectory(
      sessionRoot,
      relativeImagePath,
    );

    try {
      await mkdir(dirname(absoluteImagePath), { recursive: true });
      await writeFile(
        absoluteImagePath,
        Buffer.from(imageBase64.replace(/^data:[^;]+;base64,/i, ''), 'base64'),
      );
      await this.prisma.inspectionJob.update({
        where: { id: job.id },
        data: {
          resultSessionFolderName: sessionFolderName,
          resultSaveError: null,
        },
      });
      return absoluteImagePath;
    } catch (error) {
      const message = this.getErrorMessage(error);
      await this.prisma.inspectionJob.update({
        where: { id: job.id },
        data: { resultSaveError: message },
      });
      return null;
    }
  }

  private async ensureLineResultSettings() {
    return this.prisma.lineResultSettings.upsert({
      where: { id: LINE_RESULT_SETTINGS_ID },
      create: {
        id: LINE_RESULT_SETTINGS_ID,
        savePolicy: LineResultSavePolicy.all,
        saveBySession: true,
        newSessionOnLineStop: true,
        newSessionOnProductChange: true,
      },
      update: {},
    });
  }

  private toLineResultSettings(settings: {
    id: string;
    saveFolderPath: string | null;
    savePolicy: LineResultSavePolicy;
    saveBySession: boolean;
    newSessionOnLineStop: boolean;
    newSessionOnProductChange: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: settings.id,
      saveFolderPath: settings.saveFolderPath,
      savePolicy: settings.savePolicy,
      saveBySession: settings.saveBySession,
      newSessionOnLineStop: settings.newSessionOnLineStop,
      newSessionOnProductChange: settings.newSessionOnProductChange,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  private async writeLineResultSession(jobId: string) {
    const job = await this.prisma.inspectionJob.findUnique({
      where: { id: jobId },
      include: {
        logs: {
          orderBy: [{ capturedAt: 'asc' }, { slotIndex: 'asc' }],
        },
        operator: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });

    if (!job || job.resultSavedAt) {
      return;
    }

    const settings = await this.ensureLineResultSettings();
    const savePolicy = job.resultSavePolicy ?? settings.savePolicy;
    const saveFolderPath =
      job.resultSaveFolderPath ?? settings.saveFolderPath ?? null;

    if (savePolicy === LineResultSavePolicy.none) {
      await this.prisma.inspectionJob.update({
        where: { id: jobId },
        data: { resultSaveError: null },
      });
      return;
    }

    if (!saveFolderPath) {
      const message = 'Line result save folder is not configured';
      await this.prisma.inspectionJob.update({
        where: { id: jobId },
        data: { resultSaveError: message },
      });
      return;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: job.productId },
      select: {
        id: true,
        code: true,
        name: true,
        batchSize: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found for inspection job');
    }

    const createdAt = job.startedAt ?? job.createdAt;
    const stoppedAt = job.stoppedAt ?? new Date();
    const sessionFolderName =
      job.resultSessionFolderName ??
      this.buildSessionFolderName(product.code, createdAt, job.id);
    const sessionRoot = this.resolveInsideDirectory(
      saveFolderPath,
      sessionFolderName,
    );
    const resultGroups = this.buildLineResultGroups(job.logs);
    const savedResults = resultGroups.filter((group) =>
      this.shouldSaveLineResultGroup(savePolicy, group.result),
    );

    try {
      await mkdir(sessionRoot, { recursive: true });
      await writeFile(
        this.resolveInsideDirectory(sessionRoot, 'session-report.json'),
        JSON.stringify(
          {
            jobId: job.id,
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            operatorId: job.operatorId,
            operatorUsername: job.operator.username,
            operatorFullName: job.operator.fullName,
            savePolicy,
            saveBySession: settings.saveBySession,
            endReason: job.endReason ?? null,
            startedAt: createdAt.toISOString(),
            stoppedAt: stoppedAt.toISOString(),
            savedAt: new Date().toISOString(),
            totals: this.buildLineResultTotals(resultGroups),
            savedResultCount: savedResults.length,
            results: savedResults,
          },
          null,
          2,
        ),
        'utf8',
      );

      await this.prisma.inspectionJob.update({
        where: { id: jobId },
        data: {
          resultSessionFolderName: sessionFolderName,
          resultSavedAt: new Date(),
          resultSaveError: null,
        },
      });
    } catch (error) {
      const message = this.getErrorMessage(error);
      await this.prisma.inspectionJob.update({
        where: { id: jobId },
        data: { resultSaveError: message },
      });
    }
  }

  private buildLineResultGroups(
    logs: Array<{
      id: string;
      slotIndex: number | null;
      slotLabel: string | null;
      expectedText: string | null;
      result: InspectionResult;
      text: string | null;
      rows: Prisma.JsonValue | null;
      imagePath: string | null;
      errorMessage: string | null;
      capturedAt: Date;
    }>,
  ) {
    const groups = new Map<string, typeof logs>();

    for (const log of logs) {
      const capturedAt = log.capturedAt.toISOString();
      const group = groups.get(capturedAt) ?? [];
      group.push(log);
      groups.set(capturedAt, group);
    }

    return Array.from(groups.entries()).map(([capturedAt, group], index) => ({
      sequence: index + 1,
      capturedAt,
      result: this.resolveLatestResult(group),
      text: group
        .map((log) => log.text)
        .filter(Boolean)
        .join(' | '),
      imagePath: group.find((log) => Boolean(log.imagePath))?.imagePath ?? null,
      slots: group.map((log) => ({
        slotIndex: log.slotIndex,
        slotLabel: log.slotLabel,
        expectedText: log.expectedText,
        rawText: log.text,
        rows: this.normalizeRows(log.rows),
        imagePath: log.imagePath,
        result: log.result,
        errorMessage: log.errorMessage,
      })),
    }));
  }

  private buildLineResultTotals(groups: Array<{ result: InspectionResult }>) {
    return {
      total: groups.length,
      ok: groups.filter((group) => group.result === InspectionResult.OK).length,
      ng: groups.filter((group) => group.result === InspectionResult.NG).length,
      unknown: groups.filter(
        (group) => group.result === InspectionResult.UNKNOWN,
      ).length,
    };
  }

  private shouldSaveLineResultGroup(
    savePolicy: LineResultSavePolicy,
    result: InspectionResult,
  ) {
    switch (savePolicy) {
      case LineResultSavePolicy.all:
        return result === InspectionResult.OK || result === InspectionResult.NG;
      case LineResultSavePolicy.ok:
        return result === InspectionResult.OK;
      case LineResultSavePolicy.ng:
        return result === InspectionResult.NG;
      case LineResultSavePolicy.none:
      default:
        return false;
    }
  }

  private async getActiveProductForScan(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });

    if (!product || !product.active) {
      throw new NotFoundException('Active product not found');
    }

    if (!product.modelPath) {
      throw new BadRequestException('Product model path is required');
    }

    if (product.roiRegions.length === 0) {
      throw new BadRequestException('Product ROI regions are required');
    }

    return product;
  }

  private async writeTestSessionFiles({
    actorUsername,
    createdAt,
    errorImages,
    failedImages,
    folderName,
    folderPath,
    ngImages,
    okImages,
    productCode,
    reportId,
    totalImages,
    unknownImages,
  }: {
    actorUsername: string;
    createdAt: Date;
    errorImages: number;
    failedImages: CreateTestSessionReportDto['failedImages'];
    folderName: string | null;
    folderPath: string;
    ngImages: number;
    okImages: number;
    productCode: string;
    reportId: string;
    totalImages: number;
    unknownImages: number;
  }) {
    const sessionRoot = resolve(
      folderPath,
      this.buildSessionFolderName(productCode, createdAt, reportId),
    );
    await mkdir(sessionRoot, { recursive: true });

    const savedImages = await Promise.all(
      failedImages.map(async (image) => {
        let savedPath: string | null = null;

        if (this.hasValidBase64Image(image.originalImageBase64)) {
          const relativeOutputPath = this.buildFailedImageRelativePath(
            image.relativePath,
            image.fileName,
            image.originalImageBase64,
          );
          const nextSavedPath = join('failed-images', relativeOutputPath);
          const absoluteOutputPath = this.resolveInsideDirectory(
            sessionRoot,
            nextSavedPath,
          );

          await mkdir(dirname(absoluteOutputPath), { recursive: true });
          await writeFile(
            absoluteOutputPath,
            this.decodeBase64Image(image.originalImageBase64),
          );
          savedPath = this.toPortablePath(nextSavedPath);
        }

        return {
          fileName: image.fileName,
          relativePath: image.relativePath,
          savedPath,
          result: image.result,
          cycleTimeMs: image.cycleTimeMs ?? null,
          errorMessage: image.errorMessage ?? null,
          roiResults: image.roiResults,
        };
      }),
    );

    await writeFile(
      this.resolveInsideDirectory(sessionRoot, 'session-report.json'),
      JSON.stringify(
        {
          reportId,
          productCode,
          actorUsername,
          folderName,
          totalImages,
          okImages,
          ngImages,
          unknownImages,
          errorImages,
          savedAt: createdAt.toISOString(),
          savedImages,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  private buildSessionFolderName(
    productCode: string,
    createdAt: Date,
    reportId: string,
  ) {
    const timestamp = [
      createdAt.getFullYear(),
      String(createdAt.getMonth() + 1).padStart(2, '0'),
      String(createdAt.getDate()).padStart(2, '0'),
      '-',
      String(createdAt.getHours()).padStart(2, '0'),
      String(createdAt.getMinutes()).padStart(2, '0'),
      String(createdAt.getSeconds()).padStart(2, '0'),
    ].join('');

    return `${this.sanitizePathSegment(productCode)}-${timestamp}-${reportId.slice(0, 8)}`;
  }

  private buildFailedImageRelativePath(
    relativePath: string,
    fileName: string,
    imageBase64: string,
  ) {
    const fallbackName = this.ensureFileExtension(
      this.sanitizePathSegment(basename(fileName) || 'failed-image'),
      imageBase64,
    );
    const rawSegments = relativePath
      .split(/[\\/]+/)
      .map((segment) => this.sanitizePathSegment(segment))
      .filter(Boolean)
      .filter((segment) => segment !== '.' && segment !== '..');

    if (rawSegments.length === 0) {
      return fallbackName;
    }

    rawSegments[rawSegments.length - 1] = this.ensureFileExtension(
      rawSegments[rawSegments.length - 1] || fallbackName,
      imageBase64,
    );

    return join(...rawSegments);
  }

  private ensureFileExtension(fileName: string, imageBase64: string) {
    if (extname(fileName)) {
      return fileName;
    }

    const mimeMatch = /^data:([^;]+);base64,/.exec(imageBase64);
    const extension = mimeMatch?.[1]
      ? this.extensionFromMimeType(mimeMatch[1])
      : 'jpg';

    return `${fileName}.${extension}`;
  }

  private extensionFromMimeType(mimeType: string) {
    switch (mimeType.toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/bmp':
        return 'bmp';
      case 'image/gif':
        return 'gif';
      case 'image/tiff':
      case 'image/tif':
        return 'tif';
      case 'image/webp':
        return 'webp';
      case 'image/jpeg':
      case 'image/jpg':
      default:
        return 'jpg';
    }
  }

  private decodeBase64Image(imageBase64: string) {
    const match = /^data:[^;]+;base64,(.+)$/i.exec(imageBase64);

    if (!match?.[1]) {
      throw new BadRequestException('Invalid image payload in test session');
    }

    return Buffer.from(match[1], 'base64');
  }

  private hasValidBase64Image(imageBase64: string) {
    return /^data:[^;]+;base64,(.+)$/i.test(imageBase64);
  }

  private resolveInsideDirectory(rootPath: string, relativePath: string) {
    const rootAbsolutePath = resolve(rootPath);
    const targetAbsolutePath = resolve(rootPath, relativePath);
    const normalizedRoot = `${rootAbsolutePath.toLowerCase()}\\`;
    const normalizedTarget = targetAbsolutePath.toLowerCase();

    if (
      normalizedTarget !== rootAbsolutePath.toLowerCase() &&
      !normalizedTarget.startsWith(normalizedRoot)
    ) {
      throw new BadRequestException('Invalid output path for test session');
    }

    return targetAbsolutePath;
  }

  private sanitizePathSegment(value: string) {
    const sanitized = Array.from(value)
      .map((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        const isControlCharacter = codePoint < 32;

        if (isControlCharacter || /[<>:"/\\|?*]/.test(character)) {
          return '_';
        }

        return character;
      })
      .join('')
      .trim();
    return sanitized.length > 0 ? sanitized : 'item';
  }

  private toPortablePath(value: string) {
    return value.replaceAll('\\', '/');
  }

  private async buildLiveInspectionState(detection: CompletedLineDetection) {
    const persistedState = await this.buildInspectionState(detection.jobId);
    const expectedText = detection.product.code.trim().toUpperCase();
    const slots = detection.product.roiRegions.map((region, index) => {
      const slotResult = detection.scan.results[index];
      const evaluation = evaluateInspectionSlot({
        rawText: slotResult?.text,
        rows: slotResult?.rows,
        errorMessage: slotResult?.error,
        expectedText,
      });

      return {
        slotIndex: region.index,
        slotLabel: `slot-${region.index}`,
        expectedText,
        rawText: evaluation.rawText,
        rows: slotResult?.rows ?? [],
        imagePath: null,
        result: evaluation.result,
        errorMessage: evaluation.errorMessage,
      };
    });
    const knownSlots = slots.filter((slot) =>
      this.isKnownInspectionResult(slot.result),
    );
    const result = resolveInspectionAggregateResult(
      slots.map((slot) => slot.result),
    );

    return {
      ...persistedState,
      quantity: knownSlots.length,
      latestScanAt: detection.completedAt.toISOString(),
      lastResult: {
        result,
        text:
          slots
            .map((slot) => slot.rawText)
            .filter(Boolean)
            .join(' | ') || null,
        confidence: null,
        imagePath: null,
        capturedAt: detection.completedAt.toISOString(),
      },
      slots,
    };
  }

  private async buildInspectionState(jobId: string) {
    const job = await this.prisma.inspectionJob.findUnique({
      where: { id: jobId },
      include: {
        logs: {
          orderBy: [{ capturedAt: 'desc' }, { slotIndex: 'asc' }],
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Inspection job not found');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: job.productId },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Product not found for inspection job');
    }

    return this.toInspectionState(job, product);
  }

  private toInspectionState(
    job: InspectionJobWithLogs,
    product: ProductWithProfile,
  ) {
    const logs = [...job.logs].sort((left, right) => {
      const timeDiff = left.capturedAt.getTime() - right.capturedAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }

      return (left.slotIndex ?? 0) - (right.slotIndex ?? 0);
    });

    const totalRecognized = logs.filter((log) =>
      this.isKnownInspectionResult(log.result),
    ).length;
    const okCount = logs.filter(
      (log) => log.result === InspectionResult.OK,
    ).length;
    const ngCount = logs.filter(
      (log) => log.result === InspectionResult.NG,
    ).length;
    const safeBatchSize = Math.max(1, product.batchSize);
    const batchCount = Math.floor(totalRecognized / safeBatchSize);
    const currentBatchCount = totalRecognized % safeBatchSize;
    const latestCapturedAt =
      logs.length > 0 ? logs[logs.length - 1].capturedAt : null;
    const latestLogs = latestCapturedAt
      ? logs.filter(
          (log) => log.capturedAt.getTime() === latestCapturedAt.getTime(),
        )
      : [];
    const latestQuantity = latestLogs.filter((log) =>
      this.isKnownInspectionResult(log.result),
    ).length;
    const latestResult = this.resolveLatestResult(latestLogs);

    return {
      jobId: job.id,
      status: job.status,
      productId: product.id,
      productCode: product.code,
      operatorId: job.operatorId,
      startedAt: job.startedAt?.toISOString() ?? null,
      stoppedAt: job.stoppedAt?.toISOString() ?? null,
      endReason: job.endReason ?? null,
      resultSavePolicy: job.resultSavePolicy ?? null,
      resultSaveFolderPath: job.resultSaveFolderPath ?? null,
      resultSessionFolderName: job.resultSessionFolderName ?? null,
      resultSavedAt: job.resultSavedAt?.toISOString() ?? null,
      resultSaveError: job.resultSaveError ?? null,
      batchSize: product.batchSize,
      quantity: latestQuantity,
      count: currentBatchCount,
      batch: batchCount,
      okCount,
      ngCount,
      latestScanAt: latestCapturedAt?.toISOString() ?? null,
      lastResult: latestCapturedAt
        ? {
            result: latestResult,
            text: latestLogs
              .map((log) => log.text)
              .filter(Boolean)
              .join(' | '),
            confidence: null,
            imagePath:
              latestLogs.find((log) => Boolean(log.imagePath))?.imagePath ??
              null,
            capturedAt: latestCapturedAt.toISOString(),
          }
        : null,
      slots: latestLogs.map((log) => ({
        slotIndex: log.slotIndex,
        slotLabel: log.slotLabel,
        expectedText: log.expectedText,
        rawText: log.text,
        rows: this.normalizeRows(log.rows),
        imagePath: log.imagePath,
        result: log.result,
        errorMessage: log.errorMessage,
      })),
    };
  }

  private normalizeRows(rows: Prisma.JsonValue | string[] | null | undefined) {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.map((row) => {
      if (
        typeof row === 'string' ||
        typeof row === 'number' ||
        typeof row === 'boolean'
      ) {
        return String(row);
      }

      return JSON.stringify(row);
    });
  }

  private resolveLatestResult(latestLogs: Array<{ result: InspectionResult }>) {
    if (latestLogs.length === 0) {
      return InspectionResult.UNKNOWN;
    }

    return resolveInspectionAggregateResult(
      latestLogs.map((log) => log.result),
    );
  }

  private isKnownInspectionResult(result: InspectionResult) {
    return result === InspectionResult.OK || result === InspectionResult.NG;
  }

  private toCameraProfile(product: ProductWithProfile): CameraProfileDto {
    if (product.cameraConfig) {
      return {
        cameraIdentityId: product.cameraConfig.cameraIdentityId ?? undefined,
        sourceType: product.cameraConfig.sourceType,
        deviceName: product.cameraConfig.deviceName ?? undefined,
        rtspUrl: product.cameraConfig.rtspUrl ?? undefined,
        exposure: product.cameraConfig.exposure,
        imageWidth: product.cameraConfig.imageWidth,
        imageHeight: product.cameraConfig.imageHeight,
        offsetX: product.cameraConfig.offsetX,
        offsetY: product.cameraConfig.offsetY,
        zoomFactor: Number(product.cameraConfig.zoomFactor),
        previewPanX: Number(product.cameraConfig.previewPanX),
        previewPanY: Number(product.cameraConfig.previewPanY),
        previewRotation: Number(product.cameraConfig.previewRotation),
      };
    }

    return {
      sourceType: 'usb',
      deviceName: 'Camera 1',
      rtspUrl: undefined,
      exposure: 3500,
      imageWidth: 1500,
      imageHeight: 500,
      offsetX: 0,
      offsetY: 0,
      zoomFactor: 0.4,
      previewPanX: 0,
      previewPanY: 0,
      previewRotation: 0,
    };
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown inspection error';
  }
}
