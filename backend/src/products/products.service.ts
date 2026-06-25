import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ApplyProductProfileDto } from './dto/apply-product-profile.dto';
import { BulkUpdateProductOcrTestSettingsDto } from './dto/bulk-update-product-ocr-test-settings.dto';
import {
  CameraProfileDto,
  CreateProductProfileDto,
  RoiRegionDto,
} from './dto/product-profile.dto';
import { UpdateProductBatchSizeDto } from './dto/update-product-batch-size.dto';
import { UpdateProductProfileDto } from './dto/update-product-profile.dto';

const defaultCamera: CameraProfileDto = {
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

const productInclude = {
  cameraConfig: true,
  roiRegions: { orderBy: { index: 'asc' as const } },
};

type ProductWithProfile = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts() {
    const products = await this.prisma.product.findMany({
      include: productInclude,
      orderBy: { code: 'asc' },
    });

    return { data: products.map((product) => this.toProductProfile(product)) };
  }

  async createProduct(dto: CreateProductProfileDto) {
    await this.ensureUniqueProduct(dto.code, dto.name);
    this.ensureValidRoiRegions(dto.roiRegions);

    const product = await this.prisma.product.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        defaultNumber: dto.defaultNumber,
        batchSize: dto.batchSize,
        exposure: dto.exposure,
        thresholdAccept: dto.thresholdAccept,
        thresholdMns: dto.thresholdMns,
        modelPath: dto.modelPath || null,
        rotateTestImageClockwise: dto.rotateTestImageClockwise ?? false,
        active: dto.active,
        cameraConfig: { create: this.toCameraData(dto.camera) },
        roiRegions: {
          createMany: {
            data: dto.roiRegions.map((region) => this.toRoiData(region)),
          },
        },
      },
      include: productInclude,
    });

    return { data: this.toProductProfile(product) };
  }

  async updateProduct(id: string, dto: UpdateProductProfileDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    await this.ensureUniqueProduct(dto.code, dto.name, id);

    if (dto.roiRegions) {
      this.ensureValidRoiRegions(dto.roiRegions);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          code: dto.code?.trim(),
          name: dto.name?.trim(),
          defaultNumber: dto.defaultNumber,
          batchSize: dto.batchSize,
          exposure: dto.exposure,
          thresholdAccept: dto.thresholdAccept,
          thresholdMns: dto.thresholdMns,
          modelPath:
            dto.modelPath === undefined ? undefined : dto.modelPath || null,
          rotateTestImageClockwise: dto.rotateTestImageClockwise,
          active: dto.active,
        },
      });

      if (dto.camera) {
        await tx.cameraConfig.upsert({
          where: { productId: id },
          update: this.toCameraData(dto.camera),
          create: { productId: id, ...this.toCameraData(dto.camera) },
        });
      }

      if (dto.roiRegions) {
        await tx.roiRegion.deleteMany({ where: { productId: id } });
        await tx.roiRegion.createMany({
          data: dto.roiRegions.map((region) => ({
            productId: id,
            ...this.toRoiData(region),
          })),
        });
      }
    });

    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: productInclude,
    });

    return { data: this.toProductProfile(product) };
  }

  async deleteProduct(id: string) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.delete({ where: { id } });
    return { data: { success: true } };
  }

  async updateProductBatchSize(id: string, dto: UpdateProductBatchSizeDto) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { batchSize: dto.batchSize },
      include: productInclude,
    });

    return { data: this.toProductProfile(product) };
  }

  async updateProductOcrTestSettings(
    id: string,
    rotateTestImageClockwise: boolean,
  ) {
    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingProduct) {
      throw new NotFoundException('Product not found');
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { rotateTestImageClockwise },
      include: productInclude,
    });

    return { data: this.toProductProfile(product) };
  }

  async bulkUpdateProductOcrTestSettings(
    dto: BulkUpdateProductOcrTestSettingsDto,
  ) {
    if (!dto.applyToAll && (!dto.productIds || dto.productIds.length === 0)) {
      throw new BadRequestException('Target products are required');
    }

    const productIds = dto.applyToAll
      ? undefined
      : Array.from(new Set(dto.productIds));
    const where = productIds ? { id: { in: productIds } } : undefined;
    const targetCount = await this.prisma.product.count({ where });

    if (targetCount === 0) {
      throw new BadRequestException('No target products found');
    }

    const result = await this.prisma.product.updateMany({
      where,
      data: { rotateTestImageClockwise: dto.rotateTestImageClockwise },
    });

    return { data: { updatedCount: result.count } };
  }

  async applyProductProfile(dto: ApplyProductProfileDto) {
    const sourceProduct = await this.prisma.product.findUnique({
      where: { id: dto.sourceProductId },
      include: productInclude,
    });

    if (!sourceProduct) {
      throw new NotFoundException('Source product not found');
    }

    const targetWhere = dto.applyToAll
      ? { id: { not: dto.sourceProductId } }
      : { id: { in: dto.targetProductIds ?? [] } };

    if (
      !dto.applyToAll &&
      (!dto.targetProductIds || dto.targetProductIds.length === 0)
    ) {
      throw new BadRequestException('Target products are required');
    }

    const targetProducts = await this.prisma.product.findMany({
      where: targetWhere,
      select: { id: true },
    });

    if (targetProducts.length === 0) {
      throw new BadRequestException('No target products found');
    }

    const cameraData = this.toCameraData(
      this.toCameraProfile(sourceProduct.cameraConfig),
    );
    const roiData = this.toRoiProfiles(sourceProduct.roiRegions).map((region) =>
      this.toRoiData(region),
    );

    await this.prisma.$transaction(async (tx) => {
      for (const target of targetProducts) {
        await tx.cameraConfig.upsert({
          where: { productId: target.id },
          update: cameraData,
          create: { productId: target.id, ...cameraData },
        });

        await tx.roiRegion.deleteMany({ where: { productId: target.id } });
        await tx.roiRegion.createMany({
          data: roiData.map((region) => ({
            productId: target.id,
            ...region,
          })),
        });
      }
    });

    return { data: { updatedCount: targetProducts.length } };
  }

  private async ensureUniqueProduct(
    code?: string,
    name?: string,
    currentProductId?: string,
  ) {
    const conditions: Prisma.ProductWhereInput[] = [];

    if (code) {
      conditions.push({ code: code.trim() });
    }

    if (name) {
      conditions.push({ name: name.trim() });
    }

    if (conditions.length === 0) {
      return;
    }

    const product = await this.prisma.product.findFirst({
      where: {
        OR: conditions,
        id: currentProductId ? { not: currentProductId } : undefined,
      },
      select: { id: true },
    });

    if (product) {
      throw new ConflictException('Product code or name already exists');
    }
  }

  private ensureValidRoiRegions(regions: RoiRegionDto[]) {
    if (regions.length > 5) {
      throw new BadRequestException('At most five ROI regions are allowed');
    }

    const indexes = new Set<number>();

    for (const region of regions) {
      if (indexes.has(region.index)) {
        throw new BadRequestException('ROI indexes must be unique');
      }

      indexes.add(region.index);
    }

    for (let index = 0; index < regions.length; index += 1) {
      for (
        let nextIndex = index + 1;
        nextIndex < regions.length;
        nextIndex += 1
      ) {
        if (this.roiRegionsOverlap(regions[index], regions[nextIndex])) {
          throw new BadRequestException('ROI regions must not overlap');
        }
      }
    }
  }

  private toCameraData(camera: CameraProfileDto) {
    return {
      sourceType: camera.sourceType,
      deviceName: camera.deviceName || null,
      rtspUrl: camera.rtspUrl || null,
      exposure: camera.exposure,
      imageWidth: camera.imageWidth,
      imageHeight: camera.imageHeight,
      offsetX: camera.offsetX,
      offsetY: camera.offsetY,
      zoomFactor: camera.zoomFactor,
      previewPanX: camera.previewPanX,
      previewPanY: camera.previewPanY,
      previewRotation: camera.previewRotation,
    };
  }

  private toRoiData(region: RoiRegionDto) {
    return {
      index: region.index,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      rotation: region.rotation,
    };
  }

  private toCameraProfile(
    camera: ProductWithProfile['cameraConfig'],
  ): CameraProfileDto {
    if (!camera) {
      return defaultCamera;
    }

    return {
      sourceType: camera.sourceType,
      deviceName: camera.deviceName ?? undefined,
      rtspUrl: camera.rtspUrl ?? undefined,
      exposure: camera.exposure,
      imageWidth: camera.imageWidth,
      imageHeight: camera.imageHeight,
      offsetX: camera.offsetX,
      offsetY: camera.offsetY,
      zoomFactor: Number(camera.zoomFactor),
      previewPanX: Number(camera.previewPanX),
      previewPanY: Number(camera.previewPanY),
      previewRotation: Number(camera.previewRotation),
    };
  }

  private toRoiProfiles(regions: ProductWithProfile['roiRegions']) {
    if (regions.length === 0) {
      return [];
    }

    return regions.map((region) => ({
      index: region.index,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      rotation: Number(region.rotation),
    }));
  }

  private roiRegionsOverlap(first: RoiRegionDto, second: RoiRegionDto) {
    const firstCorners = this.getRegionCorners(first);
    const secondCorners = this.getRegionCorners(second);
    const axes = [
      ...this.getSeparatingAxes(firstCorners),
      ...this.getSeparatingAxes(secondCorners),
    ];

    return axes.every((axis) => {
      const firstProjection = this.projectCorners(firstCorners, axis);
      const secondProjection = this.projectCorners(secondCorners, axis);

      return (
        firstProjection.max > secondProjection.min &&
        secondProjection.max > firstProjection.min
      );
    });
  }

  private getRegionCorners(region: RoiRegionDto) {
    const radians = (region.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const halfWidth = region.width / 2;
    const halfHeight = region.height / 2;

    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((point) => ({
      x: region.x + point.x * cos - point.y * sin,
      y: region.y + point.x * sin + point.y * cos,
    }));
  }

  private getSeparatingAxes(corners: Array<{ x: number; y: number }>) {
    return [0, 1].map((index) => {
      const current = corners[index];
      const next = corners[index + 1];
      const edge = { x: next.x - current.x, y: next.y - current.y };
      const axis = { x: -edge.y, y: edge.x };
      const length = Math.hypot(axis.x, axis.y) || 1;

      return { x: axis.x / length, y: axis.y / length };
    });
  }

  private projectCorners(
    corners: Array<{ x: number; y: number }>,
    axis: { x: number; y: number },
  ) {
    const values = corners.map(
      (corner) => corner.x * axis.x + corner.y * axis.y,
    );

    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  private toProductProfile(product: ProductWithProfile) {
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      defaultNumber: product.defaultNumber,
      batchSize: product.batchSize,
      exposure: product.exposure,
      thresholdAccept: Number(product.thresholdAccept),
      thresholdMns: Number(product.thresholdMns),
      modelPath: product.modelPath,
      rotateTestImageClockwise: product.rotateTestImageClockwise,
      active: product.active,
      camera: this.toCameraProfile(product.cameraConfig),
      roiRegions: this.toRoiProfiles(product.roiRegions),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
