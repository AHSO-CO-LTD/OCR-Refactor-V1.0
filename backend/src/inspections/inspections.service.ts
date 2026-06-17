import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InspectionResult, InspectionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { CameraProfileDto } from '../products/dto/product-profile.dto';
import { StartInspectionDto } from './dto/start-inspection.dto';

const productInclude = {
  cameraConfig: true,
  roiRegions: { orderBy: { index: 'asc' as const } },
};

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

@Injectable()
export class InspectionsService {
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

    const job =
      existingRunningJob ??
      (await this.prisma.inspectionJob.create({
        data: {
          productId: product.id,
          operatorId: user.id,
          status: InspectionStatus.running,
          startedAt: new Date(),
          note: dto.operatorNote || null,
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
      });

      const capturedAt = new Date();
      const expectedText = product.code.trim().toUpperCase();
      const logs = product.roiRegions.map((region, index) => {
        const slotResult = scan.results[index];
        const rawText = slotResult?.text?.trim() ?? '';
        const slotError = slotResult?.error ?? null;
        const matched = rawText
          ? this.matchesExpected(rawText, expectedText)
          : false;

        let result: InspectionResult = InspectionResult.UNKNOWN;
        if (matched) {
          result = InspectionResult.OK;
        } else if (rawText || slotError) {
          result = InspectionResult.NG;
        }

        return {
          jobId: job.id,
          slotIndex: region.index,
          slotLabel: `slot-${region.index}`,
          expectedText,
          result,
          text: rawText || null,
          confidence: null,
          imagePath: null,
          errorMessage: slotError,
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

  async stopInspection(jobId: string) {
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
      },
    });

    return { data: await this.buildInspectionState(jobId) };
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

    const totalRecognized = logs.filter((log) => !!log.text?.trim()).length;
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
    const latestQuantity = latestLogs.filter(
      (log) => !!log.text?.trim(),
    ).length;
    const latestOkCount = latestLogs.filter(
      (log) => log.result === InspectionResult.OK,
    ).length;
    const latestNgCount = latestLogs.filter(
      (log) => log.result === InspectionResult.NG,
    ).length;
    const latestResult = this.resolveLatestResult(
      latestLogs,
      product.roiRegions.length,
      latestQuantity,
      latestOkCount,
      latestNgCount,
    );

    return {
      jobId: job.id,
      status: job.status,
      productId: product.id,
      productCode: product.code,
      operatorId: job.operatorId,
      startedAt: job.startedAt?.toISOString() ?? null,
      stoppedAt: job.stoppedAt?.toISOString() ?? null,
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
            capturedAt: latestCapturedAt.toISOString(),
          }
        : null,
      slots: latestLogs.map((log) => ({
        slotIndex: log.slotIndex,
        slotLabel: log.slotLabel,
        expectedText: log.expectedText,
        rawText: log.text,
        result: log.result,
        errorMessage: log.errorMessage,
      })),
    };
  }

  private resolveLatestResult(
    latestLogs: InspectionJobWithLogs['logs'],
    expectedRoiCount: number,
    latestQuantity: number,
    latestOkCount: number,
    latestNgCount: number,
  ) {
    if (latestLogs.length === 0) {
      return InspectionResult.UNKNOWN;
    }

    if (
      latestOkCount === expectedRoiCount &&
      latestQuantity === expectedRoiCount
    ) {
      return InspectionResult.OK;
    }

    if (latestNgCount > 0 || latestQuantity < expectedRoiCount) {
      return InspectionResult.NG;
    }

    return InspectionResult.UNKNOWN;
  }

  private toCameraProfile(product: ProductWithProfile): CameraProfileDto {
    if (product.cameraConfig) {
      return {
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
      imageWidth: 2500,
      imageHeight: 1000,
      offsetX: 300,
      offsetY: 1400,
      zoomFactor: 0.4,
      previewPanX: 0,
      previewPanY: 0,
      previewRotation: 0,
    };
  }

  private matchesExpected(rawText: string, expectedText: string) {
    const text = rawText.trim().toUpperCase();
    const acceptedTexts = this.buildAcceptedTexts(expectedText);

    return acceptedTexts.some((candidate) => {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(^|[-_])${escaped}($|[-_])`);
      return pattern.test(text);
    });
  }

  private buildAcceptedTexts(expectedText: string) {
    const normalized = expectedText.trim().toUpperCase();
    const values = new Set<string>([
      normalized,
      normalized.split('').reverse().join(''),
    ]);

    if (normalized.includes('-')) {
      const parts = normalized.split('-');
      if (parts.length === 2) {
        const [left, right] = parts;
        const reversedLeft = left.split('').reverse().join('');
        const reversedRight = right.split('').reverse().join('');

        values.add(`${reversedRight}-${reversedLeft}`);
        values.add(
          `${reversedRight}${reversedLeft[0]}-${reversedLeft.slice(1)}`,
        );
        values.add(
          `${reversedRight.slice(0, -1)}-${reversedRight.slice(-1)}${reversedLeft}`,
        );
      }
    }

    return [...values];
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown inspection error';
  }
}
