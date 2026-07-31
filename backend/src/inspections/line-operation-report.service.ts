import { BadRequestException, Injectable } from '@nestjs/common';
import { InspectionResult } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../database/prisma.service';

export type LineReportGroupBy = 'day' | 'month' | 'year';

type LineReportQuery = {
  from: Date;
  to: Date;
  groupBy: LineReportGroupBy;
};

@Injectable()
export class LineOperationReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(from?: string, to?: string, groupBy?: string) {
    const query = this.parseQuery(from, to, groupBy);
    const data = await this.loadReportData(query);
    return {
      data: {
        from: query.from.toISOString(),
        to: query.to.toISOString(),
        groupBy: query.groupBy,
        totals: data.totals,
        groups: data.groups,
      },
    };
  }

  async exportWorkbook(from?: string, to?: string, groupBy?: string) {
    const query = this.parseQuery(from, to, groupBy);
    const data = await this.loadReportData(query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Metalcore washing';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    summary.addRows([
      { metric: 'From', value: query.from.toISOString() },
      { metric: 'To', value: query.to.toISOString() },
      { metric: 'Sessions', value: data.totals.sessions },
      { metric: 'Latched results', value: data.totals.results },
      { metric: 'OK results', value: data.totals.ok },
      { metric: 'NG results', value: data.totals.ng },
      { metric: 'UNKNOWN results', value: data.totals.unknown },
      { metric: 'ROI records', value: data.totals.rois },
    ]);

    const grouped = workbook.addWorksheet('Statistics');
    grouped.columns = [
      { header: 'Period', key: 'period', width: 20 },
      { header: 'Sessions', key: 'sessions', width: 14 },
      { header: 'Results', key: 'results', width: 14 },
      { header: 'OK', key: 'ok', width: 14 },
      { header: 'NG', key: 'ng', width: 14 },
      { header: 'UNKNOWN', key: 'unknown', width: 14 },
    ];
    grouped.addRows(data.groups);

    const results = workbook.addWorksheet('Results');
    results.columns = [
      { header: 'Capture ID', key: 'captureId', width: 38 },
      { header: 'Session ID', key: 'jobId', width: 30 },
      { header: 'Product code', key: 'productCode', width: 22 },
      { header: 'Started by', key: 'startedBy', width: 22 },
      { header: 'Ended by', key: 'endedBy', width: 22 },
      { header: 'End operator inferred', key: 'endedByInferred', width: 22 },
      { header: 'Captured at', key: 'capturedAt', width: 26 },
      { header: 'Result', key: 'result', width: 14 },
      { header: 'Detected text', key: 'text', width: 50 },
      { header: 'Image path', key: 'imagePath', width: 60 },
      { header: 'Session started', key: 'startedAt', width: 26 },
      { header: 'Session stopped', key: 'stoppedAt', width: 26 },
      { header: 'End reason', key: 'endReason', width: 20 },
    ];
    results.addRows(data.results);

    const rois = workbook.addWorksheet('ROI details');
    rois.columns = [
      { header: 'Capture ID', key: 'captureId', width: 38 },
      { header: 'Session ID', key: 'jobId', width: 30 },
      { header: 'Product code', key: 'productCode', width: 22 },
      { header: 'Captured at', key: 'capturedAt', width: 26 },
      { header: 'ROI', key: 'slotIndex', width: 10 },
      { header: 'Expected', key: 'expectedText', width: 24 },
      { header: 'Detected', key: 'text', width: 40 },
      { header: 'Result', key: 'result', width: 14 },
      { header: 'Error', key: 'errorMessage', width: 40 },
      { header: 'Image path', key: 'imagePath', width: 60 },
    ];
    rois.addRows(data.rois);

    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      if (sheet.columnCount > 0) {
        sheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: sheet.columnCount },
        };
      }
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private parseQuery(from?: string, to?: string, groupBy?: string) {
    const parsedFrom = from ? new Date(from) : new Date();
    const parsedTo = to ? new Date(to) : new Date();
    if (!from) parsedFrom.setHours(0, 0, 0, 0);
    if (!to) parsedTo.setDate(parsedTo.getDate() + 1);
    if (
      Number.isNaN(parsedFrom.getTime()) ||
      Number.isNaN(parsedTo.getTime()) ||
      parsedFrom >= parsedTo
    ) {
      throw new BadRequestException('Invalid line report date range');
    }
    const safeGroupBy: LineReportGroupBy =
      groupBy === 'month' || groupBy === 'year' ? groupBy : 'day';
    return { from: parsedFrom, to: parsedTo, groupBy: safeGroupBy };
  }

  private async loadReportData(query: LineReportQuery) {
    const logs = await this.prisma.inspectionLog.findMany({
      where: {
        plcCaptureId: { not: null },
        capturedAt: { gte: query.from, lt: query.to },
      },
      orderBy: [{ capturedAt: 'asc' }, { slotIndex: 'asc' }],
      include: {
        job: {
          include: {
            endedBy: { select: { username: true, fullName: true } },
            operator: { select: { username: true, fullName: true } },
          },
        },
      },
    });
    const productIds = Array.from(
      new Set(logs.map((log) => log.job.productId)),
    );
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, code: true },
    });
    const productCodes = new Map(
      products.map((product) => [product.id, product.code]),
    );
    const resultGroups = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = log.plcCaptureId!;
      const group = resultGroups.get(key) ?? [];
      group.push(log);
      resultGroups.set(key, group);
    }

    const results = Array.from(resultGroups.values()).map((group) => {
      const first = group[0];
      const result = this.aggregateResult(group.map((item) => item.result));
      return {
        captureId: first.plcCaptureId!,
        jobId: first.jobId,
        productCode:
          productCodes.get(first.job.productId) ?? first.job.productId,
        startedBy: first.job.operator.fullName || first.job.operator.username,
        endedBy:
          first.job.endedBy?.fullName ||
          first.job.endedBy?.username ||
          first.job.operator.fullName ||
          first.job.operator.username,
        endedByInferred: first.job.endedByInferred ? 'Yes' : 'No',
        capturedAt: first.capturedAt.toISOString(),
        result,
        text: group
          .map((item) => item.text)
          .filter(Boolean)
          .join(' | '),
        imagePath: group.find((item) => item.imagePath)?.imagePath ?? '',
        startedAt: first.job.startedAt?.toISOString() ?? '',
        stoppedAt: first.job.stoppedAt?.toISOString() ?? '',
        endReason: first.job.endReason ?? '',
      };
    });
    const periods = new Map<
      string,
      {
        period: string;
        sessions: Set<string>;
        results: number;
        ok: number;
        ng: number;
        unknown: number;
      }
    >();
    for (const result of results) {
      const period = this.periodKey(new Date(result.capturedAt), query.groupBy);
      const current = periods.get(period) ?? {
        period,
        sessions: new Set<string>(),
        results: 0,
        ok: 0,
        ng: 0,
        unknown: 0,
      };
      current.sessions.add(result.jobId);
      current.results += 1;
      if (result.result === 'OK') current.ok += 1;
      else if (result.result === 'NG') current.ng += 1;
      else current.unknown += 1;
      periods.set(period, current);
    }

    const rois = logs.map((log) => ({
      captureId: log.plcCaptureId!,
      jobId: log.jobId,
      productCode: productCodes.get(log.job.productId) ?? log.job.productId,
      capturedAt: log.capturedAt.toISOString(),
      slotIndex: log.slotIndex ?? '',
      expectedText: log.expectedText ?? '',
      text: log.text ?? '',
      result: log.result,
      errorMessage: log.errorMessage ?? '',
      imagePath: log.imagePath ?? '',
    }));
    const sessionIds = new Set(results.map((result) => result.jobId));
    return {
      totals: {
        sessions: sessionIds.size,
        results: results.length,
        ok: results.filter((result) => result.result === 'OK').length,
        ng: results.filter((result) => result.result === 'NG').length,
        unknown: results.filter((result) => result.result === 'UNKNOWN').length,
        rois: logs.length,
      },
      groups: Array.from(periods.values()).map((period) => ({
        period: period.period,
        sessions: period.sessions.size,
        results: period.results,
        ok: period.ok,
        ng: period.ng,
        unknown: period.unknown,
      })),
      results,
      rois,
    };
  }

  private aggregateResult(results: InspectionResult[]) {
    if (results.includes(InspectionResult.NG)) return 'NG' as const;
    if (results.includes(InspectionResult.OK)) return 'OK' as const;
    return 'UNKNOWN' as const;
  }

  private periodKey(value: Date, groupBy: LineReportGroupBy) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    const year = part('year');
    const month = part('month');
    if (groupBy === 'year') return year;
    if (groupBy === 'month') return `${year}-${month}`;
    return `${year}-${month}-${part('day')}`;
  }
}
