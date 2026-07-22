import ExcelJS from 'exceljs';
import { PrismaService } from '../database/prisma.service';
import { ProductImportService } from './product-import.service';

describe('ProductImportService', () => {
  it('creates a two-column XLSX template', async () => {
    const service = new ProductImportService({} as PrismaService);

    const buffer = await service.createTemplate('vi');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );

    const sheet = workbook.worksheets[0];
    expect(sheet.columnCount).toBe(2);
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Mã sản phẩm',
      'Link model',
    ]);
  });

  it('updates existing codes and creates new products with defaults', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(['Product code', 'Model link']);
    sheet.addRow(['EXISTING', 'C:\\Models\\existing.pt']);
    sheet.addRow(['NEW-CODE', 'C:\\Models\\new.pt']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    type ProductWriteArgs = {
      data: {
        code?: string;
        name?: string;
        modelPath: string;
        batchSize?: number;
        cameraConfig?: {
          create: { imageWidth: number; imageHeight: number };
        };
      };
      where?: { id: string };
    };
    const update = jest
      .fn<Promise<unknown>, [ProductWriteArgs]>()
      .mockResolvedValue({});
    const create = jest
      .fn<Promise<unknown>, [ProductWriteArgs]>()
      .mockResolvedValue({});
    const prisma = {
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'product-1', code: 'EXISTING', name: 'EXISTING' },
          ]),
      },
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<void>) =>
        operation({ product: { update, create } }),
      ),
    } as unknown as PrismaService;
    const service = new ProductImportService(prisma);

    const result = await service.importWorkbook(buffer);

    expect(result.data).toEqual({
      totalCount: 2,
      createdCount: 1,
      updatedCount: 1,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { modelPath: 'C:\\Models\\existing.pt' },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const createData = create.mock.calls[0][0].data;
    expect(createData.code).toBe('NEW-CODE');
    expect(createData.name).toBe('NEW-CODE');
    expect(createData.modelPath).toBe('C:\\Models\\new.pt');
    expect(createData.batchSize).toBe(160);
    expect(createData.cameraConfig?.create).toMatchObject({
      imageWidth: 1500,
      imageHeight: 500,
    });
  });

  it('reads a model path from hyperlink text containing rich text segments', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    sheet.addRow(['Product code', 'Model link']);
    sheet.getCell('A2').value = 'RICH-PATH';
    sheet.getCell('B2').value = {
      text: {
        richText: [
          { text: 'C:\\Models\\' },
          {
            font: { color: { argb: 'FF1155CC' }, underline: true },
            text: 'rich-model.pt',
          },
        ],
      },
      hyperlink: 'http://rich-model.pt/',
    } as unknown as ExcelJS.CellValue;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    type ProductCreateArgs = {
      data: { code: string; modelPath: string };
    };
    const create = jest
      .fn<Promise<unknown>, [ProductCreateArgs]>()
      .mockResolvedValue({});
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<void>) =>
        operation({ product: { update: jest.fn(), create } }),
      ),
    } as unknown as PrismaService;
    const service = new ProductImportService(prisma);

    await service.importWorkbook(buffer);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      code: 'RICH-PATH',
      modelPath: 'C:\\Models\\rich-model.pt',
    });
  });
});
