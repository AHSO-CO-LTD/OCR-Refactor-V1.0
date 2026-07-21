import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../database/prisma.service';

type ImportRow = {
  rowNumber: number;
  code: string;
  modelPath: string;
};

@Injectable()
export class ProductImportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTemplate(language: 'en' | 'vi') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(
      language === 'vi' ? 'Sản phẩm' : 'Products',
    );
    sheet.columns = [
      {
        header: language === 'vi' ? 'Mã sản phẩm' : 'Product code',
        key: 'code',
        width: 24,
      },
      {
        header: language === 'vi' ? 'Link model' : 'Model link',
        key: 'modelPath',
        width: 56,
      },
    ];
    sheet.addRow({
      code: 'IS-35R',
      modelPath: 'C:\\Models\\IS-35R.pt',
    });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'B1' };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importWorkbook(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    } catch {
      throw new BadRequestException('Invalid XLSX product import file');
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('XLSX workbook has no worksheet');
    const headerIndexes = this.resolveHeaderIndexes(sheet.getRow(1));
    const rows: ImportRow[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = this.cellText(row.getCell(headerIndexes.code)).trim();
      const modelPath = this.cellText(
        row.getCell(headerIndexes.modelPath),
      ).trim();
      if (!code && !modelPath) return;
      if (!code || !modelPath) {
        throw new BadRequestException(
          `Row ${rowNumber} requires both product code and model link`,
        );
      }
      rows.push({ rowNumber, code, modelPath });
    });

    if (rows.length === 0) {
      throw new BadRequestException('Product import file has no data rows');
    }

    const normalizedCodes = rows.map((row) => row.code.toLocaleLowerCase());
    if (new Set(normalizedCodes).size !== normalizedCodes.length) {
      throw new BadRequestException(
        'Product codes in the import file must be unique',
      );
    }

    const codes = rows.map((row) => row.code);
    const existing = await this.prisma.product.findMany({
      where: { OR: [{ code: { in: codes } }, { name: { in: codes } }] },
      select: { id: true, code: true, name: true },
    });
    const existingByCode = new Map(existing.map((item) => [item.code, item]));
    for (const row of rows) {
      const conflictingName = existing.find(
        (item) => item.name === row.code && item.code !== row.code,
      );
      if (conflictingName) {
        throw new BadRequestException(
          `Row ${row.rowNumber}: product name ${row.code} is already used`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const current = existingByCode.get(row.code);
        if (current) {
          await tx.product.update({
            where: { id: current.id },
            data: { modelPath: row.modelPath },
          });
          continue;
        }

        await tx.product.create({
          data: {
            code: row.code,
            name: row.code,
            defaultNumber: 160,
            batchSize: 160,
            exposure: 3500,
            thresholdAccept: 0.5,
            thresholdMns: 0.5,
            rowThreshold: 20,
            modelPath: row.modelPath,
            rotateTestImageClockwise: true,
            active: true,
            cameraConfig: {
              create: {
                sourceType: 'usb',
                deviceName: 'Camera 1',
                exposure: 3500,
                imageWidth: 1500,
                imageHeight: 500,
                offsetX: 0,
                offsetY: 0,
                zoomFactor: 0.4,
                previewPanX: 0,
                previewPanY: 0,
                previewRotation: 0,
              },
            },
          },
        });
      }
    });

    const updatedCount = rows.filter((row) =>
      existingByCode.has(row.code),
    ).length;
    return {
      data: {
        totalCount: rows.length,
        createdCount: rows.length - updatedCount,
        updatedCount,
      },
    };
  }

  private resolveHeaderIndexes(row: ExcelJS.Row) {
    let code = 0;
    let modelPath = 0;
    row.eachCell((cell, columnNumber) => {
      const header = this.normalizeHeader(this.cellText(cell));
      if (['ma san pham', 'product code', 'code'].includes(header)) {
        code = columnNumber;
      }
      if (['link model', 'model link', 'model path'].includes(header)) {
        modelPath = columnNumber;
      }
    });
    if (!code || !modelPath) {
      throw new BadRequestException(
        'XLSX requires Product code and Model link columns',
      );
    }
    return { code, modelPath };
  }

  private normalizeHeader(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase();
  }

  private cellText(cell: ExcelJS.Cell) {
    if (typeof cell.value === 'string' || typeof cell.value === 'number') {
      return String(cell.value);
    }
    if (cell.value && typeof cell.value === 'object') {
      if ('text' in cell.value) return String(cell.value.text ?? '');
      if ('result' in cell.value) {
        const result: unknown = cell.value.result;
        if (
          typeof result === 'string' ||
          typeof result === 'number' ||
          typeof result === 'boolean'
        ) {
          return String(result);
        }
      }
    }
    return cell.text ?? '';
  }
}
